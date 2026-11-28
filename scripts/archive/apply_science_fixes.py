#!/usr/bin/env python3
"""
scripts/apply_science_fixes.py
Replaces the 17 duplicate questions across 10 General Science chapters with authentic,
unique questions extracted from the original Science Magnet slide presentations.
Updates:
  - public/data/questions.json
  - scripts/sources/science.json
"""

import json
import os
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_QUESTIONS_PATH = os.path.join(BASE_DIR, 'public', 'data', 'questions.json')
SCIENCE_SOURCE_PATH = os.path.join(BASE_DIR, 'scripts', 'sources', 'science.json')

REPLACEMENTS = {
    'sci_botany_q007': {
        'id': 'sci_botany_q007',
        'subject': 'General Science',
        'subSubject': 'Biology',
        'chapter': 'Botany',
        'raw_chapter': 'BOTANY',
        'q_num': 7,
        'question': 'Which of the following is a mechanical method of weed control?',
        'options': [
            'Hand weeding',
            'Seed treatment',
            'Spraying herbicides',
            'Crop rotation'
        ],
        'correctAnswer': 0,
        'ans_letter': 'A',
        'exam_tag': 'RRB ALP 18/03/2026 Shift 3',
        'slidePage': 3,
        'explanation': 'Correct Answer: Option A | (Hand weeding) | Exam: RRB ALP 18/03/2026 Shift 3 | Slide: Page 3'
    },
    'sci_cell_q060': {
        'id': 'sci_cell_q060',
        'subject': 'General Science',
        'subSubject': 'Biology',
        'chapter': 'Cell',
        'raw_chapter': 'CELL',
        'q_num': 60,
        'question': 'Which of the following processes represents the most specific purpose of meiotic cell division?',
        'options': [
            'Digestion',
            'Reproduction',
            'Excretion',
            'Respiration'
        ],
        'correctAnswer': 1,
        'ans_letter': 'B',
        'exam_tag': 'RRB Group-D, 26/12/2025 (Shift-3)',
        'slidePage': 17,
        'explanation': 'Correct Answer: Option B | (Reproduction) | Exam: RRB Group-D, 26/12/2025 (Shift-3) | Slide: Page 17'
    },
    'sci_nutrition_q009': {
        'id': 'sci_nutrition_q009',
        'subject': 'General Science',
        'subSubject': 'Biology',
        'chapter': 'Nutrition',
        'raw_chapter': 'NUTRITION',
        'q_num': 9,
        'question': 'Which of the following is an insectivorous plant?',
        'options': [
            'Mushroom',
            'Lichens',
            'Cuscuta',
            'Pitcher plant'
        ],
        'correctAnswer': 3,
        'ans_letter': 'D',
        'exam_tag': 'RRB Group-D- 16/09/2022 (Shift-III)',
        'slidePage': 9,
        'explanation': 'Correct Answer: Option D | (Pitcher plant) | Exam: RRB Group-D- 16/09/2022 (Shift-III) | Slide: Page 9'
    },
    'sci_nutrition_q010': {
        'id': 'sci_nutrition_q010',
        'subject': 'General Science',
        'subSubject': 'Biology',
        'chapter': 'Nutrition',
        'raw_chapter': 'NUTRITION',
        'q_num': 10,
        'question': '__________ is a parasitic plant.',
        'options': [
            'Orchid',
            'Cuscuta',
            'Leech',
            'Teak'
        ],
        'correctAnswer': 1,
        'ans_letter': 'B',
        'exam_tag': 'RRB Group-D 16-11-2018 (Shift-I)',
        'slidePage': 32,
        'explanation': 'Correct Answer: Option B | (Cuscuta) | Exam: RRB Group-D 16-11-2018 (Shift-I) | Slide: Page 32'
    },
    'sci_acids_bases_and_salt_q052': {
        'id': 'sci_acids_bases_and_salt_q052',
        'subject': 'General Science',
        'subSubject': 'Chemistry',
        'chapter': 'Acids, Bases and Salt',
        'raw_chapter': 'ACIDS, BASES AND SALT',
        'q_num': 52,
        'question': 'What is the colour of alkali?',
        'options': [
            'Blue with phenolphthalein and yellow with methyl orange',
            'Yellow with phenolphthalein and blue with methyl orange',
            'Pink with phenolphthalein and yellow with methyl orange',
            'Yellow with phenolphthalein and pink with methyl orange'
        ],
        'correctAnswer': 2,
        'ans_letter': 'C',
        'exam_tag': 'RRB JE 24.05.2019 (Shift-III)',
        'slidePage': 18,
        'explanation': 'Correct Answer: Option C | (Pink with phenolphthalein and yellow with methyl orange) | Exam: RRB JE 24.05.2019 (Shift-III) | Slide: Page 18'
    },
    'sci_acids_bases_and_salt_q053': {
        'id': 'sci_acids_bases_and_salt_q053',
        'subject': 'General Science',
        'subSubject': 'Chemistry',
        'chapter': 'Acids, Bases and Salt',
        'raw_chapter': 'ACIDS, BASES AND SALT',
        'q_num': 53,
        'question': 'A solution has a pH of 12. Which ion concentration is higher in this solution?',
        'options': [
            'Both H+ and OH- are equal',
            'More number S2- ions and more Cl-1',
            'Only OH-',
            'Only H+'
        ],
        'correctAnswer': 2,
        'ans_letter': 'C',
        'exam_tag': 'RRB JE 18/12/2024 1st shift',
        'slidePage': 80,
        'explanation': 'Correct Answer: Option C | (Only OH-) | Exam: RRB JE 18/12/2024 1st shift | Slide: Page 80'
    },
    'sci_acids_bases_and_salt_q054': {
        'id': 'sci_acids_bases_and_salt_q054',
        'subject': 'General Science',
        'subSubject': 'Chemistry',
        'chapter': 'Acids, Bases and Salt',
        'raw_chapter': 'ACIDS, BASES AND SALT',
        'q_num': 54,
        'question': 'What is the role of chlorine gas in the preparation of bleaching powder?',
        'options': [
            'It reacts with dry slaked lime to form bleaching powder.',
            'It is used as a catalyst for the reaction.',
            'It reacts with water to produce hydrogen peroxide.',
            'It is used to neutralise calcium hydroxide.'
        ],
        'correctAnswer': 0,
        'ans_letter': 'A',
        'exam_tag': 'RRB JE 17/12/2024 3rd shift',
        'slidePage': 101,
        'explanation': 'Correct Answer: Option A | (It reacts with dry slaked lime to form bleaching powder.) | Exam: RRB JE 17/12/2024 3rd shift | Slide: Page 101'
    },
    'sci_acids_bases_and_salt_q055': {
        'id': 'sci_acids_bases_and_salt_q055',
        'subject': 'General Science',
        'subSubject': 'Chemistry',
        'chapter': 'Acids, Bases and Salt',
        'raw_chapter': 'ACIDS, BASES AND SALT',
        'q_num': 55,
        'question': 'When Plaster of Paris is mixed with water, it undergoes which of the following changes?',
        'options': [
            'It loses all its water molecules.',
            'It dissolves completely.',
            'It produces a gas.',
            'It changes to gypsum.'
        ],
        'correctAnswer': 3,
        'ans_letter': 'D',
        'exam_tag': 'RRB JE 17/12/2024 3rd shift',
        'slidePage': 121,
        'explanation': 'Correct Answer: Option D | (It changes to gypsum.) | Exam: RRB JE 17/12/2024 3rd shift | Slide: Page 121'
    },
    'sci_carbon_and_its_compounds_q015': {
        'id': 'sci_carbon_and_its_compounds_q015',
        'subject': 'General Science',
        'subSubject': 'Chemistry',
        'chapter': 'Carbon and its Compounds',
        'raw_chapter': 'CARBON AND ITS COMPOUNDS',
        'q_num': 15,
        'question': 'Which of the following is not a homologous series?',
        'options': [
            'CH4, C2H6, C3H8, C4H10',
            'C3H7OH, C4H9OH, C5H11OH, C6H13OH',
            'C2H2, C3H4, C4H6, C5H8',
            'C2H4, C2H6, C3H6, C4H8'
        ],
        'correctAnswer': 3,
        'ans_letter': 'D',
        'exam_tag': 'RRB JE 17-12-2024 (Shift-2)',
        'slidePage': 114,
        'explanation': 'Correct Answer: Option D | (C2H4, C2H6, C3H6, C4H8) | Exam: RRB JE 17-12-2024 (Shift-2) | Slide: Page 114'
    },
    'sci_carbon_and_its_compounds_q016': {
        'id': 'sci_carbon_and_its_compounds_q016',
        'subject': 'General Science',
        'subSubject': 'Chemistry',
        'chapter': 'Carbon and its Compounds',
        'raw_chapter': 'CARBON AND ITS COMPOUNDS',
        'q_num': 16,
        'question': 'Which of the following statements are correct for benzene? a. It is a six-membered cyclic carbon compound. b. It has three single and three double bonds. c. The molecular formula is C6H14.',
        'options': [
            'Only a and c',
            'Only b and c',
            'a, b and c',
            'Only a and b'
        ],
        'correctAnswer': 3,
        'ans_letter': 'D',
        'exam_tag': 'RRB Group D 29/12/25 Shift-II',
        'slidePage': 72,
        'explanation': 'Correct Answer: Option D | (Only a and b) | Exam: RRB Group D 29/12/25 Shift-II | Slide: Page 72'
    },
    'sci_chemical_reactions_and_equations_q040': {
        'id': 'sci_chemical_reactions_and_equations_q040',
        'subject': 'General Science',
        'subSubject': 'Chemistry',
        'chapter': 'Chemical Reactions and Equations',
        'raw_chapter': 'CHEMICAL REACTIONS AND EQUATIONS',
        'q_num': 40,
        'question': 'Double displacement reactions usually occur in:',
        'options': [
            'Aqueous solution',
            'Gaseous state',
            'Solid state',
            'All three states'
        ],
        'correctAnswer': 0,
        'ans_letter': 'A',
        'exam_tag': 'RRB JE 16/12/2024 3rd shift',
        'slidePage': 55,
        'explanation': 'Correct Answer: Option A | (Aqueous solution) | Exam: RRB JE 16/12/2024 3rd shift | Slide: Page 55'
    },
    'sci_matter_q020': {
        'id': 'sci_matter_q020',
        'subject': 'General Science',
        'subSubject': 'Chemistry',
        'chapter': 'Matter',
        'raw_chapter': 'MATTER',
        'q_num': 20,
        'question': 'Which of the following statements about the effects of pressure changes on the states of matter is/are correct? Statement I: Applying pressure and reducing temperature can liquefy gases. Statement II: Solid carbon dioxide is stored under high pressure.',
        'options': [
            'Only statement I is correct.',
            'Both statements I and II are correct.',
            'Only statement II is correct.',
            'Neither statement I nor II is correct.'
        ],
        'correctAnswer': 1,
        'ans_letter': 'B',
        'exam_tag': 'RRB Technicians Grade III 24/12/2024 Shift 1',
        'slidePage': 105,
        'explanation': 'Correct Answer: Option B | (Both statements I and II are correct.) | Exam: RRB Technicians Grade III 24/12/2024 Shift 1 | Slide: Page 105'
    },
    'sci_matter_q021': {
        'id': 'sci_matter_q021',
        'subject': 'General Science',
        'subSubject': 'Chemistry',
        'chapter': 'Matter',
        'raw_chapter': 'MATTER',
        'q_num': 21,
        'question': 'Which of the following statements is/are correct regarding the liquid state of matter? Statement I: Liquids have a fixed volume but an indefinite shape. Statement II: The diffusion rate in liquids is higher than in solids.',
        'options': [
            'Neither (i) nor (ii) are correct.',
            'Both (i) and (ii) are correct.',
            'Only (ii) is correct.',
            'Only (i) is correct.'
        ],
        'correctAnswer': 1,
        'ans_letter': 'B',
        'exam_tag': 'RRB Technicians Grade III 30/12/2024 Shift 2',
        'slidePage': 107,
        'explanation': 'Correct Answer: Option B | (Both (i) and (ii) are correct.) | Exam: RRB Technicians Grade III 30/12/2024 Shift 2 | Slide: Page 107'
    },
    'sci_matter_q046': {
        'id': 'sci_matter_q046',
        'subject': 'General Science',
        'subSubject': 'Chemistry',
        'chapter': 'Matter',
        'raw_chapter': 'MATTER',
        'q_num': 46,
        'question': 'How many states of matter have been discovered by scientists so far?',
        'options': [
            '2',
            '5',
            '4',
            '3'
        ],
        'correctAnswer': 1,
        'ans_letter': 'B',
        'exam_tag': 'RRB Group-D 01-10-2018 (Shift-II)',
        'slidePage': 117,
        'explanation': 'Correct Answer: Option B | (5) | Exam: RRB Group-D 01-10-2018 (Shift-II) | Slide: Page 117'
    },
    'sci_metals_and_non_metals_q050': {
        'id': 'sci_metals_and_non_metals_q050',
        'subject': 'General Science',
        'subSubject': 'Chemistry',
        'chapter': 'Metals and Non-Metals',
        'raw_chapter': 'METALS AND NON-METALS',
        'q_num': 50,
        'question': 'Na2O is a __________ oxide.',
        'options': [
            'Alkaline',
            'Inactive',
            'Acidic',
            'Amphoteric'
        ],
        'correctAnswer': 0,
        'ans_letter': 'A',
        'exam_tag': 'RRB Group-D - 24/08/2022 (Shift-I)',
        'slidePage': 31,
        'explanation': 'Correct Answer: Option A | (Alkaline) | Exam: RRB Group-D - 24/08/2022 (Shift-I) | Slide: Page 31'
    },
    'sci_electricity_q028': {
        'id': 'sci_electricity_q028',
        'subject': 'General Science',
        'subSubject': 'Physics',
        'chapter': 'Electricity',
        'raw_chapter': 'ELECTRICITY',
        'q_num': 28,
        'question': 'Which of the following factors do NOT affect the resistance of a conductor (at constant temperature)? i) Area of cross-section of the conductor. ii) Current flowing through the conductor. iii) Length of the conductor.',
        'options': [
            'Both (i) and (iii)',
            'Both (i) and (ii)',
            'Only (iii)',
            'Only (ii)'
        ],
        'correctAnswer': 3,
        'ans_letter': 'D',
        'exam_tag': 'RRB Technicians Grade III 26/12/2024 Shift 3',
        'slidePage': 44,
        'explanation': 'Correct Answer: Option D | (Only (ii)) | Exam: RRB Technicians Grade III 26/12/2024 Shift 3 | Slide: Page 44'
    },
    'sci_human_eye_q021': {
        'id': 'sci_human_eye_q021',
        'subject': 'General Science',
        'subSubject': 'Physics',
        'chapter': 'Human Eye',
        'raw_chapter': 'HUMAN EYE',
        'q_num': 21,
        'question': 'A person suffering from myopia can clearly see objects up to 100 cm, but beyond that, everything appears blurred. What is the power of the corrective lens required to correct the vision?',
        'options': [
            '-1.0 D',
            '+1.0 D',
            '-2.0 D',
            '+2.0 D'
        ],
        'correctAnswer': 0,
        'ans_letter': 'A',
        'exam_tag': 'RRB Science Magnet Numerical',
        'slidePage': 28,
        'explanation': 'Correct Answer: Option A | (-1.0 D) | Far point v = -100 cm = -1 m, object u = infinity; 1/f = 1/v - 1/u = -1 D | Slide: Page 28'
    }
}

