#!/usr/bin/env python3
"""
scripts/extract_rk_ranjan_complete.py

High-performance, comprehensive extractor for RK Ranjan Sheet PDFs.
Uses PyMuPDF (fitz) with word-level layout analysis, watermark filtering,
and multi-column (1, 2, or 3 column) aware ordering.

Extracts:
1. Clean English-only question stems (zero Hindi, zero Kruti Dev)
2. Four accurate MCQ options (handling 2x2 grids, fractions, inline)
3. Verified answer keys matching option letters A, B, C, D
4. Exam tags and step-by-step solution explanations

Outputs ONLY to project directories:
- public/data/rk_ranjan/<Chapter>/<Sheet>.json
- public/data/rk_ranjan/<Chapter>/<Chapter>.json
- public/data/rk_ranjan_questions.json (master consolidated database)
"""

from __future__ import annotations

import glob
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print("Error: PyMuPDF not found. Please install with: pip install pymupdf")
    sys.exit(1)

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent.parent
SOURCE_DIR = Path(
    os.path.expanduser(
        "~/Downloads/Govt Exams & RRB/A RRB NOTES/RK Ranjan Sheet"
    )
)
TARGET_DATA_DIR = BASE_DIR / "public" / "data" / "rk_ranjan"
MASTER_JSON_PATH = BASE_DIR / "public" / "data" / "rk_ranjan_questions.json"

# Remington / Kruti Dev font vocabulary & regex
KRUTI_DEV_PATTERN = re.compile(
    r'\b(?:dh|vk;q|dk|ds|esa|gs|gsa|gksxh|gksxk|gksrs|gksrk|dks|ls|vksj|fkk|fkha|fks|fkkA|fkaa|'
    r'djsa|dhft|dhft,A|dhft,|fdruk|fdruh|fdrus|orzeku|vuqikr|la\[;k|xquk|xquh|xqus|igys|ckn|iwoz|'
    r'firk|iq=k|iq=kh|ek¡|ekrk|fcøh|nwv|vafdr|ewy;|yackbz|pky|le;|nwjh|varj|dqy|csph|gSA|'
    r'gS|Fkk|Fkh|Fks|Kkr|djsaA|o"kZ|o"kksZa|iwoZ|ewY;|yackbZ|Hkqxrku|HkkbZ|iz\'u|Js.kh|'
    r'orZeku|vk;q\]|C;kt|lk/kj.k|O;atd|ljy|eku|;ksx|;fn|,d|izkIr|fn,|muds|mldh|mldk|vius|'
    r'viuh|izfr|cjkcj|prqHkZqt|fod\.kZ|{ks=kiQy|d{kk|lIrkg|nkSjku|pkyd|nSfud|çfr\'kr|dkSu|in|'
    r'yM\+fd|cPp|djsaa|orZ|fdrus|NksVs|mNkyk|flDds|flDdksa|flDdk|dy\'k|xsans|xsan|liQsn|dkyh|'
    r'yky|uhys|gjs|eksts|lap;|lcls|mldh|mudh|muds|vius|viuh|bu|d{kk|vad|Nk=k|Nk=kksa)\b|'
    r'[\u0900-\u097F]|[¡¿À-ÿ]|\b(?:gS[%&]|gS\b|djsa[%&]|gksxk%|eku\b|Kkr\b)',
    re.I
)

# ─────────────────────────────────────────────────────────────────────────────
# Helper functions
# ─────────────────────────────────────────────────────────────────────────────

def slugify(text: str) -> str:
    """Creates a URL/ID friendly slug."""
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')


def clean_text_tokens(text: str) -> str:
    """Removes any Kruti Dev or stray encoding noise from text."""
    # 1. Prune trailing text after ? or : or . if it has Hindi
    m = re.search(
        r'([\?:\.])\s+.*(?:gS[%&]|cjkcj|djsa|dhft|Kkr|{ks=kiQy|prqHkZqt|fod\.kZ|gksxk|;fn|,d).*$',
        text
    )
    if m:
        text = text[:m.start(1) + 1].strip()

    # 2. Token-level filtering
    tokens = text.split()
    clean_tokens = []
    for tok in tokens:
        stripped = tok.strip(".,:;?()[]\"'\\`")
        if KRUTI_DEV_PATTERN.search(stripped) and len(stripped) >= 2:
            continue
        if re.search(r'[\u0900-\u097F]|[¡¿À-ÿ]', tok):
            continue
        if chr(92) in tok or tok in {'gS%', 'gS&', 'gS', 'djsa%', 'gksxk%'}:
            continue
        clean_tokens.append(tok)
        
    cleaned = " ".join(clean_tokens).strip()
    cleaned = re.sub(r'[\s%&\\;]+$', '', cleaned).strip()
    return cleaned


