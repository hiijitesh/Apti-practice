#!/usr/bin/env python3
"""
scripts/cross_check_dixit_aptitude.py

Cross-checks and verifies all 1,342 Quantitative Aptitude questions from Dixit Sir Sheet
against the authoritative source PDFs in:
  ~/Downloads/Govt Exams & RRB/A RRB NOTES/Dixit Sir Sheet/

Fixes:
1. Dummy fallback options (["Option A", "Option B", "Option C", "Option D"]) -> authentic options from slides
2. Scrambled/swapped option orders from 2-column/2x2 layouts
3. Font dropouts (fractions, ratios, percentages, missing variables like A and B)
4. Question stems leaking into Option A
5. Exam tags leaking into Option D
6. Aligns correctAnswer index and explanation with verified answer keys and solutions
7. Strict Zero Hindi / Devanagari constraint across all stems, options, and explanations
"""

import os
import re
import json
import unicodedata
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Error: PyMuPDF not found. Please run with: uv run --with pymupdf python3")
    exit(1)

BASE_DIR = Path(__file__).resolve().parent.parent
QUESTIONS_JSON = BASE_DIR / "public" / "data" / "questions.json"
DIXIT_DIR = Path(os.path.expanduser("~/Downloads/Govt Exams & RRB/A RRB NOTES/Dixit Sir Sheet"))

CHAPTER_MAPPING = [
    ("Ages", "Ages (आयु) - All Questions.pdf", "Ages - Complete Solutions.pdf", "ages"),
    ("Average", "Average - All Questions.pdf", "Average - Complete Solutions.pdf", "avg"),
    ("Boat & Stream", "Boat & Stream-All Questions.pdf", "Boat & Stream-Complete Solutions.pdf", "boat"),
    ("Compound Interest", "Compound Interest - All Questions.pdf", "Compound Interest - Complete Solution.pdf", "ci"),
    ("Discount", "DISCOUNT - All Questions.pdf", "Discount - Complete Solution.pdf", "disc"),
    ("Mixture & Alligation", "Mixture - All Questions.pdf", "Mixture - Complete Solutions.pdf", "mix"),
    ("Partnership", "PARTNERSHIP -  All Questions.pdf", "Partnership - Complete Solutions.pdf", "part"),
    ("Percentage", "Percentage - All Questions.pdf", "Percentage - Complete Solutions.pdf", "pct"),
    ("Pipe & Cistern", "Pipe and Cistern - All Questions.pdf", "Pipe & Cistern - Complete Solutions.pdf", "pipe"),
    ("Profit & Loss", "Profit & Loss - All Questions.pdf", "Profit & Loss - Solutions.pdf", "pnl"),
    ("Race", "Race - All Questions.pdf", "Race - Complete Solutions.pdf", "race"),
    ("Ratio & Proportion", "Ratio & Proportion - All Questions.pdf", "Ratio - Complete Solutions.pdf", "ratio"),
    ("Simple Interest", "Simple interest - All Questions.pdf", "Simple Interest - Complete Solutions.pdf", "si"),
    ("Time & Work", "TIME & WORK - All Questions.pdf", "Time & Work - Complete Solutions.pdf", "tnw"),
    ("Trains", "TRAINS - All Questions.pdf", "TRAINS - Complete Solutions.pdf", "train"),
    ("Time, Speed & Distance", "TSD - All Questions.pdf", "TSD - Complete Solutions.pdf", "tsd"),
    ("Work & Wages", "Work and Wages- All Questions.pdf", "Work & Wages - Complete Solutions.pdf", "wnw"),
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
    "Discount": {40: 'B'},
    "Simple Interest": {75: 'C'},
}

def clean_text(t):
    if not t:
        return ""
    return unicodedata.normalize('NFKC', t).strip()

def has_hindi(s):
    return bool(re.search(r'[\u0900-\u097F]', s))

def strip_hindi(s):
    if not s:
        return ""
    # remove Devanagari block
    clean = re.sub(r'[\u0900-\u097F]+', '', s)
    # collapse spaces
    clean = re.sub(r'[ \t]+', ' ', clean).strip()
    return clean

