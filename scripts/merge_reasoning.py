#!/usr/bin/env python3
"""
scripts/merge_reasoning.py
Merges all Calendar Reasoning part files (part_01 through part_06)
into consolidated JSON datasets:
  - data/calendar_reasoning.json & public/data/calendar_reasoning.json
  - data/reasoning.json & public/data/reasoning.json
"""

import json
import os
import glob

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
PUBLIC_DATA_DIR = os.path.join(BASE_DIR, 'public', 'data')

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
        all_questions.extend(qs)

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

    # Save to both data/ and public/data/
    for out_dir in [DATA_DIR, PUBLIC_DATA_DIR]:
        os.makedirs(out_dir, exist_ok=True)

        cal_path = os.path.join(out_dir, 'calendar_reasoning.json')
        with open(cal_path, 'w', encoding='utf-8') as f:
            json.dump(flat_data, f, ensure_ascii=False)
        print(f"Saved: {cal_path} ({os.path.getsize(cal_path)} bytes)")

        reas_path = os.path.join(out_dir, 'reasoning.json')
        with open(reas_path, 'w', encoding='utf-8') as f:
            json.dump(keyed_data, f, ensure_ascii=False)
        print(f"Saved: {reas_path} ({os.path.getsize(reas_path)} bytes)")

    print("Reasoning merge complete!")

if __name__ == '__main__':
    merge_reasoning_parts()
