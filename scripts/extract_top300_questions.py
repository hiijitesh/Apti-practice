#!/usr/bin/env python3
"""
scripts/extract_top300_questions.py
Extracts pure English questions and options from data/Top 300 Questions.pdf
"""

import fitz
import re
import json
import os

SOURCES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'scripts', 'sources')
PDF_PATH = os.path.join(SOURCES_DIR, 'Top 300 Questions.pdf')
OUT_PATH = os.path.join(SOURCES_DIR, 'top300_extracted.json')

def is_devanagari_char(c):
    return '\u0900' <= c <= '\u097F'

def is_devanagari_text(text):
    return any(is_devanagari_char(c) for c in text)

def clean_opt_text(text):
    if not text:
        return ""
    # Strip any trailing standalone letters or digits like ' A', ' 1' that preceded Hindi
    text = re.sub(r'\s+[A-D]$', '', text)
    # Strip repeated marker artifacts like (a) Gangue (a) -> (a) Gangue
    text = re.sub(r'(\([a-d]\))\s*$', '', text)
    text = re.sub(r'\s+', ' ', text).strip(' :-|')
    return text

def clean_stem_text(text):
    if not text:
        return ""
    # Strip repeated letter/roman markers before list II: (a) Gangue (a) -> (a) Gangue
    text = re.sub(r'\(([a-d])\)\s+([^(]+?)\s+\(\1\)', r'(\1) \2', text)
    text = re.sub(r'\(([ivx]+)\)\s+([^(]+?)\s+\(\1\)', r'(\1) \2', text)
    text = re.sub(r'\s+', ' ', text).strip(' :-|')
    return text

def get_markers(words):
    candidates = {'A': [], 'B': [], 'C': [], 'D': []}
    for w in words:
        if w[4] in candidates and 180 <= w[1] <= 480:
            candidates[w[4]].append(w)
    if any(len(candidates[k]) == 0 for k in ['A', 'B', 'C', 'D']):
        return None
    markers = {}
    for k in ['A', 'B', 'C', 'D']:
        best = sorted(candidates[k], key=lambda w: (abs((w[2]-w[0]) - 16), w[1]))[0]
        markers[k] = best
    return markers

def extract_en_words(page):
    words = page.get_text('words')
    # Filter words strictly before footer
    words = [w for w in words if w[1] < 485]
    
    # Identify first Hindi character x0 in each (block_no, line_no)
    line_hindi_x = {}
    for w in words:
        if is_devanagari_text(w[4]):
            key = (w[5], w[6])
            if key not in line_hindi_x or w[0] < line_hindi_x[key]:
                line_hindi_x[key] = w[0]
                
    en_words = []
    for w in words:
        key = (w[5], w[6])
        if key in line_hindi_x:
            if w[2] <= line_hindi_x[key] + 1.5:
                en_words.append(w)
        else:
            en_words.append(w)
    return en_words

def extract_question_data(page, page_idx):
    raw_text = page.get_text()
    if 'SCIENCE TOP 300' not in raw_text and 'Group D' not in raw_text and 'ALP' not in raw_text:
        return None
        
    en_words = extract_en_words(page)
    markers = get_markers(en_words)
    if not markers:
        return None
        
    is_match_list = 'Match List' in raw_text
    min_my = min(m[1] for m in markers.values()) - 35
    
    # 1. Extract Question Stem
    # Stem words are between y=70 and min_my (or y=390 if match list)
    cutoff = 390 if is_match_list else min_my
    stem_words = [w for w in en_words if 70 <= w[1] < cutoff]
    # Filter out header tags like 'Technician', 'JE', question number
    filtered_stem_words = []
    for w in stem_words:
        if w[1] < 90 and w[4] in ['Group', 'D', '|', 'ALP', 'RRB', 'Technician', 'JE']:
            continue
        if w[1] < 90 and re.match(r'^\d+$', w[4]):
            continue
        filtered_stem_words.append(w)
        
    stem_words_sorted = sorted(filtered_stem_words, key=lambda w: (round(w[1] / 12) * 12, w[0]))
    raw_stem = ' '.join(w[4] for w in stem_words_sorted)
    clean_stem = clean_stem_text(raw_stem)
    
    if len(clean_stem) < 15:
        return None
        
    # 2. Extract Options
    opt_words = {'A': [], 'B': [], 'C': [], 'D': []}
    
    for w in en_words:
        wx0, wy0, txt = w[0], w[1], w[4]
        if wy0 < min_my: continue
        # Skip markers themselves
        if any(abs(wx0 - m[0]) < 3 and abs(wy0 - m[1]) < 3 for m in markers.values()):
            continue
            
        valid_markers = [m for m in markers.items() if wx0 >= m[1][0] - 10]
        if not valid_markers: continue
            
        best_opt = None
        best_cost = 999999
        for opt, m in valid_markers:
            y_diff = abs(wy0 - m[1])
            x_diff = wx0 - m[0]
            if x_diff < -10: continue
            cost = y_diff * 3.0 + x_diff * 0.5
            if cost < best_cost:
                best_cost = cost
                best_opt = opt
                
        if best_opt and best_cost < 350:
            opt_words[best_opt].append(w)
            
    options = {}
    for opt in ['A', 'B', 'C', 'D']:
        ow = sorted(opt_words[opt], key=lambda w: (round(w[1] / 12) * 12, w[0]))
        otext = ' '.join(w[4] for w in ow)
        options[opt] = clean_opt_text(otext)
        
    # Verify all 4 options exist
    if any(not options[k] for k in ['A', 'B', 'C', 'D']):
        return None
        
    return {
        'slide_num': page_idx + 1,
        'question': clean_stem,
        'options': [options['A'], options['B'], options['C'], options['D']],
        'options_dict': options
    }

def main():
    doc = fitz.open(PDF_PATH)
    print(f"Opened {PDF_PATH} ({len(doc)} pages)...")
    
    extracted = []
    seen = {}
    
    for page_idx in range(len(doc)):
        res = extract_question_data(doc[page_idx], page_idx)
        if not res:
            continue
            
        norm_key = re.sub(r'[^a-z0-9]+', '', res['question'].lower())[:120]
        if norm_key in seen:
            print(f"Skipping duplicate slide {res['slide_num']} (matches slide {seen[norm_key]})")
            continue
        seen[norm_key] = res['slide_num']
        extracted.append(res)
        
    print(f"\nExtracted {len(extracted)} distinct questions.")
    
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(extracted, f, ensure_ascii=False, indent=2)
    print(f"Saved extracted questions to {OUT_PATH}")

if __name__ == '__main__':
    main()
