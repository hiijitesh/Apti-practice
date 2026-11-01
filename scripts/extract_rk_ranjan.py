#!/usr/bin/env python3
"""
scripts/extract_rk_ranjan.py

Extracts English-only questions from all RK Ranjan Sheet PDFs
and saves them to public/data/rk_ranjan_questions.json
following the existing project JSON schema.

Usage:
    python3 scripts/extract_rk_ranjan.py

Schema output:
[
  {
    "id": "rkr_ages_cls_q001",
    "subject": "Quantitative Aptitude",
    "subSubject": "Quantitative Aptitude",
    "chapter": "Ages",
    "sheetType": "ClassRoom",        # ClassRoom | Pro Level
    "sheetFile": "Ages (ClassRoom Sheet).pdf",
    "question": "...",
    "options": ["...", "...", "...", "..."],
    "correctAnswer": 0,              # 0-indexed
    "explanation": "Correct Answer: Option B | (52) | Exam: SSC CGL ..."
  }
]
"""

import os
import re
import json
import glob
import sys

try:
    import pypdf
except ImportError:
    print("Error: pypdf not found. Install with: pip install pypdf")
    sys.exit(1)

# ─────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────

RK_RANJAN_DIR = os.path.expanduser(
    "~/Downloads/Govt Exams & RRB/A RRB NOTES/RK Ranjan Sheet"
)

OUTPUT_FILE = os.path.join(
    os.path.dirname(__file__), "..", "public", "data", "rk_ranjan_questions.json"
)

# Map folder name → canonical chapter name
FOLDER_CHAPTER_MAP = {
    "AP & GP":               "AP & GP",
    "Ages":                  "Ages",
    "Algebra":               "Algebra",
    "Average":               "Average",
    "Boat & Stream":         "Boat & Stream",
    "Co-ordinate Geometry":  "Co-ordinate Geometry",
    "Compound Interest":     "Compound Interest",
    "Discount":              "Discount",
    "Geometry":              "Geometry",
    "HCF & LCM":             "HCF & LCM",
    "Height & Distance":     "Height & Distance",
    "Maxima & Minima":       "Maxima & Minima",
    "Mensuration 2D":        "Mensuration 2D",
    "Mensuration 3D":        "Mensuration 3D",
    "Mixture & Alligation":  "Mixture & Alligation",
    "Number System":         "Number System",
    "Partnership":           "Partnership",
    "Percentage":            "Percentage",
    "Pipe & Cistern":        "Pipe & Cistern",
    "Probability":           "Probability",
    "Profit & Loss":         "Profit & Loss",
    "Quadratic Equation":    "Quadratic Equation",
    "Race & Circular Motion":"Race & Circular Motion",
    "Ratio & Proportion":    "Ratio & Proportion",
    "Simple Interest":       "Simple Interest",
    "Simplification":        "Simplification",
    "Statistics":            "Statistics",
    "Surds & Indices":       "Surds & Indices",
    "Time & Work":           "Time & Work",
    "Time, Speed & Distance":"Time, Speed & Distance",
    "Train":                 "Train",
    "Trigonometry":          "Trigonometry",
    "Work & Wages":          "Work & Wages",
}

# Slug map (used for id prefix)
def folder_to_slug(folder_name):
    slug_map = {
        "AP & GP":               "apgp",
        "Ages":                  "ages",
        "Algebra":               "alg",
        "Average":               "avg",
        "Boat & Stream":         "boat",
        "Co-ordinate Geometry":  "coord",
        "Compound Interest":     "ci",
        "Discount":              "disc",
        "Geometry":              "geo",
        "HCF & LCM":             "hcflcm",
        "Height & Distance":     "hnd",
        "Maxima & Minima":       "maxmin",
        "Mensuration 2D":        "men2d",
        "Mensuration 3D":        "men3d",
        "Mixture & Alligation":  "mix",
        "Number System":         "ns",
        "Partnership":           "part",
        "Percentage":            "pct",
        "Pipe & Cistern":        "pipe",
        "Probability":           "prob",
        "Profit & Loss":         "pnl",
        "Quadratic Equation":    "quad",
        "Race & Circular Motion":"race",
        "Ratio & Proportion":    "ratio",
        "Simple Interest":       "si",
        "Simplification":        "simp",
        "Statistics":            "stat",
        "Surds & Indices":       "surds",
        "Time & Work":           "tnw",
        "Time, Speed & Distance":"tsd",
        "Train":                 "train",
        "Trigonometry":          "trig",
        "Work & Wages":          "wnw",
    }
    return slug_map.get(folder_name, re.sub(r"[^a-z0-9]", "", folder_name.lower()))