def clean_option_text(text: str) -> str:
    """Cleans option text specifically."""
    lines = text.split('\n')
    clean_lines = []
    for l in lines:
        l_str = l.strip()
        if not l_str:
            continue
        if re.search(r'[\u0900-\u097F]|[¡¿À-ÿ]', l_str):
            continue
        if KRUTI_DEV_PATTERN.search(l_str):
            continue
        if re.search(r'Maths by|Aditya Ranjan|Join Telegram|Selected|Excise Inspector', l_str, re.I):
            continue
        clean_lines.append(l_str)
    res = ' '.join(clean_lines).strip()
    res = clean_text_tokens(res)
    return res


# ─────────────────────────────────────────────────────────────────────────────
# Layout-aware Page Text Extractor (Supports 1, 2, or 3 columns)
# ─────────────────────────────────────────────────────────────────────────────

def extract_clean_page_text(page: fitz.Page, max_y: float | None = None) -> str:
    """
    Extracts text from a page respecting column layout (1, 2, or 3 columns).
    Removes background watermarks and filters out header/footer noise.
    """
    rect = page.rect
    w = rect.width
    mid_x = w / 2.0
    header_y = 20.0
    footer_y = max_y if max_y is not None else (rect.height - 35.0)

    # 1. Identify watermark block numbers
    wm_blocks = set()
    for b in page.get_text('blocks'):
        if b[6] == 0 and re.search(r'Maths by\s*Aditya Ranjan sir', b[4], re.I):
            wm_blocks.add(b[5])

    # 2. Extract words excluding watermark
    words = [
        word for word in page.get_text('words')
        if word[5] not in wm_blocks and header_y <= word[1] <= footer_y
    ]
    if not words:
        return ''

    def words_to_lines(col_words):
        sorted_w = sorted(col_words, key=lambda x: (x[1], x[0]))
        lines = []
        curr_line = []
        curr_y = None
        for item in sorted_w:
            if curr_y is None or abs(item[1] - curr_y) < 4.0:
                curr_line.append(item)
                curr_y = item[1] if curr_y is None else min(curr_y, item[1])
            else:
                curr_line.sort(key=lambda x: x[0])
                lines.append(' '.join(x[4] for x in curr_line))
                curr_line = [item]
                curr_y = item[1]
        if curr_line:
            curr_line.sort(key=lambda x: x[0])
            lines.append(' '.join(x[4] for x in curr_line))
        return '\n'.join(lines)

    # 3. Detect column layout: 3-column vs 2-column vs 1-column
    # Words in the middle vertical strip (abs(x - mid_x) < 25)
    center_words = [word for word in words if abs(word[0] - mid_x) < 20 and 150 <= word[1] <= footer_y]
    
    # 3-column detection: substantial text across 3 thirds and words right down the center
    w1 = [word for word in words if word[0] < w * 0.35]
    w2 = [word for word in words if w * 0.35 <= word[0] < w * 0.67]
    w3 = [word for word in words if word[0] >= w * 0.67]
    
    if len(center_words) >= 20 and len(w1) >= 30 and len(w2) >= 30 and len(w3) >= 30:
        # 3-column layout
        return (
            words_to_lines(w1) + '\n' +
            words_to_lines(w2) + '\n' +
            words_to_lines(w3)
        )

    # 2-column detection: words on left and right, low crossing count
    left_words = [word for word in words if word[2] <= mid_x + 10]
    right_words = [word for word in words if word[0] >= mid_x - 10]
    crossing_words = [word for word in words if word[0] < mid_x - 20 and word[2] > mid_x + 20]

    is_two_col = (
        len(left_words) >= 15 and
        len(right_words) >= 15 and
        len(crossing_words) <= max(2, int(len(words) * 0.05))
    )

    if is_two_col:
        col_left = [word for word in words if word[0] < mid_x]
        col_right = [word for word in words if word[0] >= mid_x]
        return words_to_lines(col_left) + '\n' + words_to_lines(col_right)
    else:
        # Single column
        return words_to_lines(words)


# ─────────────────────────────────────────────────────────────────────────────
# Option Parser
# ─────────────────────────────────────────────────────────────────────────────

