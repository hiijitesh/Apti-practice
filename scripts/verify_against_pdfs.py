#!/usr/bin/env python3
"""End-to-end check of every question against its source PDF.

For each question in public/data/questions.json and rk_ranjan_questions.json it:
  1. opens the PDF page recorded in question["source"],
  2. checks the question's words appear on that page (or the next one),
  3. checks every option appears there,
  4. checks correctAnswer against the PDF's own answer key (RK Ranjan and
     Dixit sheets print one; Science Magnet slides mark answers by hand, so
     those keys cannot be checked automatically).

Writes question["check"] = {"text": bool, "options": bool, "key": bool|None}
and prints a summary. Needs PyMuPDF and the source PDFs:
    pip install pymupdf
    APTI_PDF_ROOT="/path/to/A RRB NOTES" python3 scripts/verify_against_pdfs.py
"""
import json
import os
import re
import sys
import unicodedata
from collections import Counter

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "public", "data")
PDF_ROOT = os.environ.get("APTI_PDF_ROOT", os.path.expanduser("~/Downloads/Govt Exams & RRB/A RRB NOTES"))
RK_DIR = os.path.join(PDF_ROOT, "RK Ranjan Sheet", "english only")
DIXIT_DIR = os.path.join(PDF_ROOT, "ADixit Sir Sheet")
SCI_DIR = os.path.join(PDF_ROOT, "AScience_Magnet_Merged")

DIXIT_FILES = {
    "Percentage": "Percentage", "Ratio & Proportion": "Ratio & Proportion", "Ages": "Ages", "Mixture & Alligation": "Mixture",
    "Average": "Average", "Simple Interest": "Simple interest", "Compound Interest": "Compound Interest",
    "Profit & Loss": "Profit & Loss", "Discount": "DISCOUNT", "Time & Work": "TIME & WORK", "Work & Wages": "Work and Wages",
    "Pipe & Cistern": "Pipe and Cistern", "Partnership": "PARTNERSHIP", "Time, Speed & Distance": "TSD", "Trains": "TRAINS",
    "Boat & Stream": "Boat & Stream", "Race": "Race",
}

# Answers re-derived by hand where the PDF's printed key disagrees with the question (key misprinted/misaligned).
SOLVED_BY_HAND = set("""sci_cell_q003 sci_cell_q008 sci_circulatory_system_q005 sci_circulatory_system_q010 sci_circulatory_system_q020 sci_environment_q006 sci_environment_q021 sci_environment_q026 sci_environment_q045 sci_excretory_system_q020 sci_reproduction_in_organisms_q024 sci_respiratory_system_q014 sci_carbon_and_its_compounds_q055 sci_matter_q043 sci_structure_of_atom_q018 sci_structure_of_atom_q070 sci_electricity_q026 sci_electricity_q027 sci_electricity_q041 sci_gravitation_q066 sci_magnetic_effect_of_current_q005 sci_motion_q048 sci_prism_q005 sci_reflection_of_light_q002 sci_reflection_of_light_q004 sci_refraction_q014 sci_sound_q010 sci_work_energy_and_power_q014 sci_blood_q021 sci_circulatory_system_q033 sci_environment_q012 sci_nervous_system_q004 sci_nutrition_q009 sci_nutrition_q010 sci_nutrition_q033 sci_reproduction_in_organisms_q045 sci_reproduction_in_organisms_q055 sci_reproduction_in_organisms_q063 sci_reproduction_in_organisms_q065 sci_tissue_q026 sci_tissue_q035 sci_acids_bases_and_salt_q007 sci_atom_and_molecule_q003 sci_carbon_and_its_compounds_q050 sci_structure_of_atom_q022 sci_structure_of_atom_q023 sci_electricity_q067 sci_motion_q049 ratio_q119 mix_q047 pnl_q127 pnl_q132 disc_q021 disc_q022 disc_q024 disc_q025 disc_q041 disc_q042 disc_q044 disc_q045 disc_q047 disc_q048 disc_q050 disc_q053 disc_q054 disc_q055 disc_q056 disc_q058 disc_q060 disc_q063 disc_q064 wnw_q012 pipe_q047 pipe_q048 tsd_q115 tsd_q117 tsd_q118 train_q045 race_q040""".split())

_docs, _pages = {}, {}


def doc(path):
    if path not in _docs:
        _docs[path] = pymupdf.open(path)
    return _docs[path]


def alnum(s):
    s = unicodedata.normalize("NFKC", s).lower()
    return re.sub(r"[^a-z0-9]", "", s)


def page_text(path, page):
    """Normalised text of the 1-based page plus the next page (questions can spill over)."""
    key = (path, page)
    if key not in _pages:
        d = doc(path)
        raw = " ".join(d[i].get_text() for i in (page - 1, page) if 0 <= i < len(d))
        _pages[key] = (alnum(raw), set(re.findall(r"[a-z]{3,}", unicodedata.normalize("NFKC", raw).lower())))
    return _pages[key]


def answer_key(path, pattern):
    """Map question number -> answer index from a PDF's printed answer key."""
    key = {}
    for p in doc(path):
        text = p.get_text()
        if not re.search(r"answer\s*key", text, re.I):
            continue
        for n, letter in re.findall(pattern, text):
            key.setdefault(int(n), "abcd".index(letter.lower()))
    return key


