#!/usr/bin/env python3
"""
scripts/extract_questions.py

Extracts aptitude questions from PDF files in ./source_pdfs/ (or current directory)
into ./public/data/questions.json following the structured schema:
[
  {
    "id": "ch1_q001",
    "chapter": "Chapter Name",
    "question": "Question text here (English only)",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0,
    "explanation": "Optional explanation or solution"
  }
]

Features:
- Strips all Hindi / Devanagari text and broken OCR artifacts
- Uses Complete Solutions PDFs for chapters with font dropouts (Ages, Discount)
- Ensures clean English-only question stems and options
"""

import os
import sys
import glob
import re
import json

try:
    import pypdf
except ImportError:
    print("Error: pypdf library not found. Please install it with: pip install pypdf")
    sys.exit(1)

# Chapter metadata configuration (ordered to avoid collisions like 'wages' containing 'ages')
CHAPTER_CONFIG = [
    ("work and wages", {"name": "Work & Wages", "slug": "wnw"}),
    ("work & wages", {"name": "Work & Wages", "slug": "wnw"}),
    ("ages", {"name": "Ages", "slug": "ages"}),
    ("average", {"name": "Average", "slug": "avg"}),
    ("boat", {"name": "Boat & Stream", "slug": "boat"}),
    ("compound", {"name": "Compound Interest", "slug": "ci"}),
    ("discount", {"name": "Discount", "slug": "disc"}),
    ("mixture", {"name": "Mixture & Alligation", "slug": "mix"}),
    ("partnership", {"name": "Partnership", "slug": "part"}),
    ("percentage", {"name": "Percentage", "slug": "pct"}),
    ("pipe", {"name": "Pipe & Cistern", "slug": "pipe"}),
    ("profit", {"name": "Profit & Loss", "slug": "pnl"}),
    ("race", {"name": "Race", "slug": "race"}),
    ("ratio", {"name": "Ratio & Proportion", "slug": "ratio"}),
    ("simple", {"name": "Simple Interest", "slug": "si"}),
    ("time & work", {"name": "Time & Work", "slug": "tnw"}),
    ("trains", {"name": "Trains", "slug": "train"}),
    ("tsd", {"name": "Time, Speed & Distance", "slug": "tsd"}),
]

# Image-verified answers for Percentage
PERCENTAGE_ANSWERS = {
    1: 'C', 2: 'B', 3: 'B', 4: 'B', 5: 'A', 6: 'B', 7: 'D', 8: 'C', 9: 'D', 10: 'A',
    11: 'B', 12: 'A', 13: 'D', 14: 'D', 15: 'B', 16: 'B', 17: 'B', 18: 'D', 19: 'C', 20: 'A',
    21: 'A', 22: 'B', 23: 'D', 24: 'A', 25: 'B', 26: 'A', 27: 'D', 28: 'C', 29: 'D', 30: 'A',
    31: 'B', 32: 'C', 33: 'C', 34: 'A', 35: 'A', 36: 'B', 37: 'B', 38: 'D', 39: 'B', 40: 'C',
    41: 'D', 42: 'A', 43: 'B', 44: 'B', 45: 'D', 46: 'A', 47: 'B', 48: 'B', 49: 'B', 50: 'A',
    51: 'C', 52: 'B', 53: 'A', 54: 'A', 55: 'C', 56: 'D', 57: 'D', 58: 'C', 59: 'B', 60: 'A',
    61: 'A', 62: 'D', 63: 'A', 64: 'A', 65: 'A', 66: 'D', 67: 'D', 68: 'A', 69: 'A', 70: 'C',
    71: 'D', 72: 'B', 73: 'D', 74: 'C', 75: 'B', 76: 'B', 77: 'A', 78: 'D', 79: 'C', 80: 'C',
    81: 'B', 82: 'B', 83: 'A', 84: 'B', 85: 'C', 86: 'D', 87: 'B', 88: 'B', 89: 'B', 90: 'B',
    91: 'A', 92: 'A', 93: 'C', 94: 'B', 95: 'B', 96: 'A', 97: 'C', 98: 'C', 99: 'D', 100: 'C',
    101: 'C', 102: 'A', 103: 'C', 104: 'B', 105: 'A', 106: 'C', 107: 'A', 108: 'D'
}