# ─────────────────────────────────────────
# Text cleaning helpers
# ─────────────────────────────────────────

DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")

def strip_hindi_lines(text: str) -> str:
    """Remove all lines that contain Hindi/Devanagari characters."""
    if not text:
        return ""
    lines = text.split("\n")
    clean = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if DEVANAGARI_RE.search(line):
            continue
        # Drop obvious header/footer noise
        if re.search(
            r"Aditya Ranjan|Maths by|Join Telegram|Selected\s+g|Selection\s+f|"
            r"ClassRoom Sheet|Classroom Sheet|Pro Level Sheet|gS Sele|fnyk,|"
            r"https?://|Page\s*\d+",
            line, re.I
        ):
            continue
        clean.append(line)
    joined = " ".join(clean)
    joined = DEVANAGARI_RE.sub("", joined)
    joined = re.sub(r"[ \t]+", " ", joined).strip()
    return joined


def clean_option_text(text: str) -> str:
    """Clean a single option string."""
    text = strip_hindi_lines(text)
    # Remove leading option label remnants
    text = re.sub(r"^\(?[a-dA-D]\)?\s*\.?\s*", "", text).strip()
    return text


def clean_stem(text: str, q_num: int) -> str:
    """Clean question stem."""
    text = strip_hindi_lines(text)
    # Remove leading question number
    text = re.sub(rf"^{q_num}[\.\)]\s*", "", text).strip()
    # Remove trailing exam tag – we capture it separately
    return text.strip()


# ─────────────────────────────────────────
# Answer key parser
# ─────────────────────────────────────────

def parse_answer_key(full_text: str) -> dict:
    """
    Returns {q_num(int): letter(str)} from text like:
      1.(b) 2.(c) 3.(b) ...  or  1. B  2. C ...
    """
    answers = {}
    # Try to find the ANSWER KEY section
    ak_match = re.search(
        r"ANSWER\s+KEY(.*?)$", full_text, re.IGNORECASE | re.DOTALL
    )
    search_text = ak_match.group(1) if ak_match else full_text

    # Pattern: 1.(b) or 1. (b) or 1.b
    for m in re.finditer(
        r"\b(\d+)\s*[\.\)]\s*\(?([A-Da-d])\)?", search_text
    ):
        q_num = int(m.group(1))
        letter = m.group(2).upper()
        if q_num not in answers:
            answers[q_num] = letter

    return answers


# ─────────────────────────────────────────
# Option extractor
# ─────────────────────────────────────────

# Patterns that mark the start of option (a)/(b)/(c)/(d) or a. b. c. d.
OPT_PAT = re.compile(
    r"(?<!\w)\(([a-dA-D])\)\s*|(?<!\w)([a-dA-D])\.\s+(?=[A-Z0-9₹\-\(\[])",
)