def update_public_questions():
    print(f"Loading {PUBLIC_QUESTIONS_PATH}...")
    with open(PUBLIC_QUESTIONS_PATH, 'r', encoding='utf-8') as f:
        questions = json.load(f)

    updated_count = 0
    new_questions = []
    for q in questions:
        qid = q.get('id')
        if qid in REPLACEMENTS:
            rep = REPLACEMENTS[qid]
            new_item = {
                'id': rep['id'],
                'subject': rep['subject'],
                'subSubject': rep['subSubject'],
                'chapter': rep['chapter'],
                'question': rep['question'],
                'options': rep['options'],
                'correctAnswer': rep['correctAnswer'],
                'explanation': rep['explanation'],
                'slidePage': rep['slidePage']
            }
            new_questions.append(new_item)
            updated_count += 1
        else:
            new_questions.append(q)

    print(f"Updated {updated_count} questions in questions.json.")
    assert updated_count == 17, f"Expected 17 replacements, got {updated_count}"
    assert len(new_questions) == 2992, f"Expected 2992 questions, got {len(new_questions)}"

    with open(PUBLIC_QUESTIONS_PATH, 'w', encoding='utf-8') as f:
        json.dump(new_questions, f, indent=2, ensure_ascii=False)
    print("Saved public/data/questions.json.")