ANSWER_OVERRIDES = {
    "discount": {40: 'B'},
    "simple": {75: 'C'},
}

def identify_chapter(filename):
    """Determine chapter name and slug from PDF filename."""
    base = os.path.basename(filename).lower()
    for key, cfg in CHAPTER_CONFIG:
        if key in base:
            return cfg["name"], cfg["slug"]
    clean_name = re.sub(r'[\-_]?(?:All Questions|Complete Solutions?|\.pdf)', '', os.path.basename(filename), flags=re.I).strip()
    slug = re.sub(r'[^a-zA-Z0-9]+', '_', clean_name.lower()).strip('_')
    return clean_name, slug

def parse_answer_key(full_text, chap_key=""):
    """Parse answer key from text (usually at the end of the PDF)."""
    answers = {}
    if "pct" in chap_key.lower() or "percent" in chap_key.lower():
        answers.update(PERCENTAGE_ANSWERS)
        return answers
    
    for k, v in ANSWER_OVERRIDES.items():
        if k in chap_key.lower():
            answers.update(v)

    ak_match = re.search(r'Answer\s*Key\s*[:-]?(.*)', full_text, re.IGNORECASE | re.DOTALL)
    if ak_match:
        ak_text = ak_match.group(1)
        items = re.findall(r'(\d+)\s*[\.\:\-\)]\s*\(?([A-Da-d])\)?', ak_text)
        for q_str, ans_str in items:
            q_num = int(q_str)
            if q_num not in answers:
                answers[q_num] = ans_str.upper()
                
    return answers

def strip_all_hindi(text):
    """
    Remove all Hindi / Devanagari lines and characters,
    broken OCR spaces, and watermark noise. Returns clean English text.
    """
    if not text:
        return ""
    lines = text.split('\n')
    clean_lines = []
    for line in lines:
        l = line.strip()
        if not l:
            continue
        # Drop line if it contains any Devanagari characters
        if re.search(r'[\u0900-\u097F]', l):
            continue
        # Drop line if it looks like broken Hindi OCR artifacts (wide spaces, no English words >= 3 chars)
        if re.search(r'\s{4,}', l) and not re.search(r'[a-zA-Z]{3,}', l):
            continue
        # Drop line if it consists solely of punctuation or non-alphanumeric symbols
        if re.match(r'^[\s\.,:;\?!।_₹\-\(\)]+$', l):
            continue
        # Drop watermarks / footers / headers
        if re.search(r'Dixit\s*Sir|https?://|Solutions on|Page\s*\d+|^Type\s+\d+', l, re.I):
            continue
        clean_lines.append(l)

    joined = ' '.join(clean_lines)
    # Remove any stray isolated Devanagari characters
    joined = re.sub(r'[\u0900-\u097F]+', '', joined)
    # Collapse multiple spaces
    joined = re.sub(r'[ \t]+', ' ', joined).strip()
    return joined

def extract_options_and_stem(q_block):
    """
    Extracts clean English question stem, 4 options, and exam metadata.
    Completely removes Hindi translations.
    """
    # Locate option boundaries
    opt_pat = r'(?:^|[\n\r]|\s+)(?:\(([a-dA-D])\)|([A-Da-d])[\.\)])\s*'
    matches = list(re.finditer(opt_pat, q_block))

    best_combo = None
    for i in range(len(matches)):
        lbl_a = (matches[i].group(1) or matches[i].group(2)).upper()
        if lbl_a != 'A':
            continue
        lbls = ['A']
        selected = [matches[i]]
        for j in range(i + 1, len(matches)):
            lbl_next = (matches[j].group(1) or matches[j].group(2)).upper()
            if lbl_next == chr(ord(lbls[-1]) + 1):
                lbls.append(lbl_next)
                selected.append(matches[j])
                if len(lbls) == 4:
                    best_combo = selected
                    break
        if best_combo:
            break

    # If 4 options weren't found, try looking for 2 options (for comparison questions)
    if not best_combo:
        for i in range(len(matches)):
            lbl_a = (matches[i].group(1) or matches[i].group(2)).upper()
            if lbl_a != 'A':
                continue
            for j in range(i + 1, len(matches)):
                lbl_b = (matches[j].group(1) or matches[j].group(2)).upper()
                if lbl_b == 'B':
                    best_combo = [matches[i], matches[j]]
                    break
            if best_combo:
                break

    if best_combo and len(best_combo) >= 2:
        raw_stem = q_block[:best_combo[0].start()]
        stem = strip_all_hindi(raw_stem)

        options = []
        for k in range(len(best_combo) - 1):
            opt_val = q_block[best_combo[k].end():best_combo[k + 1].start()].strip()
            opt_val = strip_all_hindi(opt_val)
            options.append(opt_val or f"Option {chr(65 + k)}")

        last_opt = q_block[best_combo[-1].end():].strip()
        # Look for trailing exam metadata in the last option e.g. "SSC CGL 2022"
        exam_m = re.search(r'((?:SSC|Higher Secondary|Selection Post|CGL|CHSL|MTS|CPO|Tier|MOCK TEST)[^\n\r]*)$', last_opt, re.I)
        exam_tag = ""
        if exam_m:
            exam_tag = exam_m.group(1).strip()
            last_opt = last_opt[:exam_m.start()].strip()

        last_opt = strip_all_hindi(last_opt)
        options.append(last_opt or f"Option {chr(65 + len(best_combo) - 1)}")

        return stem, options, exam_tag
    else:
        # Fallback if options couldn't be strictly identified
        stem = strip_all_hindi(q_block)
        return stem, ["Option A", "Option B", "Option C", "Option D"], ""

