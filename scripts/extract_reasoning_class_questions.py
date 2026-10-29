#!/usr/bin/env python3
"""Extract question text and source-page images from the Reasoning Class PDFs."""

import base64
import csv
import glob
import io
import json
import os
import re
import subprocess
import tempfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image
from pypdf import PdfReader

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_DIR = "/Users/hiijitesh/Downloads/Govt Exams & RRB/A RRB NOTES/CLASS NOTES/REASONING CLASS PPT"
TESSERACT = "/opt/homebrew/bin/tesseract"
PDFTOPPM = "/Users/hiijitesh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm"
OUTPUTS = [
    os.path.join(BASE_DIR, "data", "reasoning_class_questions.json"),
    os.path.join(BASE_DIR, "public", "data", "reasoning_class_questions.json"),
]


def chapter_name(pdf_path):
    name = os.path.splitext(os.path.basename(pdf_path))[0]
    name = re.sub(r"^Reasoning\s*\d*\s*[_-]*\s*", "", name, flags=re.I)
    name = re.sub(r"\s*[-_]\s*DPP.*$", "", name, flags=re.I)
    name = re.sub(r"\s*_\s*DPP.*$", "", name, flags=re.I)
    name = re.sub(r"\s*DPP\s*01.*$", "", name, flags=re.I)
    name = re.sub(r"\s*Solution Notes.*$", "", name, flags=re.I)
    return re.sub(r"\s+", " ", name).strip(" _-") or "General Reasoning"


def read_tsv(tsv):
    rows = csv.DictReader(io.StringIO(tsv), delimiter="\t")
    lines = defaultdict(list)
    confs = []
    for row in rows:
        word = (row.get("text") or "").strip()
        if not word:
            continue
        key = tuple(row.get(k, "") for k in ("block_num", "par_num", "line_num"))
        lines[key].append(word)
        try:
            value = float(row.get("conf", "-1"))
            if value >= 0:
                confs.append(value)
        except ValueError:
            pass
    text = "\n".join(" ".join(words) for _, words in sorted(lines.items())).strip()
    return text, round(sum(confs) / len(confs), 1) if confs else 0


def is_question_page(text):
    if len(text.strip()) < 5:
        return False
    return bool(re.search(
        r"(?i)(\bQ\s*\d+\b|\b(?:which|what|who|when|where|how|find|select|choose|identify|determine|statement|conclusion|number|figure|series|arrange|relation|odd one)\b|[=+*/?<>])",
        text,
    ))


def split_questions(text):
    marks = list(re.finditer(r"(?i)(?<!\w)(?:Q|O)\s*(\d{1,3})\b", text))
    if len(marks) < 2:
        return [(int(marks[0].group(1)) if marks else None, text.strip())]
    result = []
    for index, mark in enumerate(marks):
        end = marks[index + 1].start() if index + 1 < len(marks) else len(text)
        chunk = text[mark.start():end].strip()
        if chunk:
            result.append((int(mark.group(1)), chunk))
    return result


def options_from(text):
    # Preserve option text only when all four labels are detected in the OCR.
    marks = list(re.finditer(r"(?i)(?:^|\s)\(([A-D])\)\s*", text))
    by_letter = {}
    for idx, mark in enumerate(marks):
        end = marks[idx + 1].start() if idx + 1 < len(marks) else len(text)
        value = re.sub(r"\s+", " ", text[mark.end():end]).strip()
        by_letter.setdefault(mark.group(1).upper(), value)
    if all(letter in by_letter for letter in "ABCD"):
        return [by_letter[letter] for letter in "ABCD"]
    return []


