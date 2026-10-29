#!/usr/bin/env python3
"""Clean OCR records and write matching data/ and public/data/ JSON files."""

import json
import os
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_FILE = os.path.join(BASE_DIR, "data", "advanced_maths_questions.json")
OUTPUTS = [
    os.path.join(BASE_DIR, "data", "advanced_maths_questions.json"),
    os.path.join(BASE_DIR, "public", "data", "advanced_maths_questions.json"),
]


def chapter_name(source_file):
    name = os.path.splitext(os.path.basename(source_file))[0]
    name = re.sub(r"^\d+\s*_\s*", "", name)
    name = re.sub(r"\s*\(PART[^)]*\)", "", name, flags=re.I)
    name = re.sub(r"\s*DPP\s*0?1?", "", name, flags=re.I)
    name = re.sub(r"\s*\(?(?:English)\)?", "", name, flags=re.I)
    name = re.sub(r"\s*Solution Notes?", "", name, flags=re.I)
    name = re.sub(r"\s+", " ", name).strip(" _-()")
    if name.lower() == "lcm hcf":
        return "LCM HCF"
    return name.title()


def split_options(text):
    marker = re.compile(r"(?<!\w)\(([A-D])\)\s*", re.I)
    matches = list(marker.finditer(text))
    if len(matches) != 4 or [m.group(1).upper() for m in matches] != list("ABCD"):
        return text.strip(), []
    choices = []
    for i, match in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        choice = re.sub(r"\s+", " ", text[match.end():end]).strip(" \n|;,")
        if not choice:
            return text.strip(), []
        choices.append(choice)
    question = text[:matches[0].start()].strip()
    return question or text.strip(), choices


def is_question_content(text, file_name):
    lowered = text.lower()
    if re.search(r"(?i)\b(?:android app|ios app|pw website|customer service)\b", text):
        text = re.sub(r"(?i)\b(?:android app|ios app|pw website|customer service)\b", "", text)
        lowered = text.lower()
    if re.search(r"(?i)\b(?:q|o)\s*\d{1,3}\b|#\s*q\b", text):
        return True
    has_math = bool(re.search(r"[=+\-×÷√^%<>]", text) and re.search(r"\d", text))
    if has_math and re.search(r"(?i)\b(?:find|value|simplify|solve|evaluate|which|what|if|then|area|perimeter|volume|length|radius|angle|prove)\b", text):
        return True
    # Handwritten maths may be recognized as symbols without question words.
    math_symbols = re.findall(r"[=+\-×÷√^%<>]", text)
    digits = re.findall(r"\d", text)
    return len(text.strip()) >= 18 and len(math_symbols) >= 2 and len(digits) >= 2


def main():
    with open(INPUT_FILE, "r", encoding="utf-8") as source:
        raw = json.load(source)

    questions = []
    poor_pages = set()
    for item in raw["questions"]:
        source = item.get("source", {})
        source.pop("image", None)
        text = (item.get("question") or "").strip()
        if not text or not is_question_content(text, source.get("file", "")):
            continue
        confidence = float(source.get("ocrConfidence") or 0)
        if confidence < 45:
            text = "[unclear] " + text
            poor_pages.add((source.get("file"), source.get("page")))
        question, options = split_options(text)
        questions.append({
            "id": f"adv_math_{len(questions) + 1:05d}",
            "subject": "Quantitative Aptitude",
            "subSubject": "Advanced Maths",
            "chapter": chapter_name(source.get("file", "")),
            "question": question,
            "options": options,
            "correctAnswer": None,
            "explanation": "",
            "source": source,
        })

    result = {
        "subject": "Quantitative Aptitude",
        "subSubject": "Advanced Maths",
        "sourcePdfCount": raw["sourcePdfCount"],
        "pagesProcessed": raw["pagesProcessed"],
        "totalQuestions": len(questions),
        "questions": questions,
    }
    for output_path in OUTPUTS:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as output:
            json.dump(result, output, ensure_ascii=False, separators=(",", ":"))
            output.write("\n")
    print(f"Questions retained: {len(questions)}")
    print(f"Pages flagged [unclear] (OCR confidence <45): {len(poor_pages)}")
    print(f"Wrote matching JSON files: {OUTPUTS[0]} and {OUTPUTS[1]}")


if __name__ == "__main__":
    main()