def extract_from_solution_slides(sol_pdf_path, chap_name, chap_slug, answer_key):
    """
    Extracts questions directly from Solution slides.
    Used for chapters like Ages and Discount where 'All Questions.pdf' suffered
    from font dropouts in symbols/ratios (e.g. '2 : 1' or '20%').
    """
    reader = pypdf.PdfReader(sol_pdf_path)
    questions = []
    q_num = 1

    for p_idx in range(1, len(reader.pages)):
        raw = reader.pages[p_idx].extract_text() or ''
        if len(raw.strip()) < 30:
            continue

        stem, options, exam_tag = extract_options_and_stem(raw)
        # Strip leading question numbering like "Q.81." or "1."
        stem = re.sub(r'^(?:Q\.?\s*\d+[\.\)]|\d+[\.\)])\s*', '', stem.strip()).strip()

        if not stem:
            continue

        ans_letter = answer_key.get(q_num, 'A')
        letter_map = {'A': 0, 'B': 1, 'C': 2, 'D': 3}
        correct_idx = letter_map.get(ans_letter.upper(), 0)

        exp_parts = [f"Correct Answer: Option {ans_letter.upper()}"]
        if correct_idx < len(options) and options[correct_idx] != f"Option {ans_letter.upper()}":
            exp_parts.append(f"({options[correct_idx]})")
        if exam_tag:
            exp_parts.append(f"Exam: {exam_tag}")

        questions.append({
            "id": f"{chap_slug}_q{q_num:03d}",
            "chapter": chap_name,
            "question": stem,
            "options": options,
            "correctAnswer": correct_idx,
            "explanation": " | ".join(exp_parts)
        })
        q_num += 1

    return questions

