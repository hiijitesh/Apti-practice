# Project Memory & Knowledge Base: Apti Practice

This document serves as persistent operational memory and safety guidelines for the Apti Practice platform, question datasets, and future PDF extraction workflows.

---

## 1. Core Platform Invariants & Rules

### 1.1 Zero Hindi / Devanagari Constraint
* **Strict Rule**: No Devanagari/Hindi characters (`[\u0900-\u097F]`) are permitted in question stems, options, or explanations in `public/data/questions.json` or `scripts/sources/*.json`.
* **Verification Command**:
  ```bash
  python3 -c "
  import json, re
  with open('public/data/questions.json') as f: qs = json.load(f)
  hindi = [q['id'] for q in qs if re.search(r'[\u0900-\u097F]', q['question'] + ' '.join(q['options']) + q.get('explanation', ''))]
  assert len(hindi) == 0, f'Found Hindi in {len(hindi)} questions: {hindi[:5]}'
  print('Zero Hindi verified successfully.')
  "
  ```

### 1.2 Slide Page Attribution Rule
* Every question extracted from Science Magnet slides must contain:
  1. `"slidePage": <integer>` on the question object.
  2. `| Slide: Page <N>` at the end of the `explanation` string.
* `scripts/merge_questions.py` is configured to preserve `slidePage` and append the slide reference to `explanation`.

### 1.3 CBT Schema & Option Standards
* Every question must strictly adhere to:
  - `id`: Unique string (`sci_<chapter>_q<num>` or `apti_<chapter>_q<num>`).
  - `subject`: `"General Science"` or `"Quantitative Aptitude"`.
  - `subSubject`: `"Physics"`, `"Chemistry"`, `"Biology"`, or `"Quantitative Aptitude"`.
  - `chapter`: Standardized Title Case chapter name.
  - `question`: Clean English string.
  - `options`: Exactly 4 non-empty English strings.
  - `correctAnswer`: Integer index between `0` and `3`.
  - `explanation`: Educational English explanation containing exam tag and slide number.

---

## 2. Root Causes of Missing Questions (Safety & Lessons Learned)

When extracting questions from PDF slide presentations (such as Neeraj Sir / Science Magnet slides), naive regex parsers fail for four recurring reasons:

### Reason 1: Rigid Option Delimiters
* **Pattern**: Extractors expecting `A.`, `B.`, `C.`, `D.` fail when slides use:
  - Standalone letters (`A`, `B`, `C`, `D` without periods on separate lines).
  - Parentheses `(A)`, `(B)` or square brackets.
  - Letters merged into text (e.g. `A Glucose`).
* **Fix**: Use multi-pattern matching supporting `A.`, `A)`, `(A)`, standalone `A\n`, and letter-prefixed tokens.

### Reason 2: Multi-Column Spatial Layouts
* **Pattern**: Two-column slides place `A.` and `C.` in column 1, and `B.` and `D.` in column 2.
* **Failure**: Reading raw text streams linearly yields `A. -> C. -> D. -> B. -> Option 1 -> Option 3...`, causing Option D to be dropped and questions omitted.
* **Fix**: Extract text blocks with 2D spatial coordinates `(x0, y0, x1, y1)` using PyMuPDF (`page.get_text('blocks')`) and sort blocks by physical reading flow.

### Reason 3: Non-Standard Headers & Exam Tag Locations
* **Pattern**: Looking only for `"Previous Year Questions"` misses slides titled:
  - `"SCIENCE EXAM REVIEW"`
  - `"PRACTICE QUESTIONS"`
  - Plain slides where the exam tag (e.g., `RRB Technicians Grade III ...`) is placed at the bottom without any header banner.
* **Fix**: Detect questions based on multiple signals: exam tags (`RRB`, `Shift`, `Technician`, `Group-D`, `NTPC`, `ALP`), presence of 4 distinct choices, and question punctuation (`?`, `______`).

### Reason 4: Slide Duplication & Incomplete Drafts
* **Pattern**: PDFs often repeat slides at the end of chapters or across modules (e.g. `Blood.pdf` slides 6 & 8, `Acids, Bases & Salt.pdf` slides 111–121 & 124–134).
* **Fix**: Always normalize and fingerprint question stems (`clean_stem[:40]`) to detect duplicates and keep the complete version.

---

## 3. Database State as of November 2026

* **Total Combined Questions**: `2,992`
* **Quantitative Aptitude**: `1,342` across 17 chapters
* **General Science**: `1,650` across 35 chapters
  - **Physics**: `399` across 10 chapters (100% mapped to slide pages)
  - **Chemistry**: `465` across 8 chapters (100% mapped to slide pages)
  - **Biology**: `616` across 16 chapters (100% mapped to slide pages)
  - **Top 300 Science**: `170` questions

### Dedicated Test Suites
- `tests/physics_reverification.test.js`: Validates 399 questions, slide numbers, zero Hindi.
- `tests/chemistry_reverification.test.js`: Validates 465 questions, slide numbers, zero Hindi.
- `tests/biology_reverification.test.js`: Validates 616 questions, slide numbers, zero Hindi.
- `tests/data_integrity.test.js`: Validates CBT schema, 2,992 total count, 1,650 science count.
- `tests/api.test.js`: Validates 52 chapters and 2,992 API response count.

---

## 4. Universal Extraction Tooling

Use `scripts/universal_pdf_question_extractor.py` for any future slide audits or batch extractions:
```bash
# Scan and audit a PDF or directory:
python3 scripts/universal_pdf_question_extractor.py --input "/path/to/folder_or_pdf" --audit

# Extract clean JSON with slide numbers:
python3 scripts/universal_pdf_question_extractor.py --input "/path/to/notes.pdf" --subject "General Science" --subsubject "Physics" --output output.json
```

