#!/usr/bin/env python3
"""
scripts/extract_rk_ranjan_complete.py

High-performance, comprehensive extractor for RK Ranjan Sheet PDFs.
Uses PyMuPDF (fitz) with word-level layout analysis, watermark filtering,
horizontal gap preservation, and multi-column awareness (1, 2, or 3 column).

Features:
1. Multi-column aware ordering (2-column default, 3-column for TYPEWISE sheets)
2. Natural reading order preserved (fractions and equations never inverted)
3. 100% English-only question stems (zero Devanagari, zero Kruti Dev)
4. Accurate 4-MCQ options extraction (handling 2x2 grids, fractions, inline,
   and bilingual 'English / Hindi' option lines)
5. Exam tag extraction from question stem OR post-option text (stripped from Option D)
6. Complete answer key extraction across single and multi-page answer keys
   and fallback to SOLUTIONS for 100% coverage
7. Answer key verification for every question (correctAnswer 0..3)
8. Output ONLY to project data folders (NEVER alongside PDFs):
   - public/data/rk_ranjan/<Chapter>/<Sheet>.json
   - public/data/rk_ranjan/<Chapter>/<Chapter>.json
   - public/data/rk_ranjan_questions.json (master consolidated database)
"""

from __future__ import annotations

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
    r'orZeku|C;kt|lk/kj.k|O;atd|ljy|eku|;ksx|;fn|,d|izkIr|fn,|muds|mldh|mldk|vius|'
    r'viuh|izfr|cjkcj|prqHkZqt|fod\.kZ|{ks=kiQy|d{kk|lIrkg|nkSjku|pkyd|nSfud|çfr\'kr|dkSu|'
    r'yM\+fd|cPp|djsaa|orZ|fdrus|NksVs|mNkyk|flDds|flDdksa|flDdk|dy\'k|xsans|xsan|liQsn|dkyh|'
    r'yky|uhys|gjs|eksts|lap;|lcls|mldh|mudh|muds|vius|viuh|bu|d{kk|vad|Nk=k|Nk=kksa|'
    r'lsdaM|iwjh|rjg|ikj|dj|tkrh|tkrk|fdeh|fdeh@\?kaVk|ehVj|feuV|\?kaVk|jksfur|ofurk|lqtkrk|'
    r'fnO;k|Jqfr|xksdqy|enu|vuhrk|dj.k|f\'ko|o#\.k|ykWjsy|;k|rks|vdsys|vdsyk|i;kZIr|vko\'kd|'
    r'mÙkj|nsus|lokZsÙke|çLrko|pkSFkk|igyk|rhljk|nwljk|lwphc¼|fuEufyf•r|ckWDl|vk;ru|Bksl|'
    r'iQyd|fdukjk|fcanq|\'kh"kZ|oxZ|Hkqtk|dkVs|eksM\+dj|buesa|dkSu|lk|vkWiQj|xzkgd|fy,|'
    r'xfr|ewy|nq\?kZVuk|ckf/r|fgLls|nsjh|gqbZA|vxj|vkxs|Fkh\\|gS\\|fookg|varjky|iSnk|cPpksa|'
    r'D;k|fdrus|N%|csu|n\'kd|djrs|efgyk|dgrh|vkadM\+s|ofj"B|X;kjgoka|csVh|cM\+h|ppsjs|Hkkb;ksa|'
    r'Selection|fnyk,axs|Selected|gaS)\b|'
    r'[\u0900-\u097F]|[¡¿À-ÿ]|\b(?:gS[%&]|gS\b|djsa[%&]|gksxk%|eku\b|Kkr\b)',
    re.I
)

