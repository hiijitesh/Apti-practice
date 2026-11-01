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

---

## 5. Project Architecture & Directory Layout

### 5.1 Project Tree
```
Apti Practice/
├── server.js                      # Express HTTP server entrypoint
├── start.js                       # Server launcher script
├── package.json                   # Dependencies & npm scripts ('npm test', 'npm start')
├── nodemon.json                   # Nodemon configuration for hot-reload dev
├── GEMINI.md                      # Persistent operational memory & safety guidelines
├── README.md                      # User guide & project overview
├── src/                           # Backend Application Source (Modular Architecture)
│   ├── app.js                     # Express app instance, security headers, middleware wiring
│   ├── config/
│   │   └── index.js               # Application configuration constants & paths
│   ├── middleware/
│   │   └── error.middleware.js    # Global error handling and HTTP status normalizer
│   ├── routes/
│   │   └── api.routes.js          # REST API route definitions (/api/*)
│   ├── controllers/
│   │   ├── question.controller.js # GET /api/chapters, GET /api/questions
│   │   ├── mock.controller.js     # GET /api/mock
│   │   ├── attempt.controller.js  # POST /api/submit-attempt, GET /api/attempts
│   │   └── revision.controller.js # GET /api/revision-materials
│   ├── services/
│   │   ├── mock-generator.service.js # Pure question sampling & option sanitization
│   │   └── scoring.service.js     # Pure score, accuracy, and chapter aggregation logic
│   └── repositories/
│       ├── question.repository.js # In-memory caching & indexing for public/data/questions.json
│       ├── attempt.repository.js  # Persistence for user & guest attempts (public/data/attempts.json)
│       └── revision.repository.js # Loads Google Drive revision links (public/data/revision_materials.json)
├── public/                        # Frontend Single-Page Application (SPA)
│   ├── index.html                 # CBT interface (Practice, Mock Test, Revision Studio, Analytics)
│   ├── style.css                  # UI theme, layout, responsive typography, and dark mode
│   ├── app.js                     # Client state controller, question renderer, timer, navigation
│   ├── config.js                  # Frontend configuration settings
│   ├── js/                        # Modular frontend services & utility helpers
│   │   ├── services/
│   │   └── utils/
│   └── data/                      # Single Source of Truth Datasets
│       ├── questions.json         # Master dataset: 2,992 questions across 52 chapters
│       ├── attempts.json          # Persistent user attempt history & performance records
│       ├── revision_materials.json# Google Drive PDF URLs for chapter revision
│       └── diagrams/              # Embedded visual assets for diagram questions
├── scripts/                       # Extraction, Merging, and Audit Tooling
│   ├── universal_pdf_question_extractor.py # Spatial-aware 2D bounding box PDF extractor
│   ├── merge_questions.py         # Merges sources into public/data/questions.json
│   ├── apply_biology_reverification.py # Biology verification & slide mapping pipeline
│   └── sources/                   # Raw chapterwise question sources
│       ├── science.json           # Raw Science questions with slidePage & explanations
│       └── top_300_questions_science.json # Curated Top 300 Science questions
└── tests/                         # Comprehensive Node.js Native Test Suites ('npm test')
    ├── api.test.js                # API integration tests (52 chapters, 2,992 questions)
    ├── data_integrity.test.js     # CBT schema, subject distributions, unique IDs, diagrams
    ├── physics_reverification.test.js   # Validates all 399 Physics questions & slide numbers
    ├── chemistry_reverification.test.js # Validates all 465 Chemistry questions & slide numbers
    ├── biology_reverification.test.js   # Validates all 616 Biology questions & slide numbers
    ├── mock_generation.test.js    # Mock test 30-question sampling & sanitization tests
    ├── scoring.test.js            # Pure scoring, accuracy, and aggregation unit tests
    ├── architecture.test.js       # Repository caching, controller contracts, service purity
    └── app_logic.test.js          # Authentication, email trimming, and guest session tests
```

### 5.2 Key Data Flows
1. **Source Data to Master Database**:
   - `scripts/sources/science.json` + `public/data/questions.json` (Aptitude) + `scripts/sources/top_300_questions_science.json` $\rightarrow$ `scripts/merge_questions.py` $\rightarrow$ `public/data/questions.json`.
2. **Server Startup**:
   - `server.js` starts `src/app.js`.
   - `QuestionRepository.init()` reads and caches `public/data/questions.json` in memory.
   - Precomputes chapter counts and subject indexes for sub-millisecond retrieval.
3. **Mock Test Generation**:
   - `GET /api/mock` $\rightarrow$ `mock.controller.js` $\rightarrow$ `MockGeneratorService.generateMockQuestions()`.
   - Strips `correctAnswer` and `explanation` so answer keys never leak to the client before submission.
4. **Attempt Scoring & Persistence**:
   - `POST /api/submit-attempt` $\rightarrow$ `attempt.controller.js` $\rightarrow$ `ScoringService.calculate()`.
   - Evaluates answers against stored master questions.
   - Saves record to `public/data/attempts.json` via `AttemptRepository`.
   - Returns full attempt review with correct answers, explanations, and slide references.

