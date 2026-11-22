#!/usr/bin/env python3
"""
scripts/clean_rk_ranjan.py

Purifies the RK Ranjan Quantitative Aptitude dataset to guarantee:
1. Zero Hindi/Devanagari characters
2. Zero PUA Symbol/Wingdings font glyphs (converted to clean math unicode: +, -, =, °, √, etc.)
3. Zero dummy fallback options (e.g. Option A, Option B, etc.)
4. Exactly 4 non-empty distinct options per question
5. Valid correctAnswer indices (0..3)
6. Zero exam tag leakage into options
7. Clean question stems and explanations

Outputs to:
  - public/data/rk_ranjan_questions.json
"""

import json
import os
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'public', 'data')
MASTER_FILE = os.path.join(DATA_DIR, 'rk_ranjan_questions.json')

PUA_MAP = {
    0xf020: ' ', 0xf028: '(', 0xf029: ')', 0xf02b: '+', 0xf02d: '-', 0xf02e: '.',
    0xf030: '0', 0xf031: '1', 0xf032: '2', 0xf033: '3', 0xf034: '4',
    0xf035: '5', 0xf036: '6', 0xf037: '7', 0xf038: '8', 0xf039: '9',
    0xf03c: '<', 0xf03d: '=', 0xf03e: '>', 0xf03f: '?',
    0xf040: '~', 0xf041: 'A', 0xf042: 'B', 0xf044: 'Δ', 0xf045: 'E',
    0xf050: '||', 0xf051: '', 0xf05b: '[', 0xf05c: '\\\\', 0xf05d: ']', 0xf05e: '⊥',
    0xf061: 'α', 0xf062: 'β', 0xf066: 'ϕ', 0xf067: 'γ', 0xf069: 'ℓ',
    0xf06a: 'φ', 0xf06c: 'λ', 0xf070: 'π', 0xf071: 'θ', 0xf073: 'σ',
    0xf076: '•', 0xf077: '•',
    0xf0a2: "'", 0xf0a3: '≤', 0xf0a5: '∞', 0xf0ae: '→', 0xf0af: '↓',
    0xf0b0: '°', 0xf0b1: '±', 0xf0b3: '≥', 0xf0b4: '×', 0xf0b5: '∝',
    0xf0b8: '÷', 0xf0b9: '≠', 0xf0bb: '≈', 0xf0be: '→',
    0xf0c6: 'ϕ', 0xf0c7: '∩', 0xf0c8: '∪', 0xf0d0: '∠', 0xf0d6: '√',
    0xf0d8: '⇒', 0xf0de: '⇒',
    0xf0e5: '', 0xf0e6: '(', 0xf0e7: '(', 0xf0e8: '(', 0xf0e9: '[', 0xf0ea: '[', 0xf0eb: '[',
    0xf0ec: '{', 0xf0ed: '{', 0xf0ee: '{', 0xf0ef: '{',
    0xf0f6: ')', 0xf0f7: ')', 0xf0f8: ')', 0xf0f9: ']', 0xf0fa: ']', 0xf0fb: ']',
    0xf0fc: '}', 0xf0fd: '}', 0xf0fe: '}'
}