def extract_question_parts(block: str):
    """
    Given a raw text block for one question, return:
       (stem_text, [opt_a, opt_b, opt_c, opt_d], exam_tag)
    """
    # Find all option markers
    matches = list(OPT_PAT.finditer(block))

    # Find the first A/a marker and try to get A,B,C,D in sequence
    best_start = None
    for i, m in enumerate(matches):
        lbl = (m.group(1) or m.group(2)).upper()
        if lbl != "A":
            continue
        # Verify B, C, D follow
        lbls = ["A"]
        sel = [m]
        for j in range(i + 1, len(matches)):
            next_lbl = (matches[j].group(1) or matches[j].group(2)).upper()
            expected = chr(ord(lbls[-1]) + 1)
            if next_lbl == expected:
                lbls.append(next_lbl)
                sel.append(matches[j])
                if len(lbls) == 4:
                    break
        if len(lbls) >= 2:
            best_start = sel
            break

    if not best_start or len(best_start) < 2:
        stem = strip_hindi_lines(block)
        return stem, ["Option A", "Option B", "Option C", "Option D"], ""

    # Stem is everything before first option
    raw_stem = block[: best_start[0].start()]
    stem = strip_hindi_lines(raw_stem)

    # Extract options
    options = []
    for k in range(len(best_start) - 1):
        raw_opt = block[best_start[k].end() : best_start[k + 1].start()]
        options.append(clean_option_text(raw_opt))

    # Last option + possible exam tag
    last_raw = block[best_start[-1].end() :]
    exam_tag = ""
    # Exam tag pattern at end of last option
    exam_m = re.search(
        r"((?:SSC|RRB|ICAR|Higher Secondary|Selection Post|Bank|CHSL|CGL|MTS|CPO"
        r"|IBPS|NDA|CAT|DSSSB|UP Police|Phase|MOCK)[^\n\r]{5,60}?)$",
        last_raw.strip(), re.I
    )
    if exam_m:
        exam_tag = exam_m.group(1).strip()
        last_raw = last_raw[: exam_m.start()]

    options.append(clean_option_text(last_raw))

    # Pad to 4 if needed
    while len(options) < 4:
        options.append(f"Option {chr(65 + len(options))}")

    return stem, options[:4], exam_tag


# ─────────────────────────────────────────
# Single PDF parser
# ─────────────────────────────────────────

def detect_sheet_type(filename: str) -> str:
    name = filename.lower()
    if "pro level" in name or "pro-level" in name:
        return "Pro Level"
    elif "classroom" in name or "class room" in name:
        return "ClassRoom"
    return "ClassRoom"


def detect_sheet_num(filename: str) -> str:
    """For sheets with multiple parts like Sheet-01, Sheet-02."""
    m = re.search(r"(?:sheet|part)[- _]*(\d+)", filename, re.I)
    return m.group(1) if m else ""


def parse_pdf(pdf_path: str, chapter_name: str, chapter_slug: str) -> list:
    filename = os.path.basename(pdf_path)
    sheet_type = detect_sheet_type(filename)
    sheet_num = detect_sheet_num(filename)

    # Build id prefix: rkr_{slug}_{cls|pro}{num}
    type_tag = "pro" if sheet_type == "Pro Level" else "cls"
    id_prefix = f"rkr_{chapter_slug}_{type_tag}"
    if sheet_num:
        id_prefix += sheet_num

    reader = pypdf.PdfReader(pdf_path)
    full_text = ""
    for page in reader.pages:
        t = page.extract_text() or ""
        full_text += t + "\n"

    # Split off answer key section
    ak_pos = re.search(r"ANSWER\s+KEY", full_text, re.IGNORECASE)
    q_text = full_text[: ak_pos.start()] if ak_pos else full_text
    answer_key = parse_answer_key(full_text)

    # Locate question boundaries by number
    q_locs = []
    pos = 0
    curr_q = 1
    while True:
        # Match "1." or "1)" at start of a logical line (after whitespace/newline)
        pat = re.compile(
            rf"(?:^|\n)\s*{curr_q}[\.\)]\s+", re.MULTILINE
        )
        m = pat.search(q_text, pos)
        if not m:
            # Fallback: anywhere in text
            pat2 = re.compile(rf"\b{curr_q}[\.\)]\s+")
            m = pat2.search(q_text, pos)
            if not m:
                break
        q_locs.append((curr_q, m.start(), m.end()))
        pos = m.end()
        curr_q += 1

    if not q_locs:
        print(f"   [!] No questions found in {filename}")
        return []

    questions = []
    for idx, (qnum, _, q_end) in enumerate(q_locs):
        next_start = q_locs[idx + 1][1] if idx + 1 < len(q_locs) else len(q_text)
        block = q_text[q_end:next_start]

        stem, options, exam_tag = extract_question_parts(block)
        stem = clean_stem(stem, qnum)

        if not stem or len(stem) < 10:
            continue  # Skip empty/corrupt extractions

        # Skip if stem is all non-English
        english_words = re.findall(r"[a-zA-Z]{2,}", stem)
        if len(english_words) < 3:
            continue

        ans_letter = answer_key.get(qnum, "")
        letter_map = {"A": 0, "B": 1, "C": 2, "D": 3}
        correct_idx = letter_map.get(ans_letter, 0)

        exp_parts = []
        if ans_letter:
            exp_parts.append(f"Correct Answer: Option {ans_letter}")
            if correct_idx < len(options) and not options[correct_idx].startswith("Option "):
                exp_parts.append(f"({options[correct_idx]})")
        if exam_tag:
            exp_parts.append(f"Exam: {exam_tag}")

        questions.append({
            "id": f"{id_prefix}_q{qnum:03d}",
            "subject": "Quantitative Aptitude",
            "subSubject": "Quantitative Aptitude",
            "chapter": chapter_name,
            "sheetType": sheet_type,
            "sheetFile": filename,
            "question": stem,
            "options": options,
            "correctAnswer": correct_idx,
            "explanation": " | ".join(exp_parts) if exp_parts else ""
        })

    return questions


