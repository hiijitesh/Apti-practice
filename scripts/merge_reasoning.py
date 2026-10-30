#!/usr/bin/env python3
"""
scripts/merge_reasoning.py
Merges all Calendar Reasoning part files (part_01 through part_06)
into consolidated JSON datasets with base64 Data URI diagrams:
  - data/calendar_reasoning.json & public/data/calendar_reasoning.json
  - data/reasoning.json & public/data/reasoning.json
"""

import json
import os
import glob

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_DATA_DIR = os.path.join(BASE_DIR, 'public', 'data')

def to_data_uri(diag):
    if isinstance(diag, dict) and 'data' in diag:
        mime = diag.get('mime_type', 'image/jpeg')
        return f"data:{mime};base64,{diag['data']}"
    elif isinstance(diag, str):
        return diag
    return ''

def merge_reasoning_parts():
    pattern = os.path.join(DATA_DIR, 'calendar_reasoning_part_*.json')
    parts = sorted(glob.glob(pattern))
    if not parts:
        print("No calendar_reasoning_part_*.json files found.")
        return

    print(f"Found {len(parts)} part files to merge.")
    all_questions = []
    chapter_name = 'GENERAL REASONING'
    subject_name = 'Reasoning'
    source_name = ''

    for part_file in parts:
        with open(part_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        chapter_name = data.get('chapter', chapter_name)
        subject_name = data.get('subject', subject_name)
        source_name = data.get('source', source_name)
        qs = data.get('questions', [])
        print(f"  - {os.path.basename(part_file)}: {len(qs)} questions")

        for q in qs:
            if 'diagram' in q and q['diagram']:
                q['diagram'] = to_data_uri(q['diagram'])
            all_questions.append(q)

    # Sort strictly by q_num
    all_questions.sort(key=lambda q: q.get('q_num', 0))
    total_qs = len(all_questions)
    print(f"Total merged questions: {total_qs}")

    # Flat representation (single chapter document)
    flat_data = {
        'chapter': chapter_name,
        'subject': subject_name,
        'total_questions': total_qs,
        'source': source_name,
        'questions': all_questions
    }

    # Chapter-keyed representation (matching science.json format)
    keyed_data = {
        chapter_name: {
            'chapter': chapter_name,
            'subject': subject_name,
            'total_questions': total_qs,
            'source': source_name,
            'questions': all_questions
        }
    }

    # Save to public/data/
    os.makedirs(PUBLIC_DATA_DIR, exist_ok=True)

    cal_path = os.path.join(PUBLIC_DATA_DIR, 'calendar_reasoning.json')
    with open(cal_path, 'w', encoding='utf-8') as f:
        json.dump(flat_data, f, ensure_ascii=False)
    print(f"Saved: {cal_path} ({os.path.getsize(cal_path)} bytes)")

    reas_path = os.path.join(PUBLIC_DATA_DIR, 'reasoning.json')
    with open(reas_path, 'w', encoding='utf-8') as f:
        json.dump(keyed_data, f, ensure_ascii=False)
    print(f"Saved: {reas_path} ({os.path.getsize(reas_path)} bytes)")

    print("Reasoning merge complete with base64 Data URI images!")

if __name__ == '__main__':
    merge_reasoning_parts()