def parse_pdf(pdf_path, pdf_dir):
    """Parses a chapter PDF into structured question objects."""
    chapter_name, chapter_slug = identify_chapter(pdf_path)
    print(f"-> Processing: {os.path.basename(pdf_path)} [{chapter_name}]")

    reader = pypdf.PdfReader(pdf_path)
    full_text = ""
    for p in reader.pages:
        full_text += p.extract_text() + "\n"

    ak_pos = re.search(r'Answer\s*Key\s*[:-]?', full_text, re.IGNORECASE)
    q_text = full_text[:ak_pos.start()] if ak_pos else full_text
    answer_key = parse_answer_key(full_text, chap_key=chapter_slug)

    # For Ages and Discount: 'All Questions.pdf' had known font dropouts
    # (e.g. 'was 2 : 1' became 'was    ', 'A and B' became '  and  ', '20%' became empty).
    # Their Complete Solutions slides have the complete, uncorrupted text.
    if chapter_slug in ("ages", "disc"):
        sol_filename = "Ages - Complete Solutions.pdf" if chapter_slug == "ages" else "Discount - Complete Solution.pdf"
        sol_path = os.path.join(pdf_dir, sol_filename)
        if not os.path.exists(sol_path):
            sol_path = sol_filename
        if os.path.exists(sol_path):
            print(f"   Using uncorrupted Complete Solutions slide deck for {chapter_name}...")
            return extract_from_solution_slides(sol_path, chapter_name, chapter_slug, answer_key)

    # Standard extraction from All Questions PDF
    curr_q = 1
    pos = 0
    q_locs = []
    while True:
        pattern = rf'(?:^|\n)\s*{curr_q}[\.\)]\s*'
        m = re.search(pattern, q_text[pos:])
        if not m:
            pattern2 = rf'\b{curr_q}[\.\)]\s*'
            m = re.search(pattern2, q_text[pos:])
            if not m:
                break
        q_locs.append((curr_q, pos + m.start(), pos + m.end()))
        pos = pos + m.end()
        curr_q += 1

    total_found = len(q_locs)
    questions = []

    for idx, (qnum, s, e) in enumerate(q_locs):
        nxt_s = q_locs[idx + 1][1] if idx + 1 < total_found else len(q_text)
        block = q_text[e:nxt_s]

        stem, options, exam_tag = extract_options_and_stem(block)
        clean_stem = re.sub(rf'^{qnum}[\.\)]\s*', '', stem.strip()).strip()

        ans_letter = answer_key.get(qnum, 'A')
        letter_map = {'A': 0, 'B': 1, 'C': 2, 'D': 3}
        correct_idx = letter_map.get(ans_letter.upper(), 0)

        exp_parts = [f"Correct Answer: Option {ans_letter.upper()}"]
        if correct_idx < len(options) and options[correct_idx] != f"Option {ans_letter.upper()}":
            exp_parts.append(f"({options[correct_idx]})")
        if exam_tag:
            exp_parts.append(f"Exam: {exam_tag}")

        questions.append({
            "id": f"{chapter_slug}_q{qnum:03d}",
            "chapter": chapter_name,
            "question": clean_stem or f"Question {qnum}",
            "options": options,
            "correctAnswer": correct_idx,
            "explanation": " | ".join(exp_parts)
        })

    return questions

def find_pdf_directory():
    candidates = [
        os.path.join(".", "source_pdfs"),
        os.path.join("..", "source_pdfs"),
        ".",
    ]
    for c in candidates:
        if os.path.exists(c):
            pdfs = [f for f in glob.glob(os.path.join(c, "*All Questions*.pdf"))]
            if pdfs:
                return c
    return "."

def main():
    pdf_dir = find_pdf_directory()
    print(f"Scanning for question PDFs in: {os.path.abspath(pdf_dir)}")

    pdf_pattern = os.path.join(pdf_dir, "*All Questions*.pdf")
    pdf_files = sorted(glob.glob(pdf_pattern))

    if not pdf_files:
        print(f"Error: No question PDFs found in {pdf_dir}")
        sys.exit(1)

    print(f"Found {len(pdf_files)} question PDFs to process.\n")

    all_questions = []
    chapter_stats = {}

    for pdf_path in pdf_files:
        try:
            qs = parse_pdf(pdf_path, pdf_dir)
            all_questions.extend(qs)
            chap = qs[0]["chapter"] if qs else "Unknown"
            chapter_stats[chap] = len(qs)
        except Exception as err:
            print(f"   [!] Error processing {pdf_path}: {err}", file=sys.stderr)
            import traceback
            traceback.print_exc()

    out_dir = os.path.join(".", "public", "data")
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "questions.json")

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(all_questions, f, ensure_ascii=False, indent=2)

    # Check for any residual Hindi
    hindi_count = 0
    for q in all_questions:
        if re.search(r'[\u0900-\u097F]', q['question']):
            hindi_count += 1
        for opt in q['options']:
            if re.search(r'[\u0900-\u097F]', opt):
                hindi_count += 1

    print(f"\n=======================================================")
    print(f" Successfully extracted {len(all_questions)} questions across {len(chapter_stats)} chapters!")
    print(f" Residual Hindi characters detected in database: {hindi_count}")
    print(f" Saved to: {os.path.abspath(out_file)}")
    print(f"=======================================================\n")
    print("Chapter Breakdown:")
    for chap, count in sorted(chapter_stats.items()):
        print(f"  - {chap}: {count} questions")

if __name__ == "__main__":
    main()