def update_science_source():
    if not os.path.exists(SCIENCE_SOURCE_PATH):
        print(f"Warning: {SCIENCE_SOURCE_PATH} not found, skipping source update.")
        return

    print(f"Loading {SCIENCE_SOURCE_PATH}...")
    with open(SCIENCE_SOURCE_PATH, 'r', encoding='utf-8') as f:
        sci_source = json.load(f)

    updated_src = 0
    for qid, rep in REPLACEMENTS.items():
        raw_ch = rep['raw_chapter']
        qnum = rep['q_num']
        if raw_ch in sci_source:
            ch_data = sci_source[raw_ch]
            for sq in ch_data.get('questions', []):
                if sq.get('q_num') == qnum:
                    sq['question'] = rep['question']
                    sq['options'] = {
                        'A': rep['options'][0],
                        'B': rep['options'][1],
                        'C': rep['options'][2],
                        'D': rep['options'][3]
                    }
                    sq['answer'] = rep['ans_letter']
                    sq['exam_tag'] = rep['exam_tag']
                    sq['slidePage'] = rep['slidePage']
                    sq['explanation'] = rep['explanation']
                    updated_src += 1
                    break

    print(f"Updated {updated_src} questions in scripts/sources/science.json.")
    with open(SCIENCE_SOURCE_PATH, 'w', encoding='utf-8') as f:
        json.dump(sci_source, f, indent=2, ensure_ascii=False)
    print("Saved scripts/sources/science.json.")

if __name__ == '__main__':
    update_public_questions()
    update_science_source()