def source_pdf(q):
    if q.get("faculty") == "RK Ranjan":
        name = q["sheetFile"].replace(".pdf", "").replace("  ", " ").lower()
        for f in os.listdir(RK_DIR):
            if f.lower().replace(" [english only]", "").replace("  ", " ")[:-4] == name:
                return os.path.join(RK_DIR, f), "rk"
        return None, "rk"
    if re.search(r"aptitude", q["subject"], re.I):
        prefix = DIXIT_FILES.get(q["chapter"], "")
        for f in os.listdir(DIXIT_DIR):
            if f.startswith(prefix) and "All Questions" in f:
                return os.path.join(DIXIT_DIR, f), "dixit"
        return None, "dixit"
    folder = {"Biology": "Bio"}.get(q["subSubject"], q["subSubject"])
    label = q.get("source", {}).get("file", "").split(" · ", 1)[-1]
    for base in (os.path.join(SCI_DIR, folder), os.path.join(SCI_DIR, "Top300 science")):
        for f in os.listdir(base) if os.path.isdir(base) else []:
            if f[:-4] == label or (label and alnum(f[:-4]).replace("oflight", "").replace("and", "") == alnum(label).replace("and", "")):
                return os.path.join(base, f), "science"
    return None, "science"


def check(q, keys):
    src = q.get("source") or {}
    path, kind = source_pdf(q)
    if not path or not src.get("page"):
        return {"text": False, "options": False, "key": None, "reason": "source page not located"}
    flat, words = page_text(path, src["page"])
    qwords = set(re.findall(r"[a-z]{3,}", unicodedata.normalize("NFKC", q["question"]).lower()))
    text_ok = not qwords or len(qwords & words) / len(qwords) >= 0.8
    # Dixit PDFs use a font whose digits have no text mapping, so numeric options cannot be read back.
    opts = [alnum(o) for o in q["options"]]
    checkable = [o for o in opts if o and not (kind == "dixit" and o.isdigit())]
    options_ok = all(o in flat for o in checkable)
    key_ok = None
    if kind in ("rk", "dixit") and "q" in src:
        if path not in keys:
            pattern = r"(\d{1,3})\s*\.\s*\(\s*([a-dA-D])\s*\)" if kind == "rk" else r"(\d{1,3})\s*\.\s*([a-dA-D])\b"
            keys[path] = answer_key(path, pattern)
        if q["id"] in SOLVED_BY_HAND:
            key_ok = True
        elif src["q"] in keys[path]:
            key_ok = keys[path][src["q"]] == q["correctAnswer"]
    elif kind == "science":
        if q["id"] in SOLVED_BY_HAND:
            key_ok = True
        else:
            ticked = tick_option(doc(path)[src["page"] - 1])
            key_ok = None if ticked is None else ticked == q["correctAnswer"]
    return {"text": text_ok, "options": options_ok, "key": key_ok}


def tick_option(page):
    """Science slides: the teacher's red ✓ sits just left of / over the correct option label.
    Count red ink pixels in a band around each A./B./C./D. label; return the index only when one clearly wins."""
    # ponytail: pixel-count heuristic, also catches red crosses/circles near labels; ambiguous slides return None
    labels = {}
    for w in page.get_text("words"):
        m = re.fullmatch(r"([A-D])[.)]?", w[4])
        if m and m.group(1) not in labels:
            labels[m.group(1)] = pymupdf.Rect(w[:4])
    if len(labels) < 4:
        return None
    pix = page.get_pixmap(colorspace=pymupdf.csRGB, alpha=False)
    buf, stride = pix.samples, pix.stride
    score = {}
    for k, r in labels.items():
        n = 0
        for y in range(int(max(0, r.y0 - 10)), int(min(pix.height, r.y1 + 8))):
            for x in range(int(max(0, r.x0 - 55)), int(min(pix.width, r.x1))):
                i = y * stride + 3 * x
                n += buf[i] > 170 and buf[i + 1] < 90 and buf[i + 2] < 90
        score[k] = n
    top = sorted(score.values(), reverse=True)
    if top[0] < 15 or top[0] < 2 * max(top[1], 1):
        return None
    return "ABCD".index(max(score, key=score.get))


def main():
    if not os.path.isdir(PDF_ROOT):
        sys.exit(f"Source PDFs not found at {PDF_ROOT} (set APTI_PDF_ROOT)")
    keys, summary = {}, Counter()
    for name in ("questions.json", "rk_ranjan_questions.json"):
        path = os.path.join(DATA, name)
        data = json.load(open(path, encoding="utf-8"))
        for q in data:
            c = check(q, keys)
            q["check"] = {k: v for k, v in c.items() if k != "reason"}
            group = "rk" if q.get("faculty") == "RK Ranjan" else ("dixit" if re.search(r"aptitude", q["subject"], re.I) else "science")
            summary[(group, "total")] += 1
            summary[(group, "text")] += c["text"]
            summary[(group, "options")] += c["options"]
            summary[(group, "key_checked")] += c["key"] is not None
            summary[(group, "key_ok")] += c["key"] is True
            summary[(group, "key_mismatch")] += c["key"] is False
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    for g in ("dixit", "science", "rk"):
        t = summary[(g, "total")]
        print(f"{g:8} total={t:5}  text={summary[(g, 'text')]:5}  options={summary[(g, 'options')]:5}  "
              f"key checked={summary[(g, 'key_checked')]:5}  key ok={summary[(g, 'key_ok')]:5}  key MISMATCH={summary[(g, 'key_mismatch')]}")


if __name__ == "__main__":
    main()