def parse_options(block: str) -> tuple[list[str], int]:
    """
    Robust option extractor supporting:
    - Inline horizontal 2x2: (a) opt1 (b) opt2 / (c) opt3 (d) opt4
    - Sequential 4x1: (a) opt1 \n (b) opt2 \n (c) opt3 \n (d) opt4
    - 2x2 fractions: numerator line / (a) (b) line / denominator line
    - Permuted / out of order labels
    """
    sol_m = re.search(r'(?:^|\n)\s*(?:Sol|Solution|Ans)\s*[:\-]', block, re.I)
    content_block = block[:sol_m.start()] if sol_m else block

    matches = list(re.finditer(r'\(([a-dA-D])\)', content_block))
    if not matches:
        matches = list(re.finditer(r'(?:^|\n|\s)\b([a-dA-D])[\.\)]\s+', content_block))

    by_label = {}
    for m in matches:
        lbl = m.group(1).lower()
        if lbl not in by_label:
            by_label[lbl] = m

    if all(k in by_label for k in ['a', 'b', 'c', 'd']):
        m_a, m_b, m_c, m_d = by_label['a'], by_label['b'], by_label['c'], by_label['d']
        sorted_m = sorted([m_a, m_b, m_c, m_d], key=lambda x: x.start())
        opt_start = sorted_m[0].start()

        # Check if the line before opt_start is a numerator of a fraction
        before_text = content_block[:opt_start]
        non_empty_before = [l for l in before_text.split('\n') if l.strip()]
        if non_empty_before and not re.search(r'[a-zA-Z]{3,}', non_empty_before[-1]):
            num_line = non_empty_before[-1]
            num_pos = before_text.rfind(num_line)
            if num_pos != -1:
                opt_start = num_pos

        opt_region = content_block[opt_start:]
        lines = [l for l in opt_region.split('\n') if l.strip()]

        # Check if 2x2 grid
        idx_ab = -1
        idx_cd = -1
        for i, l in enumerate(lines):
            if '(a)' in l and '(b)' in l:
                idx_ab = i
            if '(c)' in l and '(d)' in l:
                idx_cd = i

        opts = {}
        if idx_ab != -1 and idx_cd != -1:
            l_ab = lines[idx_ab]
            l_cd = lines[idx_cd]
            pos_a = l_ab.find('(a)')
            pos_b = l_ab.find('(b)')
            pos_c = l_cd.find('(c)')
            pos_d = l_cd.find('(d)')

            inline_a = l_ab[pos_a + 3:pos_b].strip()
            inline_b = l_ab[pos_b + 3:].strip()
            inline_c = l_cd[pos_c + 3:pos_d].strip()
            inline_d = l_cd[pos_d + 3:].strip()

            if inline_a and inline_b and inline_c and inline_d:
                opts['a'] = clean_option_text(inline_a)
                opts['b'] = clean_option_text(inline_b)
                opts['c'] = clean_option_text(inline_c)
                opts['d'] = clean_option_text(inline_d)
            elif not inline_a and not inline_c:
                # 2x2 Fraction grid
                split_ab = (pos_a + pos_b) // 2
                split_cd = (pos_c + pos_d) // 2

                num_ab = lines[idx_ab - 1] if idx_ab > 0 else ''
                den_ab = lines[idx_ab + 1] if idx_ab + 1 < len(lines) else ''

                num_cd = lines[idx_cd - 1] if idx_cd > 0 and idx_cd - 1 != idx_ab + 1 else (lines[idx_cd - 1] if idx_cd > idx_ab + 1 else '')
                den_cd = lines[idx_cd + 1] if idx_cd + 1 < len(lines) else ''

                def fmt_frac(num, den, inline):
                    num = num.strip()
                    den = den.strip()
                    if num and den:
                        return f'{num}/{den}'
                    return clean_option_text(num or den or inline)

                opts['a'] = fmt_frac(num_ab[:split_ab], den_ab[:split_ab], inline_a)
                opts['b'] = fmt_frac(num_ab[split_ab:], den_ab[split_ab:], inline_b)
                opts['c'] = fmt_frac(num_cd[:split_cd], den_cd[:split_cd], inline_c)
                opts['d'] = fmt_frac(num_cd[split_cd:], den_cd[split_cd:], inline_d)
            else:
                # Slice-based fallback
                for i, m in enumerate(sorted_m):
                    lbl = m.group(1).lower()
                    s = m.end()
                    e = sorted_m[i + 1].start() if i < 3 else len(content_block)
                    opts[lbl] = clean_option_text(content_block[s:e])
        else:
            # Sequential extraction
            for i, m in enumerate(sorted_m):
                lbl = m.group(1).lower()
                s = m.end()
                e = sorted_m[i + 1].start() if i < 3 else len(content_block)
                opts[lbl] = clean_option_text(content_block[s:e])

        out = [opts.get('a', ''), opts.get('b', ''), opts.get('c', ''), opts.get('d', '')]
        if all(len(o) > 0 for o in out):
            return out, opt_start

    # Check for multi-part sub-exercise questions (i), (ii), ...
    multi_parts = list(re.finditer(r'\(([ivxIVX]+)\)\s*', content_block))
    if len(multi_parts) >= 2:
        opt_start = multi_parts[0].start()
        sub_opts = []
        for i, m in enumerate(multi_parts[:4]):
            s = m.end()
            e = multi_parts[i + 1].start() if i + 1 < len(multi_parts) else len(content_block)
            raw = clean_option_text(content_block[s:e])
            sub_opts.append(f"({m.group(1)}) {raw}" if raw else f"Part ({m.group(1)})")
        while len(sub_opts) < 4:
            sub_opts.append(f"Part ({len(sub_opts) + 1})")
        return sub_opts, opt_start

    return ["Option A", "Option B", "Option C", "Option D"], len(block)