def make_page_jpeg(image_path):
    image = Image.open(image_path).convert("RGB")
    thumb = image.copy()
    thumb.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    thumb.save(buffer, format="JPEG", quality=70, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def extract_page(page_no, embedded_text, image_path, temp_dir):
    text = embedded_text.strip()
    confidence = None
    image_uri = None
    if len(text) < 80:
        if not image_path:
            return page_no, "", 0, None
        image = Image.open(image_path).convert("RGB")
        sample = image.resize((1, 1)).getpixel((0, 0))
        dark = sum(sample) / 3 < 110
        if dark:
            rgb = np.asarray(image)
            red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
            ink = (red > 115) & (green > 90) & (blue < 175) & (red > green * 0.78)
            ocr_image = Image.fromarray(np.where(ink, 0, 255).astype(np.uint8), mode="L")
            psm = "11"
        else:
            ocr_image = image.convert("L")
            psm = "6"
        if ocr_image.width < 2200:
            scale = 2200 / ocr_image.width
            ocr_image = ocr_image.resize((2200, int(ocr_image.height * scale)), Image.Resampling.LANCZOS)
        ocr_path = os.path.join(temp_dir, f"ocr-{page_no}.png")
        ocr_image.save(ocr_path)
        proc = subprocess.run(
            [TESSERACT, ocr_path, "stdout", "-l", "eng", "--psm", psm, "tsv"],
            check=True, capture_output=True, text=True,
        )
        text, confidence = read_tsv(proc.stdout)
        if not text:
            return page_no, "", confidence, None
    if not is_question_page(text):
        return page_no, "", confidence, None
    if image_path:
        image_uri = make_page_jpeg(image_path)
    return page_no, text, confidence, image_uri


def main():
    pdf_files = sorted(glob.glob(os.path.join(SOURCE_DIR, "**", "*.pdf"), recursive=True))
    all_questions = []
    images = {}
    total_pages = 0
    question_id = 1

    for pdf_index, pdf_path in enumerate(pdf_files, 1):
        reader = PdfReader(pdf_path)
        rel_path = os.path.relpath(pdf_path, SOURCE_DIR)
        chapter = chapter_name(pdf_path)
        page_total = len(reader.pages)
        total_pages += page_total
        print(f"[{pdf_index}/{len(pdf_files)}] {rel_path} ({page_total} pages)", flush=True)

        with tempfile.TemporaryDirectory(prefix="reasoning-class-ocr-") as temp_dir:
            prefix = os.path.join(temp_dir, "page")
            rendered = {}
            subprocess.run(
                [PDFTOPPM, "-jpeg", "-jpegopt", "quality=92", "-r", "150", pdf_path, prefix],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            for image_path in glob.glob(prefix + "-*.jpg"):
                match = re.search(r"-(\d+)\.jpg$", image_path)
                if match:
                    rendered[int(match.group(1))] = image_path

            jobs = [
                (page_no, page.extract_text() or "", rendered.get(page_no), temp_dir)
                for page_no, page in enumerate(reader.pages, 1)
            ]
            with ThreadPoolExecutor(max_workers=4) as pool:
                page_results = list(pool.map(lambda job: extract_page(*job), jobs))

            for page_no, text, confidence, image_uri in page_results:
                if not text:
                    continue
                image_id = None
                if image_uri:
                    image_id = f"reasoning_page_{len(images) + 1:05d}"
                    images[image_id] = image_uri

                for number, stem in split_questions(text):
                    all_questions.append({
                        "id": f"reasoning_class_{question_id:05d}",
                        "subject": "Reasoning",
                        "subSubject": chapter,
                        "chapter": chapter,
                        "question": stem,
                        "options": options_from(stem),
                        "correctAnswer": None,
                        "explanation": "",
                        "source": {
                            "file": rel_path,
                            "page": page_no,
                            "questionNumber": number,
                            "ocrConfidence": confidence,
                            "imageId": image_id,
                        },
                    })
                    question_id += 1

        print(f"  Total question records so far: {len(all_questions)}", flush=True)

    result = {
        "subject": "Reasoning",
        "sourceDirectory": SOURCE_DIR,
        "sourcePdfCount": len(pdf_files),
        "pagesProcessed": total_pages,
        "totalQuestions": len(all_questions),
        "images": images,
        "extractionNote": "Scanned handwritten slides were OCR processed. Review low-confidence transcriptions against the corresponding base64 page image. Answers are left null unless explicitly keyed in the source.",
        "questions": all_questions,
    }
    for output_path in OUTPUTS:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as output:
            json.dump(result, output, ensure_ascii=False, separators=(",", ":"))
            output.write("\n")
        print(f"Wrote {len(all_questions)} questions to {output_path} ({os.path.getsize(output_path)} bytes)", flush=True)


if __name__ == "__main__":
    main()
