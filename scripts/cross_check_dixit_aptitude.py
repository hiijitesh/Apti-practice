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

# Manual verified translations / formulations for special non-standard slides
MANUAL_OVERRIDES = {
    "disc_q056": {
        "options": ['A', 'No discount is offered in scheme A', 'Discount percentage is equal in both A and B', 'B'],
        "correctAnswer": 0,
        "explanation": "Correct Answer: Option A (A) | Exam: SSC CGL 14/07/2023 (1st shift)"
    },
    "pct_q102": {
        "options": ['16.4% more', '8.2% more', '16.4% less', '8.2% less'],
        "correctAnswer": 0,
        "explanation": "Correct Answer: Option A (16.4% more) | Exam: SSC CPO 9/12/19 (Morning)"
    },
    "pct_q105": {
        "options": ['24.5% of X', '24.5% of Y', '40% of Y', '50% of X'],
        "correctAnswer": 0,
        "explanation": "Correct Answer: Option A (24.5% of X) | Exam: SSC CPO 24/11/2020 (Evening)"
    },
    "tsd_q102": {
        "question": "A car travels from A to B at V1 Km/h, back from B to A at V2 Km/h and again A to B at V1 Km/h. Find the average speed of the car during the journey.",
        "options": ['2V1V2 / (V1+2V2)', '2V1V2 / (V2+2V1)', '3V1V2 / (V2+2V1)', '3V1V2 / (V1+2V2)'],
        "correctAnswer": 3,
        "explanation": "Correct Answer: Option D (3V1V2 / (V1+2V2)) | Exam: CGL 2019 MAINS"
    }
}

opt_marker_pat = re.compile(
    r'(?:\(([a-dA-D])\.?\)|'
    r'(?:^|[\n\r\s])([a-dA-D])\s*[\.\)]|'
    r'(?:^|[\n\r\s])([a-dA-D])\s+(?=[0-9A-Za-z₹$]|NPNL|Gain|Loss|Equal|No|Both|\-|\())'
)

def clean_text(t):
    if not t:
        return ""
    return unicodedata.normalize('NFKC', t).strip()

def has_hindi(s):
    return bool(re.search(r'[\u0900-\u097F]', s))

def strip_hindi(s):
    if not s:
        return ""
    clean = re.sub(r'[\u0900-\u097F]+', '', s)
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

