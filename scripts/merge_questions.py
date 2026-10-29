#!/usr/bin/env python3
"""
scripts/merge_questions.py
Merges Quantitative Aptitude questions with General Science questions into standardized schema.
Outputs to:
  - data/questions.json
  - public/data/questions.json
"""

import json
import os
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
PUBLIC_DATA_DIR = os.path.join(BASE_DIR, 'public', 'data')

APTI_FILE = os.path.join(DATA_DIR, 'questions.json')
SCI_SOURCE_FILE = os.path.join(DATA_DIR, 'science.json')
if not os.path.exists(SCI_SOURCE_FILE):
    # Fallback to absolute external path if needed
    SCI_SOURCE_FILE = '/Users/hiijitesh/Downloads/Govt Exams & RRB/A RRB NOTES/A Science Magnet/Chapterwise_Questions/All_Chapters_Questions_Master.json'

OUTPUT_DATA_FILE = os.path.join(DATA_DIR, 'questions.json')
OUTPUT_PUBLIC_FILE = os.path.join(PUBLIC_DATA_DIR, 'questions.json')

CHAPTER_TITLE_MAP = {
    'BLOOD': 'Blood',
    'BOTANY': 'Botany',
    'CELL': 'Cell',
    'CIRCULATORY SYSTEM': 'Circulatory System',
    'CLASSIFICATION OF ORGANISMS': 'Classification of Organisms',
    'DIGESTIVE SYSTEM': 'Digestive System',
    'ENDOCRINE SYSTEM': 'Endocrine System',
    'ENVIRONMENT': 'Environment',
    'EXCRETORY SYSTEM': 'Excretory System',
    'HEREDITY': 'Heredity',
    'IMPROVEMENT IN FOOD RESOURCES': 'Improvement in Food Resources',
    'NERVOUS SYSTEM': 'Nervous System',
    'NUTRITION': 'Nutrition',
    'REPRODUCTION IN ORGANISMS': 'Reproduction in Organisms',
    'RESPIRATORY SYSTEM': 'Respiratory System',
    'TISSUE': 'Tissue',
    'ACIDS, BASES AND SALT': 'Acids, Bases and Salt',
    'ATOM AND MOLECULE': 'Atom and Molecule',
    'CARBON AND ITS COMPOUNDS': 'Carbon and its Compounds',
    'CHEMICAL REACTIONS AND EQUATIONS': 'Chemical Reactions and Equations',
    'CLASSIFICATION OF MATTER': 'Classification of Matter',
    'MATTER': 'Matter',
    'METALS AND NON-METALS': 'Metals and Non-Metals',
    'STRUCTURE OF ATOM': 'Structure of Atom',
    'ELECTRICITY': 'Electricity',
    'GRAVITATION': 'Gravitation',
    'HUMAN EYE': 'Human Eye',
    'MAGNETIC EFFECT OF CURRENT': 'Magnetic Effect of Current',
    'MOTION': 'Motion',
    'PRISM': 'Prism',
    'REFLECTION OF LIGHT': 'Reflection of Light',
    'REFRACTION': 'Refraction',
    'SOUND': 'Sound',
    'WORK, ENERGY AND POWER': 'Work, Energy and Power'
}

SUB_SUBJECT_MAP = {
    'Bio': 'Biology',
    'Chemistry': 'Chemistry',
    'Physics': 'Physics'
}