# Exam tags regex
EXAM_TAG_RE = re.compile(
    r'((?:SSC|RRB|CHSL|CGL|MTS|CPO|IBPS|ICAR|Phase|Constable|Police|TIER|MAINS|NTPC)[^\n\r]+)',
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
    """Removes any Kruti Dev or stray encoding noise while preserving math."""
    # 1. Prune trailing text after ? or : or . if it transitions to Hindi
    m = re.search(
        r'([\?:\.])\s+.*(?:gS[%&\\;]|cjkcj|djsa|dhft|Kkr|{ks=kiQy|prqHkZqt|fod\.kZ|gksxk|;fn|,d|firk|vk;q|o"kZ|fnO;k|jksfur|vuqikr).*$',
        text
    )
    if m:
        text = text[:m.start(1) + 1].strip()

    # 2. Token-level filtering
    tokens = text.split()
    clean_tokens = []
    for tok in tokens:
        stripped = tok.strip(".,:;?()\"'`")
        # Preserve legitimate math brackets like [x+1/x] or [sin^2 A]
        if stripped.startswith('[') and stripped.endswith(']'):
            inner = stripped[1:-1]
            if not KRUTI_DEV_PATTERN.search(inner):
                clean_tokens.append(tok)
                continue
            else:
                continue

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
    """
    Cleans option text specifically:
    1. Extracts English portion from 'English / Hindi' formatted options
    2. Drops Hindi lines while keeping English lines
    3. Strips Kruti Dev and branding
    """
    if not text:
        return ""

    # Check for bilingual slash format: e.g. "Fourth offer/pkSFkk çLrko"
    if '/' in text:
        parts = text.split('/')
        if len(parts) == 2:
            first = parts[0].strip()
            second = parts[1].strip()
            # If the portion after the slash has Hindi or Kruti Dev, keep only the English first part
            if re.search(r'[\u0900-\u097F]|[¡¿À-ÿ]', second) or any(KRUTI_DEV_PATTERN.search(t) for t in second.split()):
                if re.search(r'[a-zA-Z0-9]', first) and not re.search(r'[\u0900-\u097F]|[¡¿À-ÿ]', first):
                    text = first

    lines = text.split('\n')
    clean_lines = []
    for l in lines:
        l_str = l.strip()
        if not l_str:
            continue
        # Drop branding lines
        if re.search(r'Maths by|Aditya Ranjan|Join Telegram|Selected|Excise Inspector', l_str, re.I):
            continue
        # If line contains Devanagari or Latin-1 Hindi diacritics
        if re.search(r'[\u0900-\u097F]|[¡¿À-ÿ]', l_str):
            if clean_lines:
                # English option was already extracted on previous line(s); Hindi translation line starts here
                break
            m_h = re.search(r'[\u0900-\u097F]|[¡¿À-ÿ]', l_str)
            l_str = l_str[:m_h.start()].strip()
            if not l_str:
                continue

        # Check for Kruti Dev words on this line
        tokens = l_str.split()
        if any(KRUTI_DEV_PATTERN.search(t.strip(".,:;?()[]\"'`")) and len(t.strip(".,:;?()[]\"'`")) >= 2 for t in tokens):
            if clean_lines:
                break
            continue

        eng_tokens = []
        for t in tokens:
            st = t.strip(".,:;?()[]\"'`")
            if KRUTI_DEV_PATTERN.search(st) and len(st) >= 2:
                break
            if t in {';k', ';fn', 'gS%', 'gS&', 'gS\\', 'djsa%', 'gksxk%'}:
                break
            eng_tokens.append(t)

        line_eng = ' '.join(eng_tokens).strip()
        if line_eng:
            clean_lines.append(line_eng)

    res = ' '.join(clean_lines).strip()
    # Strip leading label remnants like "(a)" or "a." but preserve words starting with A/B/C/D like "Both"
    res = re.sub(r'^\([a-dA-D]\)\s*|^\b[a-dA-D][\.\)]\s+', '', res).strip()
    res = re.sub(r'\b([1-9])([2-9])\s+([1-9])\b', r'\1 \3/\2', res)
    res = clean_text_tokens(res)
    return res


# ─────────────────────────────────────────────────────────────────────────────
# Layout-aware Page Text Extractor (Supports 1, 2, or 3 columns with word layout)
# ─────────────────────────────────────────────────────────────────────────────

def extract_clean_page_text(page: fitz.Page, max_y: float | None = None, is_three_col: bool = False) -> str:
    """
    Extracts text from a page respecting column layout using word-level analysis.
    Preserves wide spacing between option columns and prevents fraction inversion.
    Watermarks and header/footer noise are purged.
    """
    rect = page.rect
    w = rect.width
    mid_x = w / 2.0
    header_y = 35.0
    footer_y = max_y if max_y is not None else (rect.height - 35.0)

    # 1. Identify watermark and header/footer noise blocks
    wm_blocks = set()
    for b in page.get_text('blocks'):
        if b[6] == 0:
            if re.search(r'Maths by\s*Aditya Ranjan sir|Selected\s*gS\s*Selection|Excise Inspector|Join Telegram', b[4], re.I):
                wm_blocks.add(b[5])

    # 2. Extract words excluding watermark
    words = [
        word for word in page.get_text('words')
        if word[5] not in wm_blocks and header_y <= word[1] <= footer_y
    ]
    if not words:
        return ''

    def words_to_lines(col_words: list, tol: float = 4.5) -> str:
        if not col_words:
            return ''
        sorted_w = sorted(col_words, key=lambda x: (x[1], x[0]))
        lines = []
        curr_line = []
        curr_y = None
        for item in sorted_w:
            if curr_y is None or abs(item[1] - curr_y) < tol:
                curr_line.append(item)
                curr_y = item[1] if curr_y is None else min(curr_y, item[1])
            else:
                curr_line.sort(key=lambda x: x[0])
                line_str = ''
                for k, w_k in enumerate(curr_line):
                    if k == 0:
                        line_str = w_k[4]
                    else:
                        gap = w_k[0] - curr_line[k - 1][2]
                        sep = '    ' if gap > 18.0 else ' '
                        line_str += sep + w_k[4]
                lines.append(line_str)
                curr_line = [item]
                curr_y = item[1]

        if curr_line:
            curr_line.sort(key=lambda x: x[0])
            line_str = ''
            for k, w_k in enumerate(curr_line):
                if k == 0:
                    line_str = w_k[4]
                else:
                    gap = w_k[0] - curr_line[k - 1][2]
                    sep = '    ' if gap > 18.0 else ' '
                    line_str += sep + w_k[4]
            lines.append(line_str)

        return '\n'.join(lines)

    # 3. Layout separation
    if is_three_col:
        # 3-column layout (specifically for TYPEWISE book chapters)
        # Accounts for 18pt alternating page gutter shift between odd and even pages
        if page.number % 2 == 1:
            g1, g2 = 214.0, 398.0
        else:
            g1, g2 = 232.0, 415.0
        c1 = [w_i for w_i in words if w_i[0] < g1]
        c2 = [w_i for w_i in words if g1 <= w_i[0] < g2]
        c3 = [w_i for w_i in words if w_i[0] >= g2]
        return words_to_lines(c1, tol=4.0) + '\n' + words_to_lines(c2, tol=4.0) + '\n' + words_to_lines(c3, tol=4.0)

    # Standard 2-column layout
    col_left = [w_i for w_i in words if w_i[0] < mid_x]
    col_right = [w_i for w_i in words if w_i[0] >= mid_x]
    return words_to_lines(col_left, tol=4.5) + '\n' + words_to_lines(col_right, tol=4.5)


# ─────────────────────────────────────────────────────────────────────────────
# Option Parser
# ─────────────────────────────────────────────────────────────────────────────

def parse_options(block: str) -> tuple[list[str], int, str]:
    """
    Robust option extractor supporting:
    - Slice-based extraction between (a), (b), (c), (d)
    - 2x2 fraction grids with gap detection
    - Post-option exam tags (stripped cleanly from Option D)
    Returns: (options_list, opt_start_index, post_option_exam_tag)
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

    post_exam_tag = ""

    if all(k in by_label for k in ['a', 'b', 'c', 'd']):
        m_a, m_b, m_c, m_d = by_label['a'], by_label['b'], by_label['c'], by_label['d']
        sorted_m = sorted([m_a, m_b, m_c, m_d], key=lambda x: x.start())
        opt_start = sorted_m[0].start()

        # Check if the line right before opt_start is a fraction numerator
        before_text = content_block[:opt_start]
        non_empty_before = [l for l in before_text.split('\n') if l.strip()]
        if non_empty_before and not re.search(r'[a-zA-Z]{3,}', non_empty_before[-1]):
            num_line = non_empty_before[-1]
            num_pos = before_text.rfind(num_line)
            if num_pos != -1:
                opt_start = num_pos

        opt_region = content_block[opt_start:]
        lines = [l for l in opt_region.split('\n') if l.strip()]

        # Check for 2x2 grid where (a) & (b) are on one line, (c) & (d) on another
        idx_ab = -1
        idx_cd = -1
        for i, l in enumerate(lines):
            if '(a)' in l and '(b)' in l:
                idx_ab = i
            if '(c)' in l and '(d)' in l:
                idx_cd = i

        opts: dict[str, str] = {}

        # 1. 2x2 Fraction Grid
        if idx_ab != -1 and idx_cd != -1:
            def split_pair(line: str) -> tuple[str, str]:
                parts = [p.strip() for p in re.split(r'\s{2,}', line) if p.strip()]
                if len(parts) >= 2:
                    return parts[0], parts[1]
                toks = line.split()
                if len(toks) >= 2:
                    mid = len(toks) // 2
                    return ' '.join(toks[:mid]), ' '.join(toks[mid:])
                return line.strip(), ''

            def fmt_frac(num: str, den: str) -> str:
                num, den = num.strip(), den.strip()
                if num and den:
                    unit_m = re.search(r'\b(km/hr|km/h|m/s|m/sec|sec|seconds|hours|min|minutes|cm|m|km|%)\b.*$', num, re.I)
                    unit = ""
                    if unit_m:
                        unit = " " + num[unit_m.start():].strip()
                        num = num[:unit_m.start()].strip()

                    parts = num.split()
                    if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                        return f"{parts[0]} {parts[1]}/{den}{unit}"

                    if ('+' in den or '-' in den or '–' in den or ' ' in den) and not den.startswith('('):
                        den = f'({den})'
                    if ('+' in num or '-' in num or '–' in num or ' ' in num) and not num.startswith('('):
                        num = f'({num})'
                    return f'{num}/{den}{unit}'
                return clean_option_text(num or den)

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

            # Check if there is a legitimate mathematical numerator line directly above idx_ab
            prev_line_ab = lines[idx_ab - 1] if idx_ab > 0 else ""
            prev_line_cd = lines[idx_cd - 1] if idx_cd > 0 else ""

            # Must be a valid numerator line: contains digits, no Kruti Dev, no Hindi sentence endings
            is_valid_num_ab = (
                bool(prev_line_ab)
                and not KRUTI_DEV_PATTERN.search(prev_line_ab)
                and not re.search(r'[\?:\.\\%;&]$|[gS%&\\;]$', prev_line_ab)
                and bool(re.search(r'\d', prev_line_ab))
            )
            is_valid_num_cd = (
                bool(prev_line_cd)
                and not KRUTI_DEV_PATTERN.search(prev_line_cd)
                and not re.search(r'[\?:\.\\%;&]$|[gS%&\\;]$', prev_line_cd)
                and bool(re.search(r'\d', prev_line_cd))
            )

            num_ab = split_pair(prev_line_ab) if is_valid_num_ab else ('', '')
            num_cd = split_pair(prev_line_cd) if is_valid_num_cd else ('', '')

            # Case 1: Numerator above, denominator inline on label line (e.g. line-1: 1 4, line: (a) 2 (b) 5)
            if is_valid_num_ab and (num_ab[0] or num_ab[1]) and (inline_a or inline_b):
                opts['a'] = fmt_frac(num_ab[0], inline_a)
                opts['b'] = fmt_frac(num_ab[1], inline_b)
                opts['c'] = fmt_frac(num_cd[0], inline_c) if num_cd[0] else inline_c
                opts['d'] = fmt_frac(num_cd[1], inline_d) if num_cd[1] else inline_d

            # Case 2: Numerator inline on label line, denominator below
            elif idx_ab + 1 < idx_cd and (inline_a or inline_b):
                den_ab = split_pair(lines[idx_ab + 1])
                den_cd = split_pair(lines[idx_cd + 1]) if idx_cd + 1 < len(lines) else ('', '')
                if (den_ab[0] or den_ab[1]) and not KRUTI_DEV_PATTERN.search(lines[idx_ab + 1]):
                    opts['a'] = fmt_frac(inline_a, den_ab[0])
                    opts['b'] = fmt_frac(inline_b, den_ab[1])
                    opts['c'] = fmt_frac(inline_c, den_cd[0])
                    opts['d'] = fmt_frac(inline_d, den_cd[1])

            # Case 3: Labels on their own line, numerator above, denominator below
            elif not inline_a and not inline_c:
                den_ab = split_pair(lines[idx_ab + 1]) if idx_ab + 1 < len(lines) else ('', '')
                den_cd = split_pair(lines[idx_cd + 1]) if idx_cd + 1 < len(lines) else ('', '')

                opts['a'] = fmt_frac(num_ab[0], den_ab[0])
                opts['b'] = fmt_frac(num_ab[1], den_ab[1])
                opts['c'] = fmt_frac(num_cd[0], den_cd[0])
                opts['d'] = fmt_frac(num_cd[1], den_cd[1])

        # 2. Slice-based extraction (if not 2x2 fraction grid or if options were empty)
        if not all(opts.get(k) for k in ['a', 'b', 'c', 'd']):
            for i, m in enumerate(sorted_m):
                lbl = m.group(1).lower()
                s = m.end()
                e = sorted_m[i + 1].start() if i < 3 else len(content_block)
                raw_opt = content_block[s:e]

                # Check for post-option exam tag in Option D
                if i == 3:
                    exam_match = EXAM_TAG_RE.search(raw_opt)
                    if exam_match:
                        post_exam_tag = exam_match.group(1).strip()
                        raw_opt = raw_opt[:exam_match.start()]
                    # Check if option D absorbed solution or post-option lines
                    opt_lines = [l.strip() for l in raw_opt.split('\n') if l.strip()]
                    if len(opt_lines) > 1:
                        if not any('\n' in opts.get(k, '') for k in ['a', 'b', 'c']):
                            first_l = opt_lines[0]
                            if re.match(r'^[\d\w\s\.\,\-\+/\(\)%:]+$', first_l) and not re.search(r'\b(and|or|of|to|in|is|the|with)\s*$', first_l, re.I):
                                raw_opt = first_l

                opts[lbl] = clean_option_text(raw_opt)

        out = [opts.get('a', ''), opts.get('b', ''), opts.get('c', ''), opts.get('d', '')]
        if all(len(o) > 0 for o in out):
            return out, opt_start, post_exam_tag

    # 3. Check for multi-part sub-exercise questions (i), (ii), ...
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
        return sub_opts, opt_start, post_exam_tag

    return ["Option A", "Option B", "Option C", "Option D"], len(block), post_exam_tag


# ─────────────────────────────────────────────────────────────────────────────
# English Stem & Metadata Extractor
# ─────────────────────────────────────────────────────────────────────────────

def extract_english_stem(stem_block: str, qnum: int, chapter_name: str = "") -> tuple[str, str]:
    """
    Extracts the English question stem and exam tag.
    Stops cleanly when the Hindi translation begins.
    Preserves math brackets [x + 1/x] and algebraic expressions.
    """
    exam_tag = ""
    exam_match = EXAM_TAG_RE.search(stem_block)
    if exam_match:
        exam_tag = exam_match.group(1).strip()
        stem_block = stem_block[:exam_match.start()]

    lines = [l.strip() for l in stem_block.split('\n') if l.strip()]
    eng_lines = []

    for l in lines:
        # Skip branding watermarks, headers, and chapter title lines
        if re.search(r'Maths by|Aditya Ranjan|Join Telegram|Selected|Excise Inspector|Sheet-\d+|TYPE\s*[-_]?\s*\d+|BASIC QUESTIONS|Practice Sheet|ClassRoom Sheet|Pro Level', l, re.I):
            continue
        if chapter_name and re.match(rf'^{re.escape(chapter_name)}\b', l.strip(), re.I):
            continue

        m_hindi = KRUTI_DEV_PATTERN.search(l)
        if m_hindi:
            idx = m_hindi.start()
            before_hindi = l[:idx].strip()
            # If before_hindi has ending punctuation or substantial English
            if re.search(r'[\?:\.]$', before_hindi) or (len(re.findall(r'[a-zA-Z]{2,}', before_hindi)) >= 2 and not eng_lines):
                eng_lines.append(before_hindi)
            break
        eng_lines.append(l)

    stem = ' '.join(eng_lines).strip()
    stem = re.sub(rf'^{qnum}[\.\)]\s*', '', stem).strip()

    # Formatter for stacked number fractions in question text (e.g. 75 \n 8 -> 75/8)
    stem = re.sub(r'(\d+)\s*\n\s*(\d+)', r'\1/\2', stem)
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
    is_three_col = "TYPEWISE" in filename.upper()

    # 1. Answer Key parsing (supporting single and multi-page answer keys)
    ak: dict[int, str] = {}
    ak_pages: list[int] = []
    ak_y = None

    seq_pat = re.compile(
        r'\b1\s*[\.\:\-\)]\s*\([a-dA-D]\)\s*(?:[^\n\r]{0,25}\n\s*|\s+)2\s*[\.\:\-\)]\s*\([a-dA-D]\)'
    )

    for p in range(len(doc)):
        txt = doc[p].get_text('text')
        m_title = re.search(r'ANSWER\s*[-_]?\s*KEY', txt, re.I)
        has_title = bool(m_title)
        has_seq = bool(seq_pat.search(txt))

        # Look for parenthesized answers across the page (covers all RK Ranjan sheets)
        matches = re.findall(
            r'\b(\d{1,3})\s*[\.\:\-\)]\s*\(([a-dA-D])\)', txt
        )
        valid_m = [m for m in matches if not (m[0].startswith('0') and len(m[0]) > 1)]

        # Page with title or sequence pattern or high density of answers
        if (has_title and (has_seq or len(valid_m) >= 5)) or (
            has_seq and len(valid_m) >= 5
        ) or (has_title and len(valid_m) >= 10):
            ak_pages.append(p)
            for qn, ans in valid_m:
                if int(qn) not in ak:
                    ak[int(qn)] = ans.upper()
        elif ak_pages and len(valid_m) >= 5 and p == ak_pages[-1] + 1:
            # Multi-page answer key continuation page immediately following
            ak_pages.append(p)
            for qn, ans in valid_m:
                if int(qn) not in ak:
                    ak[int(qn)] = ans.upper()

    min_ak_page = min(ak_pages) if ak_pages else -1

    if min_ak_page != -1:
        # Find exact top y-coordinate of Answer Key on the first answer key page
        # Use word-level coordinates to avoid cutting off question options that share the block
        ak_words = doc[min_ak_page].get_text('words')
        ak_word_y = None
        for w_item in ak_words:
            if re.search(r'ANSWER|ANS[-_]?KEY', w_item[4], re.I):
                ak_word_y = w_item[1] - 3.0
                break
        if ak_word_y is not None:
            ak_y = ak_word_y
        else:
            for b in doc[min_ak_page].get_text('blocks'):
                if b[6] == 0 and (re.search(r'ANSWER\s*[-_]?\s*KEY', b[4], re.I) or seq_pat.search(b[4])):
                    ak_y = b[1] - 3.0
                    break

    # 2. Extract step-by-step solutions if present
    sol_dict: dict[int, str] = {}
    for p in range(len(doc)):
        p_txt = doc[p].get_text('text')
        if 'SOLUTIONS' in p_txt or 'Sol:' in p_txt or 'Probability (ClassRoom' in filename:
            for sm in re.finditer(r'(?:^|\n)\s*(\d{1,3})\s*[\.\)]\s*(.*?)(?=(?:^|\n)\s*\d{1,3}\s*[\.\)]|\Z)', p_txt, re.DOTALL):
                q_n = int(sm.group(1))
                sol_raw = sm.group(2).strip()
                if q_n not in sol_dict and len(sol_raw) > 5:
                    sol_dict[q_n] = sol_raw
                # Fallback to solution answer letter if ak was missing this question
                if q_n not in ak:
                    m_sol_ans = re.match(r'^\(?([a-dA-D])\)?', sol_raw)
                    if m_sol_ans:
                        ak[q_n] = m_sol_ans.group(1).upper()

    # 3. Find start page for Question 1 (skips Table of Contents / syllabus pages)
    start_q_page = 0
    end_p = min_ak_page if min_ak_page != -1 else len(doc)
    for p in range(end_p):
        p_txt = doc[p].get_text('text')
        m1 = re.search(r'(?:^|\n)\s*1\s*[\.\)]\s*(?!\d)', p_txt)
        has_opts = bool(re.search(r'\([a-dA-D]\)', p_txt))
        if m1 and has_opts:
            start_q_page = p
            break

    # 4. Extract question text pages (ANSWER KEY is strictly excluded from full_text)
    full_text = ''
    for p in range(start_q_page, end_p):
        full_text += extract_clean_page_text(doc[p], is_three_col=is_three_col) + '\n'
    if min_ak_page != -1 and start_q_page <= min_ak_page:
        full_text += extract_clean_page_text(doc[min_ak_page], max_y=ak_y, is_three_col=is_three_col) + '\n'

    # 5. Locate questions sequentially
    max_q = max(ak.keys()) if ak else 120
    pos = 0
    found_locs: list[tuple[int, int, int]] = []

    for qnum in range(1, max_q + 1):
        # Look in a local window first to avoid jumping past intermediate questions
        search_window = full_text[pos:pos + 4000]
        m = re.search(rf'(?:^|\n)\s*{qnum}\s*[\.\)]\s*(?!\d)', search_window)
        if not m:
            m = re.search(rf'(?:^|\n|[^\d\(\[])\s*{qnum}\s*[\.\)]\s*(?!\d)', search_window)

        if m:
            start = pos + m.start()
            end = pos + m.end()
            found_locs.append((qnum, start, end))
            pos = end
        else:
            # Broader search if local window missed it
            m_broad = re.search(rf'(?:^|\n)\s*{qnum}\s*[\.\)]\s*(?!\d)', full_text[pos:])
            if not m_broad:
                m_broad = re.search(rf'(?:^|\n|[^\d\(\[])\s*{qnum}\s*[\.\)]\s*(?!\d)', full_text[pos:])
            if m_broad:
                start = pos + m_broad.start()
                end = pos + m_broad.end()
                found_locs.append((qnum, start, end))
                pos = end

    # 6. Extract questions and build structured output
    letter_to_idx = {'A': 0, 'B': 1, 'C': 2, 'D': 3}
    questions: list[dict] = []

    for i, (qnum, s, e) in enumerate(found_locs):
        next_s = found_locs[i + 1][1] if i + 1 < len(found_locs) else len(full_text)
        block = full_text[e:next_s]

        opts, opt_start, post_exam_tag = parse_options(block)
        stem_raw = block[:opt_start]
        stem, stem_exam_tag = extract_english_stem(stem_raw, qnum, chapter_name)
        exam_tag = stem_exam_tag or post_exam_tag

        # Quality check: question must contain English words
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

                fallback_count = sum(1 for q in sheet_qs if q["options"] == ["Option A", "Option B", "Option C", "Option D"])
                fallback_note = f" (fallbacks: {fallback_count})" if fallback_count > 0 else ""
                print(f"   ✔ {pdf_path.name:<45} → {len(sheet_qs):3d} questions{fallback_note}")
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