# ─────────────────────────────────────────
# Main
# ─────────────────────────────────────────

def main():
    rk_dir = os.path.expanduser(RK_RANJAN_DIR)
    if not os.path.isdir(rk_dir):
        print(f"ERROR: RK Ranjan Sheet directory not found:\n  {rk_dir}")
        sys.exit(1)

    print(f"Scanning: {rk_dir}\n")

    all_questions = []
    stats = {}

    # Walk each chapter folder
    for folder_name in sorted(os.listdir(rk_dir)):
        folder_path = os.path.join(rk_dir, folder_name)
        if not os.path.isdir(folder_path):
            continue

        chapter_name = FOLDER_CHAPTER_MAP.get(folder_name, folder_name)
        chapter_slug = folder_to_slug(folder_name)

        pdfs = sorted(
            f for f in glob.glob(os.path.join(folder_path, "*.pdf"))
        )
        if not pdfs:
            continue

        folder_count = 0
        for pdf_path in pdfs:
            print(f"  → {folder_name} / {os.path.basename(pdf_path)}")
            try:
                qs = parse_pdf(pdf_path, chapter_name, chapter_slug)
                all_questions.extend(qs)
                folder_count += len(qs)
                print(f"       extracted {len(qs)} questions")
            except Exception as e:
                print(f"     [!] Error: {e}")
                import traceback; traceback.print_exc()

        if folder_count:
            stats[chapter_name] = folder_count

    # Save
    out_path = os.path.normpath(
        os.path.join(os.path.dirname(__file__), OUTPUT_FILE)
    ) if not os.path.isabs(OUTPUT_FILE) else OUTPUT_FILE
    out_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "public", "data", "rk_ranjan_questions.json")
    )
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(all_questions, f, ensure_ascii=False, indent=2)

    # QA: check for residual Hindi
    hindi_in_q = sum(
        1 for q in all_questions if DEVANAGARI_RE.search(q["question"])
    )

    print(f"\n{'='*60}")
    print(f"  Total questions extracted : {len(all_questions)}")
    print(f"  Chapters processed        : {len(stats)}")
    print(f"  Residual Hindi in stems   : {hindi_in_q}")
    print(f"  Output                    : {out_path}")
    print(f"{'='*60}")
    print("\nChapter Breakdown:")
    for ch, cnt in sorted(stats.items()):
        print(f"  {ch:<30s} {cnt:4d} questions")


if __name__ == "__main__":
    main()
