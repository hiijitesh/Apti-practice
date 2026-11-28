#!/usr/bin/env python3
"""
scripts/build_dixit_replacements.py

Extracts authentic questions for all duplicated/corrupted question IDs from Dixit Sir's PDFs.
"""

import os
import re
import json
import fitz

DIXIT_DIR = "/Users/hiijitesh/Downloads/Govt Exams & RRB/A RRB NOTES/ADixit Sir Sheet"

def get_answer_key(pdf_name):
    doc = fitz.open(os.path.join(DIXIT_DIR, pdf_name))
    full = ''
    for p in doc:
        full += p.get_text() + '\n'
    m = re.search(r'(?:Answer\s*Key|ANSWER\s*KEY|Ans\s*Key)[\s\S]*', full, re.IGNORECASE)
    if not m:
        return {}
    key_text = m.group(0)
    matches = re.findall(r'(\d+)[\.\s\-\)]+\(?([a-dA-D])\)?', key_text)
    return {int(k): v.upper() for k, v in matches}

def strip_hindi(text):
    return re.sub(r'[\u0900-\u097F]+', '', text)

def clean_str(s):
    s = strip_hindi(s)
    s = re.sub(r'[ \t]+', ' ', s)
    return s.strip()

def parse_slide(sol_pdf, slide_num):
    doc = fitz.open(os.path.join(DIXIT_DIR, sol_pdf))
    page = doc[slide_num - 1]
    raw = page.get_text().strip()
    lines = [l.strip() for l in raw.split('\n') if l.strip()]
    
    # Filter out type header banners
    filtered_lines = []
    for l in lines:
        if re.match(r'^(?:[Tt]ype\s*[-–\d\w\s:,–\./&]+|[A-Z]\.\s+[A-Za-z\s]+)$', l) and len(l) < 60:
            continue
        filtered_lines.append(l)
    
    text = '\n'.join(filtered_lines)
    
    # Split using Hindi block: English Stem -> Hindi Block -> Options
    hindi_matches = list(re.finditer(r'[\u0900-\u097F]', text))
    if hindi_matches:
        stem_part = text[:hindi_matches[0].start()].strip()
        opts_part = text[hindi_matches[-1].end():].strip()
    else:
        # Fallback if slide is pure English (e.g. no Hindi)
        pats_opt = r'(?:^|\n|\s+)(?:\([aA]\)|[aA][\.\)]|\b[aA](?=\d))\s*'
        m_opt = re.search(pats_opt, text)
        stem_part = text[:m_opt.start()].strip() if m_opt else text
        opts_part = text[m_opt.start():].strip() if m_opt else ''
    
    stem_eng = clean_str(stem_part)
    # Strip any leading Type header
    stem_eng = re.sub(r'^[Tt]ype\s*[-–\d\w\s,–\./&]+?\s*(?=(?:[A-Z][a-z]+|If|A|What|Find|The|In|When|Two|Three)\b)', '', stem_eng)
    stem_eng = ' '.join(stem_eng.split())
    
    options = []
    exam_tag = ""
    
    if opts_part:
        pats = [
            r'(?:^|\n|\s+)(?:\([aA]\)|[aA][\.\)]|\b[aA]\s+|\b[aA](?=\d))\s*',
            r'(?:^|\n|\s+)(?:\([bB]\)|[bB][\.\)]|\b[bB]\s+|\b[bB](?=\d))\s*',
            r'(?:^|\n|\s+)(?:\([cC]\)|[cC][\.\)]|\b[cC]\s+|\b[cC](?=\d))\s*',
            r'(?:^|\n|\s+)(?:\([dD]\)|[dD][\.\)]|\b[dD]\s+|\b[dD](?=\d))\s*'
        ]
        
        m_a = re.search(pats[0], opts_part)
        m_b = re.search(pats[1], opts_part)
        m_c = re.search(pats[2], opts_part)
        m_d = re.search(pats[3], opts_part)
        
        if m_a and m_b and m_c and m_d:
            opt_a = opts_part[m_a.end():m_b.start()].strip()
            opt_b = opts_part[m_b.end():m_c.start()].strip()
            opt_c = opts_part[m_c.end():m_d.start()].strip()
            rest_d = opts_part[m_d.end():].strip()
            
            exam_m = re.search(r'(SSC\s+[^\n]+|RRB\s+[^\n]+|Selection\s+Post[^\n]+|CGL[^\n]+|CHSL[^\n]+|CPO[^\n]+|MTS[^\n]+|Group-D[^\n]+|NTPC[^\n]+|CDSE[^\n]+|Phase\s+[^\n]+)', rest_d, re.IGNORECASE)
            if exam_m:
                opt_d = rest_d[:exam_m.start()].strip()
                exam_tag = exam_m.group(0).strip()
            else:
                opt_d = rest_d.strip()
                
            for opt in [opt_a, opt_b, opt_c, opt_d]:
                opt_c = clean_str(opt)
                opt_c = ' '.join(opt_c.split())
                options.append(opt_c)
                
    return stem_eng, options, exam_tag