def parse_answer_key_from_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    ak_text = ""
    for p in doc:
        t = p.get_text('text')
        m = re.search(r'Answer\s*Key\s*[:-]?(.*)', t, re.DOTALL | re.IGNORECASE)
        if m:
            ak_text += m.group(1) + "\n"
    items = re.findall(r'(\d+)\s*[\.\:\-\)]\s*\(?([A-Da-d])\)?', ak_text)
    return {int(q): a.upper() for q, a in items}

def format_option_value(val):
    val = clean_text(val)
    # Strip Hindi part if present
    if '/' in val and has_hindi(val):
        parts = [p.strip() for p in val.split('/') if not has_hindi(p)]
        val = ' / '.join(parts).strip()
    else:
        val = strip_hindi(val)
    val = re.sub(r'\s*/\s*$', '', val).strip()

    lines = [l.strip() for l in val.split('\n') if l.strip() and not has_hindi(l)]
    if not lines:
        return ""
    if len(lines) == 2 and lines[0].isdigit() and lines[1].isdigit():
        return f"{lines[0]}/{lines[1]}"
    if len(lines) == 3 and lines[0].isdigit() and lines[1].isdigit() and re.match(r'^\d+%?$', lines[2]):
        unit = '%' if '%' in lines[2] else ''
        den = lines[2].replace('%', '')
        return f"{lines[0]}({lines[1]}/{den}){unit}"
    return ' '.join(lines).strip()

def parse_question_slide(page):
    blocks = sorted(page.get_text('blocks'), key=lambda b: (round(b[1] / 10) * 10, b[0]))
    full_text = '\n'.join(clean_text(b[4]) for b in blocks if clean_text(b[4]))
    lines = [l.strip() for l in full_text.split('\n') if l.strip()]

    # Filter out title/type headers
    clean_lines = []
    for l in lines:
        if re.search(r'^(?:Type\s+\d+|Level\s*-\s*Zero|[A-Z\s&]+\s+by\s+Dixit\s+Sir|Solutions\s+on|YouTube\s+Channel|Page\s+\d+)', l, re.I):
            continue
        clean_lines.append(l)

    # Search for option pattern
    opt_pat = r'(?:^|[\s\t])(?:\(([a-dA-D])\)|([a-dA-D])[\.\)])\s*'

    opt_line_idx = -1
    for idx, l in enumerate(clean_lines):
        if re.search(r'^(?:\([a-dA-D]\)|[a-dA-D][\.\)])\s*', l):
            opt_line_idx = idx
            break
    if opt_line_idx == -1:
        for idx, l in enumerate(clean_lines):
            if re.search(r'(?:\([a-dA-D]\)|[a-dA-D][\.\)])\s*', l):
                opt_line_idx = idx
                break
    if opt_line_idx == -1:
        return None

    stem_lines = clean_lines[:opt_line_idx]
    en_stem_lines = []
    for l in stem_lines:
        if has_hindi(l):
            break
        if re.search(r'^(?:SSC|CGL|CHSL|MTS|CPO|Selection Post|Phase|Tier|Matriculation|Graduate)', l, re.I):
            continue
        en_stem_lines.append(l)

    # Format stacked fractions in question stem
    stem_lines_proc = []
    i = 0
    while i < len(en_stem_lines):
        l = en_stem_lines[i]
        m1 = re.match(r'^(\d+)$', l)
        if m1 and i + 1 < len(en_stem_lines):
            next_l = en_stem_lines[i+1]
            m2 = re.match(r'^(\d+)(\s*[:,\-A-Za-z].*|\s*)$', next_l)
            if m2:
                frac = f"{m1.group(1)}/{m2.group(1)}"
                stem_lines_proc.append((frac + m2.group(2)).strip())
                i += 2
                continue
        stem_lines_proc.append(l)
        i += 1

    stem = ' '.join(stem_lines_proc).strip()
    # Strip leading question number if present e.g. "1. " or "Q.1 "
    stem = re.sub(r'^(?:Q\.?\s*\d+[\.\)]|\d+[\.\)])\s*', '', stem).strip()

    post_lines = clean_lines[opt_line_idx:]
    post_text = '\n'.join(post_lines)

    # Extract exam tag
    exam_tag = ""
    exam_m = re.search(r'((?:SSC|Higher Secondary|Selection Post|CGL|CHSL|MTS|CPO|Tier|Matriculation|Graduate)[^\n\r]*)', full_text, re.I)
    if exam_m:
        exam_tag = clean_text(exam_m.group(1))
        # Remove exam tag from post_text if inside
        post_text = post_text.replace(exam_m.group(1), "")

    matches = list(re.finditer(opt_pat, post_text))
    best_combo = None
    for idx in range(len(matches)):
        lbl = (matches[idx].group(1) or matches[idx].group(2)).upper()
        if lbl != 'A':
            continue
        selected = [matches[idx]]
        lbls = ['A']
        for j in range(idx + 1, len(matches)):
            next_lbl = (matches[j].group(1) or matches[j].group(2)).upper()
            if next_lbl == chr(ord(lbls[-1]) + 1):
                lbls.append(next_lbl)
                selected.append(matches[j])
                if len(lbls) == 4:
                    best_combo = selected
                    break
        if best_combo:
            break

    options = []
    if best_combo and len(best_combo) == 4:
        for k in range(3):
            val = post_text[best_combo[k].end():best_combo[k+1].start()]
            options.append(format_option_value(val))
        last_val = post_text[best_combo[3].end():]
        options.append(format_option_value(last_val))

    if len(options) == 4 and all(o for o in options):
        return stem, options, exam_tag
    return None