def main():
    print(f"Loading Aptitude questions from {APTI_FILE}...")
    with open(APTI_FILE, 'r', encoding='utf-8') as f:
        apti_data = json.load(f)

    # Standardize aptitude questions
    tagged_apti = []
    for item in apti_data:
        # If it's an existing Apti question
        if item.get('subject') != 'General Science':
            tagged_item = {
                'id': item['id'],
                'subject': 'Quantitative Aptitude',
                'subSubject': 'Quantitative Aptitude',
                'chapter': item['chapter'],
                'question': item['question'],
                'options': item['options'],
                'correctAnswer': item['correctAnswer'],
                'explanation': item['explanation']
            }
            tagged_apti.append(tagged_item)

    print(f"Loaded {len(tagged_apti)} Quantitative Aptitude questions across 17 chapters.")

    print(f"Loading Science questions from {SCI_SOURCE_FILE}...")
    with open(SCI_SOURCE_FILE, 'r', encoding='utf-8') as f:
        sci_raw = json.load(f)

    converted_sci = []
    omitted = []

    for ch_raw, data in sci_raw.items():
        ch_title = CHAPTER_TITLE_MAP.get(ch_raw, ch_raw.title())
        subj_code = data.get('subject', '')
        sub_subject = SUB_SUBJECT_MAP.get(subj_code, subj_code or 'General Science')
        ch_slug = re.sub(r'[^a-z0-9]+', '_', ch_title.lower()).strip('_')

        q_idx = 1
        for q in data.get('questions', []):
            qnum = q.get('q_num')
            qtext = (q.get('question') or '').strip()
            opts = dict(q.get('options') or {})
            ans_letter = (q.get('answer') or '').strip().upper()
            exam_tag = (q.get('exam_tag') or '').strip()

            # Manual corrections for questions with minor formatting gaps
            if ch_raw == 'MOTION' and qnum == 25:
                ans_letter = 'A'
                opts['C'] = opts.get('C') or 'Non-uniform motion'
            elif ch_raw == 'MOTION' and qnum == 37:
                ans_letter = 'D'
            elif ch_raw == 'MATTER' and qnum == 4:
                opts['D'] = opts.get('D') or 'None of the above'
            elif ch_raw == 'REFRACTION' and qnum == 1:
                opts['D'] = opts.get('D') or 'Equal in all three'

            # Omission checks
            if not qtext:
                omitted.append((ch_title, qnum, 'Empty question stem'))
                continue
            if ans_letter not in ('A', 'B', 'C', 'D'):
                omitted.append((ch_title, qnum, f'Invalid answer {ans_letter}'))
                continue

            opt_a = str(opts.get('A', '')).strip()
            opt_b = str(opts.get('B', '')).strip()
            opt_c = str(opts.get('C', '')).strip()
            opt_d = str(opts.get('D', '')).strip()
            if not opt_a or not opt_b or not opt_c or not opt_d:
                omitted.append((ch_title, qnum, 'Incomplete options'))
                continue

            opt_list = [opt_a, opt_b, opt_c, opt_d]
            letter_to_idx = {'A': 0, 'B': 1, 'C': 2, 'D': 3}
            correct_idx = letter_to_idx[ans_letter]
            correct_text = opt_list[correct_idx]

            expl = f'Correct Answer: Option {ans_letter}'
            if correct_text:
                expl += f' | ({correct_text})'
            if exam_tag:
                expl += f' | Exam: {exam_tag}'

            sci_item = {
                'id': f'sci_{ch_slug}_q{str(q_idx).zfill(3)}',
                'subject': 'General Science',
                'subSubject': sub_subject,
                'chapter': ch_title,
                'question': qtext,
                'options': opt_list,
                'correctAnswer': correct_idx,
                'explanation': expl
            }
            converted_sci.append(sci_item)
            q_idx += 1

    print(f"Converted {len(converted_sci)} Science questions across {len(sci_raw)} chapters.")
    print(f"Omitted {len(omitted)} incomplete questions:")
    for o in omitted:
        print(f"  - {o[0]} Q{o[1]}: {o[2]}")

    # Combine all questions
    combined = tagged_apti + converted_sci
    print(f"Total combined questions: {len(combined)}")

    # Ensure output directories exist
    os.makedirs(os.path.dirname(OUTPUT_DATA_FILE), exist_ok=True)
    os.makedirs(os.path.dirname(OUTPUT_PUBLIC_FILE), exist_ok=True)

    print(f"Writing to {OUTPUT_DATA_FILE}...")
    with open(OUTPUT_DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(combined, f, indent=2, ensure_ascii=False)

    print(f"Writing to {OUTPUT_PUBLIC_FILE}...")
    with open(OUTPUT_PUBLIC_FILE, 'w', encoding='utf-8') as f:
        json.dump(combined, f, indent=2, ensure_ascii=False)

    print("Successfully generated merged question datasets!")

if __name__ == '__main__':
    main()
