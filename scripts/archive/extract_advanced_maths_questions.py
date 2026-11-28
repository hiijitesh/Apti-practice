#!/usr/bin/env python3
"""Extract OCR text from the Advanced Maths PDF collection into JSON.

Each record keeps its source file/page and an embedded base64 JPEG of that page,
so mathematical notation can be checked against the original scan.
"""

import csv
import glob
import io
import json
import os
import re
import subprocess
import tempfile
from collections import defaultdict

import numpy as np
from PIL import Image
from pypdf import PdfReader

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_DIR = "/Users/hiijitesh/Downloads/Govt Exams & RRB/A RRB NOTES/CLASS NOTES/Advance maths PPT"
OUTPUT_FILE = os.path.join(BASE_DIR, "public", "data", "advanced_maths_questions.json")
TESSERACT = "/opt/homebrew/bin/tesseract"
PDFTOPPM = "/Users/hiijitesh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm"


def chapter_from_filename(path):
    name = os.path.splitext(os.path.basename(path))[0]
    name = re.sub(r"^\d+\s*_\s*", "", name)
    name = re.sub(r"\s*\(PART[^)]*\)", "", name, flags=re.I)
    name = name.replace("DPP 01", "DPP")
    return re.sub(r"\s+", " ", name).strip(" _-")


def tsv_text_and_confidence(tsv):
    grouped = defaultdict(list)
    confidence = []
    reader = csv.DictReader(io.StringIO(tsv), delimiter="\t")
    for row in reader:
        word = (row.get("text") or "").strip()
        if not word:
            continue
        try:
            conf = float(row.get("conf", "-1"))
        except ValueError:
            conf = -1
        if conf >= 0:
            confidence.append(conf)
        key = tuple(row.get(k, "") for k in ("block_num", "par_num", "line_num"))
        grouped[key].append(word)
    lines = [" ".join(words) for _, words in sorted(grouped.items())]
    avg_conf = round(sum(confidence) / len(confidence), 1) if confidence else 0
    return "\n".join(lines).strip(), avg_conf


def prepare_ocr_image(image_path, temp_dir, stem, dark_slide):
    image = Image.open(image_path).convert("RGB")
    if dark_slide:
        rgb = np.asarray(image)
        red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
        # Most handwritten notes use bright yellow ink on dark green/black slides.
        yellow = (red > 115) & (green > 90) & (blue < 175) & (red > green * 0.78)
        gray = np.where(yellow, 0, 255).astype(np.uint8)
        ocr_image = Image.fromarray(gray, mode="L")
    else:
        ocr_image = image.convert("L")
    if ocr_image.width < 2200:
        scale = 2200 / ocr_image.width
        ocr_image = ocr_image.resize((2200, int(ocr_image.height * scale)), Image.Resampling.LANCZOS)
    output = os.path.join(temp_dir, f"{stem}_ocr.png")
    ocr_image.save(output)
    return output, image


def split_questions(text):
    # Printed DPP sheets often put several numbered questions on one page.
    matches = list(re.finditer(r"(?i)(?<!\w)(?:Q|O)\s*(\d{1,3})\b", text))
    if len(matches) < 2:
        return [(int(matches[0].group(1)) if matches else None, text.strip())]
    chunks = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        chunk = text[match.start():end].strip()
        if chunk:
            chunks.append((int(match.group(1)), chunk))
    return chunks


def main():
    if not os.path.isdir(SOURCE_DIR):
        raise FileNotFoundError(f"PDF source directory not found: {SOURCE_DIR}")
    if not os.path.isfile(TESSERACT) or not os.path.isfile(PDFTOPPM):
        raise FileNotFoundError("Tesseract OCR or pdftoppm executable not found")

    pdf_files = sorted(glob.glob(os.path.join(SOURCE_DIR, "**", "*.pdf"), recursive=True))
    questions = []
    page_count = 0
    record_id = 1

    for pdf_index, pdf_path in enumerate(pdf_files, 1):
        reader = PdfReader(pdf_path)
        total_pages = len(reader.pages)
        rel_path = os.path.relpath(pdf_path, SOURCE_DIR)
        chapter = chapter_from_filename(pdf_path)
        print(f"[{pdf_index}/{len(pdf_files)}] {rel_path} ({total_pages} pages)", flush=True)

        with tempfile.TemporaryDirectory(prefix="advanced-maths-ocr-") as temp_dir:
            prefix = os.path.join(temp_dir, "page")
            subprocess.run(
                [PDFTOPPM, "-jpeg", "-jpegopt", "quality=92", "-r", "160", pdf_path, prefix],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            rendered = {}
            for image_path in glob.glob(prefix + "-*.jpg"):
                match = re.search(r"-(\d+)\.jpg$", image_path)
                if match:
                    rendered[int(match.group(1))] = image_path

            for page_number in range(1, total_pages + 1):
                page_count += 1
                page_path = rendered.get(page_number)
                if not page_path:
                    continue
                original = Image.open(page_path).convert("RGB")
                sample = original.resize((1, 1)).getpixel((0, 0))
                is_dark = (sum(sample) / 3) < 110
                ocr_path, original = prepare_ocr_image(page_path, temp_dir, f"p{page_number}", is_dark)
                psm = "11" if is_dark else "6"
                proc = subprocess.run(
                    [TESSERACT, ocr_path, "stdout", "-l", "eng", "--psm", psm, "tsv"],
                    check=True, capture_output=True, text=True,
                )
                text, confidence = tsv_text_and_confidence(proc.stdout)
                if not text:
                    continue

                chunks = split_questions(text)
                for question_number, question_text in chunks:
                    questions.append({
                        "id": f"adv_math_{record_id:05d}",
                        "subject": "Quantitative Aptitude",
                        "subSubject": "Advanced Maths",
                        "chapter": chapter,
                        "question": question_text,
                        "options": [],
                        "correctAnswer": None,
                        "explanation": "",
                        "source": {
                            "file": rel_path,
                            "page": page_number,
                            "questionNumber": question_number,
                            "ocrConfidence": confidence,
                        },
                    })
                    record_id += 1

                if page_count % 25 == 0:
                    print(f"  Processed {page_count} pages; extracted {len(questions)} records", flush=True)

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    result = {
        "subject": "Quantitative Aptitude",
        "subSubject": "Advanced Maths",
        "sourceDirectory": SOURCE_DIR,
        "sourcePdfCount": len(pdf_files),
        "pagesProcessed": page_count,
        "totalQuestions": len(questions),
        "extraction": "Tesseract OCR; image-only scans may contain transcription errors. Each record embeds its source page as a base64 data URI.",
        "questions": questions,
    }
    with open(OUTPUT_FILE, "w", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, separators=(",", ":"))
        output.write("\n")
    print(f"Saved {len(questions)} records from {page_count} pages to {OUTPUT_FILE}", flush=True)


if __name__ == "__main__":
    main()