def main():
    print("=== DIXIT SIR APTITUDE CROSS-CHECK & OPTION RE-VERIFICATION ===")
    with open(QUESTIONS_JSON, "r", encoding="utf-8") as f:
        master_questions = json.load(f)

    apti_questions = [q for q in master_questions if q.get("subject") == "Quantitative Aptitude"]
    print(f"Total Aptitude questions in master DB: {len(apti_questions)}")

    chap_dict = {}
    for q in apti_questions:
        chap_dict.setdefault(q["chapter"], []).append(q)

    total_fixed_options = 0
    total_fixed_stems = 0
    total_fixed_answers = 0
    total_stripped_exam_tags = 0

    fixed_questions_map = {}

    for chap_name, all_q_pdf, sol_pdf, slug in CHAPTER_MAPPING:
        qlist = chap_dict.get(chap_name, [])
        all_q_path = DIXIT_DIR / all_q_pdf
        sol_path = DIXIT_DIR / sol_pdf

        if not sol_path.exists():
            print(f"ERROR: {sol_path} not found!")
            continue

        print(f"\nProcessing {chap_name:25} ({len(qlist)} questions)...")

        # 1. Answer Key
        if chap_name == "Percentage":
            ans_key = PERCENTAGE_ANSWERS
        else:
            ans_key = parse_answer_key_from_pdf(all_q_path)
            # Add overrides
            if chap_name in ANSWER_OVERRIDES:
                ans_key.update(ANSWER_OVERRIDES[chap_name])

        # 2. Extract slides from Complete Solutions PDF
        doc = fitz.open(sol_path)

        # Collect candidate question slides
        q_slides = []
        for p_idx, page in enumerate(doc):
            parsed = parse_question_slide(page)
            if parsed:
                q_slides.append((p_idx, parsed))

        print(f"  Complete Solutions pages: {len(doc)} | Extracted valid Q-slides: {len(q_slides)}")

        # Map each question in qlist to a slide
        curr_slide_idx = 0
        for qnum_idx, q in enumerate(qlist):
            qnum = qnum_idx + 1
            existing_id = q["id"]
            existing_stem = q["question"]
            existing_opts = q["options"]
            existing_ans = q["correctAnswer"]
            existing_exp = q["explanation"]

            # Match to slide
            # First check if q_slides has exact count and matches monotonically
            matched_parsed = None
            if len(q_slides) == len(qlist):
                matched_parsed = q_slides[qnum_idx][1]
            else:
                # Align monotonically by matching key words
                q_words = [w.lower() for w in re.findall(r'[a-zA-Z0-9%]+', existing_stem) if len(w) > 3]
                best_match = None
                for s_idx in range(curr_slide_idx, len(q_slides)):
                    slide_p, slide_parsed = q_slides[s_idx]
                    s_stem, s_opts, s_exam = slide_parsed
                    s_text = (s_stem + " " + " ".join(s_opts)).lower()
                    m_count = sum(1 for w in q_words if w in s_text)
                    if q_words and m_count >= max(1, int(len(q_words) * 0.3)):
                        best_match = (s_idx, slide_parsed)
                        break
                if best_match:
                    curr_slide_idx = best_match[0] + 1
                    matched_parsed = best_match[1]

            # If matched from slide, compare and fix!
            if matched_parsed:
                new_stem, new_opts, new_exam = matched_parsed

                # Clean question stem
                final_stem = existing_stem
                # If existing stem was corrupted or incomplete or had font dropouts, use slide stem
                if any(kw in existing_stem for kw in ["Question ", "Two pipes and can", "Two numbers are in the ratio of .", "Three numbers are in the ratio ,", "If and then is:"]) or len(new_stem) > len(existing_stem) + 5 or has_hindi(existing_stem):
                    final_stem = new_stem
                    total_fixed_stems += 1
                elif len(existing_stem.strip()) < 20 and len(new_stem) > 20:
                    final_stem = new_stem
                    total_fixed_stems += 1

                # Clean options
                final_opts = list(existing_opts)
                # Check if existing options had dummy values or exam tags or were scrambled
                has_dummy = any(o.startswith("Option ") and len(o) <= 8 for o in existing_opts)
                has_exam_in_d = existing_opts and any(kw in existing_opts[-1] for kw in ["SSC", "CHSL", "CGL", "MTS", "CPO", "Phase", "Type "])
                has_stem_in_a = existing_opts and (len(existing_opts[0]) > 80 or "(a)" in existing_opts[0].lower())

                if has_dummy or has_exam_in_d or has_stem_in_a or len(existing_opts) != 4:
                    final_opts = new_opts
                    total_fixed_options += 1
                else:
                    # Check if new_opts are cleaner (e.g. no missing fractions/percentages)
                    # or if order in new_opts matches answer key better
                    if any(o in ["loss", "profit"] for o in existing_opts) and any("%" in o for o in new_opts):
                        final_opts = new_opts
                        total_fixed_options += 1

                # Answer Key
                ans_letter = ans_key.get(qnum)
                letter_map = {"A": 0, "B": 1, "C": 2, "D": 3}
                if ans_letter and ans_letter in letter_map:
                    correct_idx = letter_map[ans_letter]
                else:
                    correct_idx = existing_ans

                correct_val = final_opts[correct_idx] if correct_idx < len(final_opts) else ""

                # Exam tag
                final_exam = new_exam
                if not final_exam:
                    # check if existing explanation had exam tag
                    em = re.search(r'Exam:\s*([^\n\r|]+)', existing_exp)
                    if em:
                        final_exam = em.group(1).strip()

                # Build explanation
                exp_parts = [f"Correct Answer: Option {chr(65 + correct_idx)}"]
                if correct_val:
                    exp_parts.append(f"({correct_val})")
                if final_exam:
                    exp_parts.append(f"Exam: {final_exam}")
                final_exp = " | ".join(exp_parts)

                fixed_questions_map[existing_id] = {
                    "id": existing_id,
                    "subject": "Quantitative Aptitude",
                    "subSubject": "Quantitative Aptitude",
                    "chapter": chap_name,
                    "question": final_stem,
                    "options": final_opts,
                    "correctAnswer": correct_idx,
                    "explanation": final_exp
                }
            else:
                print(f"  Warning: Q{qnum} ({existing_id}) could not be matched to slide!")
                fixed_questions_map[existing_id] = q

    print("\n=== SUMMARY OF FIXES ===")
    print(f"Total options repaired from slides: {total_fixed_options}")
    print(f"Total question stems repaired from slides: {total_fixed_stems}")
    print(f"Total questions mapped: {len(fixed_questions_map)}")

    # Update master questions list
    updated_master = []
    for item in master_questions:
        if item.get("id") in fixed_questions_map:
            updated_master.append(fixed_questions_map[item["id"]])
        else:
            updated_master.append(item)

    print(f"\nWriting updated questions to {QUESTIONS_JSON}...")
    with open(QUESTIONS_JSON, "w", encoding="utf-8") as f:
        json.dump(updated_master, f, indent=2, ensure_ascii=False)
    print("Done! public/data/questions.json updated successfully.")

if __name__ == "__main__":
    main()