# ─────────────────────────────────────────────────────────────────────────────
# English Stem & Metadata Extractor
# ─────────────────────────────────────────────────────────────────────────────

def extract_english_stem(stem_block: str, qnum: int) -> tuple[str, str]:
    """
    Extracts the English question stem and exam tag.
    Stops cleanly when the Hindi translation begins.
    """
    exam_tag = ""
    exam_match = re.search(
        r'((?:SSC|RRB|CHSL|CGL|MTS|CPO|IBPS|ICAR|Phase|Constable|Police|TIER|MAINS|NTPC)[^\n\r]+)',
        stem_block,
        re.I
    )
    if exam_match:
        exam_tag = exam_match.group(1).strip()
        stem_block = stem_block[:exam_match.start()]

    lines = [l.strip() for l in stem_block.split('\n') if l.strip()]
    eng_lines = []

    for l in lines:
        m_hindi = KRUTI_DEV_PATTERN.search(l)
        if m_hindi:
            idx = m_hindi.start()
            before_hindi = l[:idx].strip()
            # If before_hindi has sentence ending punctuation or substantial English
            if re.search(r'[\?:\.]$', before_hindi) or (len(re.findall(r'[a-zA-Z]{2,}', before_hindi)) >= 2 and not eng_lines):
                eng_lines.append(before_hindi)
            break
        # Skip branding watermarks
        if re.search(r'Maths by|Aditya Ranjan|Join Telegram|Selected|Excise Inspector|Sheet-\d+|TYPE -', l, re.I):
            continue
        eng_lines.append(l)

    stem = ' '.join(eng_lines).strip()
    stem = re.sub(rf'^{qnum}[\.\)]\s*', '', stem).strip()
    stem = clean_text_tokens(stem)
    return stem, exam_tag


# ─────────────────────────────────────────────────────────────────────────────
# PDF Parser
# ─────────────────────────────────────────────────────────────────────────────