def extract_slide_data(txt):
    matches = list(opt_marker_pat.finditer(txt))
    best_opts = None
    best_span = 999999
    
    for i in range(len(matches)):
        for j in range(i+1, len(matches)):
            for k in range(j+1, len(matches)):
                for l in range(k+1, len(matches)):
                    m_list = [matches[i], matches[j], matches[k], matches[l]]
                    labels = [(m.group(1) or m.group(2) or m.group(3)).upper() for m in m_list]
                    if set(labels) == {'A', 'B', 'C', 'D'}:
                        span = m_list[3].end() - m_list[0].start()
                        d1 = m_list[1].start() - m_list[0].end()
                        d2 = m_list[2].start() - m_list[1].end()
                        d3 = m_list[3].start() - m_list[2].end()
                        if max(d1, d2, d3) < 300 and span < best_span:
                            best_span = span
                            best_opts = (m_list, labels)
    if not best_opts:
        return None
    
    m_list, labels = best_opts
    opt_dict = {}
    for idx in range(3):
        val = txt[m_list[idx].end():m_list[idx+1].start()]
        opt_dict[labels[idx]] = format_option_value(val)
    
    tail = txt[m_list[3].end():]
    exam_m = re.search(r'((?:SSC|Higher Secondary|Selection Post|CGL|CHSL|MTS|CPO|Tier|Matriculation|Graduate|RRB|Constable|Delhi Police)[^\n\r]*)', tail, re.I)
    exam_tag = ''
    if exam_m:
        exam_tag = clean_text(exam_m.group(1))
        tail = tail[:exam_m.start()]
    opt_dict[labels[3]] = format_option_value(tail)
    
    # Strip any leftover exam tag from all options
    for k in opt_dict:
        em = re.search(r'((?:SSC|Higher Secondary|Selection Post|CGL|CHSL|MTS|CPO|Tier|Matriculation|Graduate|RRB|Constable|Delhi Police)[^\n\r]*)', opt_dict[k], re.I)
        if em:
            if not exam_tag:
                exam_tag = clean_text(em.group(1))
            opt_dict[k] = clean_text(opt_dict[k][:em.start()])
    
    opts = [opt_dict.get('A', ''), opt_dict.get('B', ''), opt_dict.get('C', ''), opt_dict.get('D', '')]
    if not (all(opts) and len(opts) == 4):
        return None

    # Question stem extraction
    stem_raw = txt[:m_list[0].start()].strip()
    stem_lines = []
    for l in stem_raw.split('\n'):
        l = l.strip()
        if not l:
            continue
        if re.search(r'^(?:Type\s+\d+|Level\s*-\s*Zero|[A-Z\s&]+\s+by\s+Dixit\s+Sir|Solutions\s+on|YouTube\s+Channel|Page\s+\d+|Basics\b)', l, re.I):
            continue
        l_no_hindi = re.sub(r'\([^\)]*[\u0900-\u097F][^\)]*\)', '', l).strip()
        if not l_no_hindi:
            continue
        if has_hindi(l_no_hindi) and not re.search(r'[a-zA-Z]{3,}', l_no_hindi):
            continue
        stem_lines.append(strip_hindi(l_no_hindi))
    
    # Handle vertically stacked fractions in question stem e.g. "1 \n 125" -> "1/125"
    stem_lines_proc = []
    i = 0
    while i < len(stem_lines):
        l = stem_lines[i]
        m1 = re.match(r'^(\d+)$', l)
        if m1 and i + 1 < len(stem_lines):
            next_l = stem_lines[i+1]
            m2 = re.match(r'^(\d+)(\s*[:,\-A-Za-z].*|\s*)$', next_l)
            if m2:
                frac = f"{m1.group(1)}/{m2.group(1)}"
                stem_lines_proc.append((frac + m2.group(2)).strip())
                i += 2
                continue
        stem_lines_proc.append(l)
        i += 1
    
    stem = ' '.join(stem_lines_proc).strip()
    stem = re.sub(r'^(?:Q\.?\s*\d+[\.\)]|\d+[\.\)])\s*', '', stem).strip()
    return stem, opts, exam_tag

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
    fixed_questions_map = {}
    letter_map = {'A': 0, 'B': 1, 'C': 2, 'D': 3}

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
            if chap_name in ANSWER_OVERRIDES:
                ans_key.update(ANSWER_OVERRIDES[chap_name])

        # 2. Extract slides from Complete Solutions PDF
        doc = fitz.open(sol_path)
        slides = []
        for p_idx, page in enumerate(doc):
            data = extract_slide_data(page.get_text('text'))
            if data:
                slides.append((p_idx + 1, data))

        print(f"  Complete Solutions pages: {len(doc)} | Extracted valid Q-slides: {len(slides)}")

        # 3. Match slides to questions
        matched_slides = {}
        for q_idx, q in enumerate(qlist):
            stem = q["question"]
            words = [w.lower() for w in re.findall(r'[a-zA-Z0-9%]+', stem) if len(w) > 3]
            best_s = None
            max_m = 0
            for s_idx, (pnum, sdata) in enumerate(slides):
                s_text = (sdata[0] + ' ' + ' '.join(sdata[1])).lower()
                m = sum(1 for w in words if w in s_text)
                if m > max_m:
                    max_m = m
                    best_s = (s_idx, pnum, sdata)
            if words and max_m >= max(1, int(len(words) * 0.35)):
                matched_slides[q_idx] = best_s
            elif len(slides) == len(qlist):
                matched_slides[q_idx] = (q_idx, slides[q_idx][0], slides[q_idx][1])

        # 4. Interpolate any unmatched gaps between anchors
        for q_idx in range(len(qlist)):
            if q_idx not in matched_slides:
                prev_m = [i for i in range(q_idx) if i in matched_slides]
                next_m = [i for i in range(q_idx + 1, len(qlist)) if i in matched_slides]
                if prev_m:
                    last_p = prev_m[-1]
                    expected_s_idx = matched_slides[last_p][0] + (q_idx - last_p)
                    if expected_s_idx < len(slides):
                        matched_slides[q_idx] = (expected_s_idx, slides[expected_s_idx][0], slides[expected_s_idx][1])
                elif next_m:
                    first_n = next_m[0]
                    expected_s_idx = matched_slides[first_n][0] - (first_n - q_idx)
                    if 0 <= expected_s_idx < len(slides):
                        matched_slides[q_idx] = (expected_s_idx, slides[expected_s_idx][0], slides[expected_s_idx][1])

        # 5. Process each question
        for q_idx, q in enumerate(qlist):
            qid = q["id"]
            qnum = q_idx + 1
            existing_stem = q["question"]
            existing_opts = q["options"]
            existing_ans = q["correctAnswer"]
            existing_exp = q.get("explanation", "")

            if qid in MANUAL_OVERRIDES:
                ov = MANUAL_OVERRIDES[qid]
                new_q = dict(q)
                new_q.update(ov)
                fixed_questions_map[qid] = new_q
                total_fixed_options += 1
                continue

            s_match = matched_slides.get(q_idx)
            if s_match:
                s_idx, pnum, (s_stem, s_opts, s_exam) = s_match

                # Stem cleaning
                final_stem = existing_stem
                if (len(s_stem) > len(existing_stem) + 5 or len(existing_stem) < 25 or 
                    has_hindi(existing_stem) or 
                    any(kw in existing_stem for kw in ["Question ", "Two pipes and can", "ratio of .", "If and then is:"])):
                    final_stem = s_stem
                    total_fixed_stems += 1

                # Options: authentic slide options (ordered A, B, C, D)
                final_opts = list(s_opts)
                if final_opts != existing_opts:
                    total_fixed_options += 1

                # Answer key alignment
                ans_let = ans_key.get(qnum)
                correct_idx = letter_map.get(ans_let, existing_ans)
                correct_val = final_opts[correct_idx] if correct_idx < len(final_opts) else ""

                # Exam tag
                exam = s_exam
                if not exam:
                    em = re.search(r'Exam:\s*([^\n\r|]+)', existing_exp)
                    if em:
                        exam = em.group(1).strip()

                exp_parts = [f"Correct Answer: Option {chr(65 + correct_idx)}"]
                if correct_val:
                    exp_parts.append(f"({correct_val})")
                if exam:
                    exp_parts.append(f"Exam: {exam}")
                final_exp = " | ".join(exp_parts)

                fixed_questions_map[qid] = {
                    "id": qid,
                    "subject": "Quantitative Aptitude",
                    "subSubject": "Quantitative Aptitude",
                    "chapter": chap_name,
                    "question": final_stem,
                    "options": final_opts,
                    "correctAnswer": correct_idx,
                    "explanation": final_exp
                }
            else:
                print(f"  Warning: Q{qnum} ({qid}) could not be matched!")
                fixed_questions_map[qid] = q

    print("\n=== SUMMARY OF FIXES ===")
    print(f"Total options updated/verified: {total_fixed_options}")
    print(f"Total question stems updated: {total_fixed_stems}")
    print(f"Total questions mapped: {len(fixed_questions_map)}")

    # Update master questions list
    updated_master = []
    for item in master_questions:
        if item.get("id") in fixed_questions_map:
            updated_master.append(fixed_questions_map[item["id"]])
        else:
            updated_master.append(item)

    # Sanity checks before write
    assert len(updated_master) == len(master_questions), f"Length mismatch: {len(updated_master)} vs {len(master_questions)}"
    apti_updated = [q for q in updated_master if q.get("subject") == "Quantitative Aptitude"]
    assert len(apti_updated) == 1342, f"Expected 1342 aptitude questions, got {len(apti_updated)}"
    
    # Assert zero dummy options
    dummies = [q["id"] for q in apti_updated if any(o.startswith("Option ") and len(o) <= 8 for o in q["options"])]
    assert len(dummies) == 0, f"Found {len(dummies)} dummy options: {dummies[:5]}"
    
    # Assert zero Hindi across entire database
    hindi_qs = [q["id"] for q in updated_master if has_hindi(q["question"] + " " + " ".join(q["options"]) + q.get("explanation", ""))]
    assert len(hindi_qs) == 0, f"Found Hindi in {len(hindi_qs)} questions: {hindi_qs[:5]}"

    # Assert 4 non-empty options and valid answer index
    for q in apti_updated:
        assert len(q["options"]) == 4, f"Question {q['id']} does not have 4 options"
        assert all(len(o) > 0 for o in q["options"]), f"Question {q['id']} has empty option: {q['options']}"
        assert 0 <= q["correctAnswer"] <= 3, f"Question {q['id']} has invalid correctAnswer {q['correctAnswer']}"

    print(f"\nWriting updated questions to {QUESTIONS_JSON}...")
    with open(QUESTIONS_JSON, "w", encoding="utf-8") as f:
        json.dump(updated_master, f, indent=2, ensure_ascii=False)
    print("Done! public/data/questions.json updated and verified successfully.")

if __name__ == "__main__":
    main()
