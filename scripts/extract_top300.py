#!/usr/bin/env python3
"""
scripts/extract_top300.py
Extracts pure English questions and options from data/Top 300 Questions.pdf
"""

import fitz
import re
import json
import os

PDF_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'Top 300 Questions.pdf')

def is_devanagari_char(c):
    return '\u0900' <= c <= '\u097F'

def clean_en_line(line):
    d_indices = [i for i, c in enumerate(line) if is_devanagari_char(c)]
    if d_indices:
        first_d = min(d_indices)
        en = line[:first_d].strip()
        return en
    return line.strip()

def clean_option_text(text):
    if not text:
        return ""
    # Strip any trailing standalone letters like A, B, C, D or numbers that preceded Hindi
    text = re.sub(r'\s+[A-D]$', '', text)
    text = re.sub(r'\s+\d+$', '', text)
    # Strip repeated markers like (a) Gangue (a) -> (a) Gangue
    text = re.sub(r'\s*\([a-d]\)$', '', text)
    text = re.sub(r'\s*\([ivx]+\)$', '', text)
    # Strip double slashes or colons
    text = re.sub(r'\s*/+\s*', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip(' :/-|')
    return text

def parse_all_slides():
    doc = fitz.open(PDF_PATH)
    questions = []
    seen_stems = {}

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        raw_text = page.get_text()
        
        # Must be a question slide
        if 'SCIENCE TOP 300' not in raw_text and 'Group D' not in raw_text and 'ALP' not in raw_text:
            continue
        
        # Check for options A, B, C, D markers
        if not (re.search(r'\bA\b', raw_text) and re.search(r'\bB\b', raw_text) and re.search(r'\bC\b', raw_text) and re.search(r'\bD\b', raw_text)):
            continue

        blocks = page.get_text('blocks')
        text_blocks = [b for b in blocks if b[6] == 0]
        # Sort vertically by y0, then x0
        text_blocks.sort(key=lambda b: (round(b[1] / 15) * 15, b[0]))

        exam_tag = 'RRB Group D | ALP | Technician | JE'
        q_num = None

        # Find q_num from blocks or lines
        for b in text_blocks:
            t = b[4].strip()
            if 'Technician | JE' in t:
                m = re.search(r'(\d+)', t)
                if m:
                    q_num = int(m.group(1))
                    break

        is_match_list = 'Match List' in raw_text
        stem_lines = []
        option_candidates = []

        for b in text_blocks:
            y0 = b[1]
            raw_lines = [l.strip() for l in b[4].split('\n') if l.strip()]
            
            # Skip header and footer
            if y0 < 75:
                continue
            if y0 > 485:
                continue
            
            for line in raw_lines:
                en = clean_en_line(line)
                if not en:
                    continue
                # Skip footer or helpline lines
                if any(k in en for k in ['SCIENCE TOP 300', '7374019437', 'TELEGRAM', 'COURSE ENQUIRY', 'INSTALL SCIENCE MAGNET APP']):
                    continue
                
                if is_match_list:
                    if y0 < 390 and not re.match(r'^\([a-d]\)-', en):
                        stem_lines.append(en)
                    else:
                        option_candidates.append((y0, b[0], en))
                else:
                    if y0 < 210:
                        stem_lines.append(en)
                    else:
                        option_candidates.append((y0, b[0], en))

        # Reconstruct clean question stem
        clean_stem_lines = []
        for l in stem_lines:
            cl = clean_option_text(l)
            if cl and not re.match(r'^[A-D]$', cl):
                clean_stem_lines.append(cl)
        
        question_stem = ' '.join(clean_stem_lines)
        question_stem = re.sub(r'\s+', ' ', question_stem).strip()

        # Deduplication check
        norm_key = re.sub(r'[^a-z0-9]+', '', question_stem.lower())[:150]
        if not norm_key or len(norm_key) < 15:
            continue
        if norm_key in seen_stems:
            continue
        seen_stems[norm_key] = page_idx + 1

        questions.append({
            'page_num': page_idx + 1,
            'q_num': q_num,
            'question': question_stem,
            'raw_options': option_candidates
        })

    return questions

if __name__ == '__main__':
    qs = parse_all_slides()
    print(f"Extracted {len(qs)} distinct questions.")
    for q in qs[:5]:
        print(f"Slide {q['page_num']} (Q#{q['q_num']}): {q['question'][:100]}")