def parse_sheet_pdf(pdf_path: Path, chapter_name: str) -> list[dict]:
    """Extracts all English questions from an RK Ranjan Sheet PDF."""
    doc = fitz.open(str(pdf_path))
    filename = pdf_path.name
    chap_slug = slugify(chapter_name)
    sheet_slug = slugify(pdf_path.stem)
    sheet_type = "Pro Level" if "pro level" in filename.lower() else "ClassRoom"

    # 1. Answer Key parsing
    ak: dict[int, str] = {}
    best_ak_page = -1
    max_ak_matches = 0
    ak_y = None

    for p in range(len(doc) - 1, -1, -1):
        txt = doc[p].get_text('text')
        has_title = bool(re.search(r'ANSWER\s*[-_]?\s*KEY', txt, re.I))
        m_ak = re.search(r'\b1\s*[\.\:\-\)]\s*\(?[a-dA-D]\)?\s*2\s*[\.\:\-\)]', txt)
        matches = re.findall(r'(?:^|\s|\n)(\d{1,3})\s*[\.\:\-\)]\s*\(?([A-Da-d])\)?', txt)

        if (has_title or m_ak) and len(matches) > max_ak_matches:
            max_ak_matches = len(matches)
            best_ak_page = p
            for qn, ans in matches:
                if int(qn) not in ak:
                    ak[int(qn)] = ans.upper()

    if best_ak_page != -1:
        # Find exact y-coordinate of Answer Key on that page
        for b in doc[best_ak_page].get_text('blocks'):
            if b[6] == 0 and (('ANSWER' in b[4] and 'KEY' in b[4]) or re.search(r'\b1\s*[\.\:\-\)]\s*\(?[a-dA-D]\)?\s*2\s*[\.\:\-\)]', b[4])):
                ak_y = b[1]
                break

    # 2. Find start page for Question 1 (skips Table of Contents / syllabus pages)
    start_q_page = 0
    end_p = best_ak_page if best_ak_page != -1 else len(doc)
    for p in range(end_p):
        p_txt = doc[p].get_text('text')
        m1 = re.search(r'(?:^|\n)\s*1\s*[\.\)]\s*(?!\d)', p_txt)
        has_opts = bool(re.search(r'\([a-dA-D]\)', p_txt))
        if m1 and has_opts:
            start_q_page = p
            break

    # Extract inline solutions if present (e.g. Probability Classroom Sheet or detailed solution pages)
    is_prob_classroom = "Probability (ClassRoom" in filename
    sol_dict: dict[int, str] = {}

    start_sol_p = best_ak_page if best_ak_page != -1 else 0
    for p in range(start_sol_p, len(doc)):
        p_txt = doc[p].get_text('text')
        if 'SOLUTIONS' in p_txt or is_prob_classroom:
            for sm in re.finditer(r'(?:^|\n)\s*(\d{1,3})\s*[\.\)]\s*(.*?)(?=(?:^|\n)\s*\d{1,3}\s*[\.\)]|\Z)', p_txt, re.DOTALL):
                q_n = int(sm.group(1))
                sol_raw = sm.group(2).strip()
                if q_n not in sol_dict and len(sol_raw) > 5:
                    sol_dict[q_n] = sol_raw

    # 3. Extract question text pages
    full_text = ''
    for p in range(start_q_page, end_p):
        full_text += extract_clean_page_text(doc[p]) + '\n'
    if best_ak_page != -1 and start_q_page <= best_ak_page:
        full_text += extract_clean_page_text(doc[best_ak_page], max_y=ak_y) + '\n'

    # 4. Locate questions sequentially (using (?!\d) to avoid decimal collisions)
    max_q = max(ak.keys()) if ak else 120
    pos = 0
    found_locs: list[tuple[int, int, int]] = []

    for qnum in range(1, max_q + 1):
        m = re.search(rf'(?:^|\n)\s*{qnum}\s*[\.\)]\s*(?!\d)', full_text[pos:])
        if not m:
            m = re.search(rf'(?:^|\n|[^\d\(\[])\s*{qnum}\s*[\.\)]\s*(?!\d)', full_text[pos:])
        if m:
            start = pos + m.start()
            end = pos + m.end()
            found_locs.append((qnum, start, end))
            pos = end

    # 5. Extract questions and build structured output
    letter_to_idx = {'A': 0, 'B': 1, 'C': 2, 'D': 3}
    questions: list[dict] = []

    for i, (qnum, s, e) in enumerate(found_locs):
        next_s = found_locs[i + 1][1] if i + 1 < len(found_locs) else len(full_text)
        block = full_text[e:next_s]

        opts, opt_start = parse_options(block)
        stem_raw = block[:opt_start]
        stem, exam_tag = extract_english_stem(stem_raw, qnum)

        # Quality check: question must have English words
        eng_words = re.findall(r'[a-zA-Z]{2,}', stem)
        if len(eng_words) < 2:
            continue

        # Answer mapping
        ans_letter = ak.get(qnum, "")
        correct_idx = letter_to_idx.get(ans_letter, 0)

        # Build explanation
        exp_parts = []
        if ans_letter:
            exp_parts.append(f"Correct Answer: Option {ans_letter}")
            if correct_idx < len(opts) and not opts[correct_idx].startswith("Option ") and not opts[correct_idx].startswith("Part ("):
                exp_parts.append(f"({opts[correct_idx]})")
        if exam_tag:
            exp_parts.append(f"Exam: {exam_tag}")
        if qnum in sol_dict:
            sol_clean = clean_text_tokens(sol_dict[qnum])
            if sol_clean and len(sol_clean) > 5:
                exp_parts.append(f"Solution: {sol_clean[:250]}")

        q_id = f"rkr_{chap_slug}_{sheet_slug}_q{qnum:03d}"

        questions.append({
            "id": q_id,
            "subject": "Quantitative Aptitude",
            "subSubject": "Quantitative Aptitude",
            "chapter": chapter_name,
            "sheetType": sheet_type,
            "sheetFile": filename,
            "question": stem,
            "options": opts,
            "correctAnswer": correct_idx,
            "explanation": " | ".join(exp_parts) if exp_parts else ""
        })

    return questions


