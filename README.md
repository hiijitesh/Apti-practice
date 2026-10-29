# AptiPrep CBT - Local Aptitude Test Web Application

A lightweight, local test-taking web application that runs entirely on localhost without any external database or cloud deployment. Designed for RRB, SSC, and Government Exam aptitude preparation.

---

## 🏗 Architecture & Tech Stack

- **Backend:** Node.js with Express.js (`server.js`)
  - Direct read/write to local JSON files on disk.
  - RESTful APIs for chapters, practice questions, secure mock tests, submission scoring, and past attempt history.
- **Frontend:** Vanilla HTML5, Tailwind CSS (via CDN), and Vanilla JavaScript (`public/`)
  - Fast, responsive Computer-Based Test (CBT) portal UI modeled after real exam interfaces.
  - Zero heavy build tools or bundlers required—runs directly in any modern browser.
- **Data Persistence:** Local JSON files (`data/`)
  - `data/questions.json`: 1,344 structured aptitude questions across 17 chapters.
  - `data/attempts.json`: Stores all past test attempts with accuracy, timestamps, and answer histories.
- **Extraction Script:** Python 3 (`scripts/extract_questions.py`)
  - Robust parser using `pypdf` that extracts questions, options, and answer keys from PDFs in `./source_pdfs/` (or current directory) into structured JSON.

---

## 🚀 Quick Start Guide

### 1. Install Node.js Dependencies
```bash
npm install
```

### 2. Extract Questions from PDFs (Pre-extracted, but runnable at any time)
```bash
npm run extract
# or directly:
python3 scripts/extract_questions.py
```
This scans all question PDFs, extracts questions, formats options (A, B, C, D), maps correct answers from the answer keys, and writes them to `./data/questions.json`.

### 3. Start the Local Server
```bash
npm start
```

Open your browser and navigate to:
```
http://localhost:3001
```
*(If port 3001 is in use, it will automatically fallback to the next available port, or you can specify `PORT=8080 npm start`)*

---

## 📋 Features & User Flows

### 1. Dashboard & Analytics
- Overview of all 17 available aptitude chapters with question counts.
- Past test attempt summary (total tests taken, average score percentage, highest score, total time spent).
- Interactive attempts history table with accuracy badges and one-click **"Review"** button to reopen full detailed analysis for any past test.

### 2. Mode 1: Chapter-Wise Practice
- **Untimed, self-paced learning** for any chosen chapter (e.g., *Percentage, Time & Work, Profit & Loss, Average, etc.*).
- **Instant feedback:** Selecting an option immediately shows whether you got it right (Green) or wrong (Red, with the correct option highlighted in green).
- **Instant Explanation:** Detailed step-by-step solution and official exam metadata (SSC CGL, MTS, CHSL, CPO, Selection Post).
- **Question Palette Drawer:** Jump quickly to any question in the chapter or track your answered count.
- Option to save your practice session to your local performance history.

### 3. Mode 2: Full Mock Test (CBT Exam Portal)
- **Balanced question selection:** Generates 30 random questions uniformly distributed across all 17 chapters.
- **Anti-cheat protection:** The `/api/mock` endpoint securely strips `correctAnswer` and `explanation` from the payload so answers cannot be inspected in DevTools.
- **30-Minute Global Timer:** Sticky countdown timer at the top with color warnings (amber under 5 min, red pulse under 1 min).
- **Auto-Submit:** If time runs out (00:00), the exam auto-submits immediately.
- **CBT Question Palette:**
  - 🟢 **Green:** Answered
  - ⚪ **Gray:** Unanswered
  - 🟣 **Purple:** Marked for Review
  - 🔵 **Blue ring:** Current active question
- **Controls:** *Save & Next*, *Previous*, *Mark for Review*, *Clear Response*.
- **Confirmation Modal:** Displays answered, unanswered, marked for review counts, and time remaining before submitting.

### 4. Results & Detailed Review Screen
- **Overall Score Summary:** Score (e.g., `24 / 30`), Percentage (`80.0%`), Correct, Incorrect, Unattempted counts, and Time Taken.
- **Chapter-Wise Breakdown:** Accuracy progress bars and counts per chapter.
- **Question-by-Question Detailed Review:**
  - Filter by: `All`, `Correct`, `Incorrect`, or `Unattempted`.
  - Shows question text, your chosen answer, correct answer, and explanation.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/chapters` | Returns array of all chapters and question counts |
| `GET` | `/api/questions?chapter=:name` | Returns all questions for a chapter with explanations |
| `GET` | `/api/mock` | Returns 30 balanced randomized questions (answers omitted) |
| `POST` | `/api/submit-attempt` | Scores test against disk data, saves to `attempts.json`, returns review |
| `GET` | `/api/attempts` | Returns list of all past attempts from disk |
| `GET` | `/api/attempts/:id` | Returns specific past attempt enriched with question review data |

---

## 📂 Project Directory Structure

```
Apti Practice/
├── data/
│   ├── questions.json      # 1,344 parsed aptitude questions
│   └── attempts.json       # Persisted user test attempt records
├── public/
│   ├── index.html          # Clean Single-Page CBT Interface
│   ├── app.js              # State management & client interactions
│   └── style.css           # Styling and animations
├── scripts/
│   └── extract_questions.py # Standalone PDF extraction script
├── source_pdfs/            # Source question PDF files
├── server.js               # Node.js + Express backend
└── package.json            # Scripts & dependencies
```