def clean_text(text):
    if not text:
        return ''
    chars = [PUA_MAP.get(ord(c), c) if (ord(c) in PUA_MAP or not (0xE000 <= ord(c) <= 0xF8FF)) else ' ' for c in text]
    s = ''.join(chars)
    s = re.sub(r'/[a-zA-Z\s;,\{\}]+(?=\s|$|\))', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def clean_option(opt):
    opt = clean_text(str(opt))
    # Strip leading exam tag like (MAINS 07/03/2023)/
    opt = re.sub(r'^\([A-Z0-9\s/–-]+\)/', '', opt).strip()
    # Strip leading letter tags like A. or (a)
    opt = re.sub(r'^\(?[a-dA-D]\)?[.:\s]+', '', opt).strip()
    return opt

PNL_RANGES = [
    (1, 24, 'Type 01: Basic Profit & Loss'),
    (25, 31, 'Type 02: CP & SP Ratio'),
    (32, 34, 'Type 03: Equal Selling Price'),
    (35, 39, 'Type 04: Articles based (Buying & Selling)'),
    (40, 47, 'Type 05: Dishonest Dealer & False Weight'),
    (48, 53, 'Type 06: Successive Transactions'),
    (54, 65, 'Type 07: Price & Quantity Variation'),
    (66, 77, 'Type 08: Overheads & Repairing Costs'),
    (78, 89, 'Type 09: Value & Percent Equivalence'),
    (90, 92, 'Type 10: Breakage / Depreciation'),
    (93, 104, 'Type 11: True Value & Profit Analysis'),
    (105, 111, 'Type 12: Proportional Division of Goods'),
    (112, 117, 'Type 13: Discount & Marked Price Relation'),
    (118, 137, 'Type 14: Advanced Exam Questions'),
    (138, 155, 'Type 15: Miscellaneous Applications')
]

DISCOUNT_RANGES = [
    (1, 7, 'Type 01: Single & Equivalent Discount'),
    (8, 10, 'Type 02: Successive Discounts'),
    (11, 26, 'Type 03: Marked Price & Cost Price Ratio'),
    (27, 46, 'Type 04: Buy X Get Y Free & Schemes'),
    (47, 55, 'Type 05: Profit after Discount'),
    (56, 64, 'Type 06: Successive Discount on Cash/Credit'),
    (65, 80, 'Type 07: Advanced Marked Price & Profit')
]

HD_RANGES = [
    (1, 13, 'Type 01: Single Angle of Elevation'),
    (14, 16, 'Type 02: Angle of Depression'),
    (17, 18, 'Type 03: Complementary Angles'),
    (19, 26, 'Type 04: Two Objects from Top/Bottom'),
    (27, 29, 'Type 05: Moving Observer / Speed & Distance'),
    (30, 34, 'Type 06: Balloon, Cloud & Water Reflection'),
    (35, 36, 'Type 07: Broken Tree / Pole'),
    (37, 40, 'Type 08: Two Towers / Flagstaff on Building'),
    (41, 50, 'Type 09: Advanced 3D & Miscellaneous')
]

def assign_question_type(q):
    chap = q.get('chapter', '').strip()
    sheet_file = q.get('sheetFile', '')
    sheet_type = q.get('sheetType', '')
    sf_clean = sheet_file.replace('.pdf', '').replace(' [English Only]', '').strip()

    # Extract question number from ID if possible (e.g. q025 -> 25)
    m_qid = re.search(r'_q(\d+)$', q.get('id', ''))
    qn = int(m_qid.group(1)) if m_qid else None

    if chap == 'Profit & Loss' and 'classroom' in sf_clean.lower() and qn is not None:
        for start, end, label in PNL_RANGES:
            if start <= qn <= end:
                return label
        return 'ClassRoom'

    if chap == 'Discount' and 'classroom' in sf_clean.lower() and qn is not None:
        for start, end, label in DISCOUNT_RANGES:
            if start <= qn <= end:
                return label
        return 'ClassRoom'

    if chap == 'Height & Distance' and 'classroom' in sf_clean.lower() and 'mains' not in sf_clean.lower() and qn is not None:
        for start, end, label in HD_RANGES:
            if start <= qn <= end:
                return label
        return 'ClassRoom'

    # Check for known sub-topics
    # Geometry sub-topics
    if 'centers of triangle' in sf_clean.lower(): return 'Centers of Triangle'
    if 'types of triangle' in sf_clean.lower(): return 'Types of Triangle'
    if 'fundamental properties of triangle' in sf_clean.lower(): return 'Triangle Properties'
    if 'all triangle pro level' in sf_clean.lower(): return 'Triangle (Pro Level)'
    if 'circle' in sf_clean.lower(): return 'Circle (Pro Level)' if 'pro level' in sf_clean.lower() else 'Circle'
    if 'quadrilateral' in sf_clean.lower(): return 'Quadrilateral (Pro Level)' if 'pro level' in sf_clean.lower() else 'Quadrilateral'
    if 'polygon' in sf_clean.lower(): return 'Polygon (Pro Level)' if 'pro level' in sf_clean.lower() else 'Polygon'
    if 'similarity & congruency' in sf_clean.lower(): return 'Similarity & Congruency'
    if 'line & angles' in sf_clean.lower(): return 'Line & Angles'

    # Number System sub-topics
    if 'classification of numbers' in sf_clean.lower(): return 'Classification of Numbers'
    if 'divisivility' in sf_clean.lower() or 'divisibility' in sf_clean.lower(): return 'Divisibility'
    if 'unit digit' in sf_clean.lower(): return 'Unit Digit'
    if 'remainder' in sf_clean.lower(): return 'Remainder Theorem'
    if 'factor' in sf_clean.lower(): return 'Factors'
    if 'no. of zeros' in sf_clean.lower(): return 'Number of Zeros'
    if 'number system pro level' in sf_clean.lower(): return 'Pro Level'

    # Compound Interest sub-topics
    if 'installment' in sf_clean.lower(): return 'Installment'

    # AP & GP
    if 'geometric progression' in sf_clean.lower(): return 'Geometric Progression (GP)'
    if 'arithmetic progression' in sf_clean.lower(): return 'Arithmetic Progression (AP)'

    # Mixture & Alligation
    if 'alligation' in sf_clean.lower(): return 'Alligation (Pro Level)' if 'pro level' in sf_clean.lower() else 'Alligation'
    if 'mixture' in sf_clean.lower(): return 'Mixture (Pro Level)' if 'pro level' in sf_clean.lower() else 'Mixture'

    # Ratio & Proportion
    if 'proportion' in sf_clean.lower(): return 'Proportion'
    if 'ratio' in sf_clean.lower() and 'proportion' not in sf_clean.lower(): return 'Ratio'

    # Sheets with Sheet-01, Sheet-02, Sheet-03
    m_sh = re.search(r'Sheet\s*[-–—]?\s*0?(\d+)', sf_clean, re.I)
    if m_sh:
        sh_num = m_sh.group(1)
        if 'pro level' in sf_clean.lower():
            return f'Pro Level (Sheet {sh_num})'
        return f'ClassRoom (Sheet {sh_num})'

    if sheet_type == 'Pro Level':
        return 'Pro Level'
    return 'ClassRoom'

def main():
    if not os.path.exists(MASTER_FILE):
        print(f"Error: {MASTER_FILE} does not exist.")
        return

    with open(MASTER_FILE, 'r', encoding='utf-8') as f:
        raw_questions = json.load(f)

    print(f"Loaded {len(raw_questions)} raw RK Ranjan questions.")

    verified = []
    omitted = 0

    for q in raw_questions:
        raw_opts = q.get('options', [])
        if not isinstance(raw_opts, list) or len(raw_opts) != 4:
            omitted += 1
            continue

        opts = [clean_option(o) for o in raw_opts]

        # Omit dummy [Option A, Option B, Option C, Option D]
        if [o.lower() for o in opts] == ['option a', 'option b', 'option c', 'option d']:
            omitted += 1
            continue

        # Omit if any option is empty
        if any(not o for o in opts):
            omitted += 1
            continue

        # Omit if options are not distinct
        if len(set(opts)) != 4:
            omitted += 1
            continue

        # Check question stem
        stem = clean_text(q.get('question', ''))
        if not stem or len(stem) < 5:
            omitted += 1
            continue

        # Check answer range
        ans = q.get('correctAnswer')
        if not isinstance(ans, int) or ans < 0 or ans > 3:
            omitted += 1
            continue

        expl = clean_text(q.get('explanation', ''))
        if not expl:
            expl = f"Correct Answer: Option {chr(65 + ans)} | ({opts[ans]})"

        q_item = {
            'id': q['id'],
            'subject': 'Quantitative Aptitude',
            'subSubject': 'RK Ranjan Math',
            'faculty': 'RK Ranjan',
            'chapter': q['chapter'].strip(),
            'type': assign_question_type(q),
            'sheetType': q.get('sheetType', 'ClassRoom'),
            'sheetFile': q.get('sheetFile', ''),
            'question': stem,
            'options': opts,
            'correctAnswer': ans,
            'explanation': expl
        }

        # Zero Hindi check
        full_text = q_item['question'] + ' ' + ' '.join(q_item['options']) + ' ' + q_item['explanation']
        if re.search(r'[\u0900-\u097F]', full_text):
            omitted += 1
            continue

        verified.append(q_item)

    print(f"Verified {len(verified)} discrepancy-free questions (omitted {omitted}).")

    with open(MASTER_FILE, 'w', encoding='utf-8') as f:
        json.dump(verified, f, indent=2, ensure_ascii=False)

    print(f"Successfully saved purified dataset to {MASTER_FILE}!")

if __name__ == '__main__':
    main()