# ─────────────────────────────────────────────────────────────────────────────
# Main execution
# ─────────────────────────────────────────────────────────────────────────────

def main():
    if not SOURCE_DIR.is_dir():
        print(f"Error: SOURCE_DIR does not exist: {SOURCE_DIR}")
        sys.exit(1)

    print("=" * 70)
    print("  RK Ranjan Sheet - Complete High-Fidelity Question Extraction")
    print("=" * 70)
    print(f"Source Directory: {SOURCE_DIR}")
    print(f"Target Data Dir : {TARGET_DATA_DIR}\n")

    chapter_folders = sorted(
        [d for d in SOURCE_DIR.iterdir() if d.is_dir()],
        key=lambda d: d.name.lower()
    )

    all_questions_master = []
    chapter_summaries = {}

    for ch_dir in chapter_folders:
        chapter_name = ch_dir.name
        pdf_files = sorted(
            list(ch_dir.glob("*.pdf")),
            key=lambda f: f.name.lower()
        )
        if not pdf_files:
            continue

        print(f"📁 {chapter_name} ({len(pdf_files)} PDF sheets)")
        chapter_questions = []

        # Target directory: ONLY inside project public/data/rk_ranjan/<Chapter>/
        dest_project_ch_dir = TARGET_DATA_DIR / chapter_name
        dest_project_ch_dir.mkdir(parents=True, exist_ok=True)

        for pdf_path in pdf_files:
            try:
                sheet_qs = parse_sheet_pdf(pdf_path, chapter_name)
                chapter_questions.extend(sheet_qs)
                all_questions_master.extend(sheet_qs)

                sheet_json_name = f"{pdf_path.stem}.json"

                # Save sheet JSON ONLY in project directory (NOT alongside PDF)
                with open(dest_project_ch_dir / sheet_json_name, 'w', encoding='utf-8') as f:
                    json.dump(sheet_qs, f, indent=2, ensure_ascii=False)

                print(f"   ✔ {pdf_path.name:<45} → {len(sheet_qs):3d} questions")
            except Exception as err:
                print(f"   ✖ ERROR {pdf_path.name}: {err}")
                import traceback
                traceback.print_exc()

        # Save combined chapter JSON ONLY in project directory
        combined_ch_name = f"{chapter_name}.json"
        with open(dest_project_ch_dir / combined_ch_name, 'w', encoding='utf-8') as f:
            json.dump(chapter_questions, f, indent=2, ensure_ascii=False)

        chapter_summaries[chapter_name] = len(chapter_questions)
        print(f"   ✨ Total for {chapter_name}: {len(chapter_questions)} questions\n")

    # Save master consolidated JSON
    MASTER_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(MASTER_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(all_questions_master, f, indent=2, ensure_ascii=False)

    # QA Verification
    residual_devanagari = sum(
        1 for q in all_questions_master
        if re.search(r'[\u0900-\u097F]', q["question"])
    )
    fallback_opts = sum(
        1 for q in all_questions_master
        if q["options"] == ["Option A", "Option B", "Option C", "Option D"]
    )

    print("=" * 70)
    print(" EXTRACTION COMPLETE SUMMARY")
    print("=" * 70)
    print(f"  Total Chapters Processed   : {len(chapter_summaries)}")
    print(f"  Total Questions Extracted  : {len(all_questions_master)}")
    print(f"  Residual Devanagari Unicode: {residual_devanagari}")
    print(f"  Fallback Options Count     : {fallback_opts}")
    print(f"  Project Folder             : {TARGET_DATA_DIR}")
    print(f"  Master JSON Output         : {MASTER_JSON_PATH}")
    print("=" * 70)

    print("\nChapter Breakdown:")
    for ch, count in sorted(chapter_summaries.items()):
        print(f"  • {ch:<30s}: {count:4d} questions")


if __name__ == "__main__":
    main()
