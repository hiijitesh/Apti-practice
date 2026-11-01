#!/usr/bin/env python3
"""
Universal PDF Question Extractor & Auditor
==========================================
A robust, spatial-aware extractor for slide presentations and question notes
(e.g., Science Magnet, Railway Exams, SSC, CBT).

Key Capabilities:
1. Spatial Block Layout: Resolves 2-column layouts (A/C/B/D) via 2D bounding boxes.
2. Multi-Format Option Recognition: Supports 'A.', '(A)', 'A)', standalone 'A', and 'A Text'.
3. Zero-Hindi Sanitization: Strips Devanagari text automatically to comply with strict English rules.
4. Flexible Header Recognition: Handles 'PYQ', 'Exam Review', 'Practice Questions', or plain exam tags.
5. Slide Number Attribution: Enriches every question with integer 'slidePage' and explanation tag.
6. Deduplication Engine: Detects duplicate slide pages within the same presentation.
7. Audit & Comparison Mode: Compares detected slides with existing JSON question banks.
"""

import os
import re
import sys
import json
import argparse
from typing import List, Dict, Any, Optional

try:
    import pymupdf  # PyMuPDF
except ImportError:
    try:
        import fitz as pymupdf
    except ImportError:
        print("Error: PyMuPDF is required. Install via: pip install pymupdf")
        sys.exit(1)

HINDI_REGEX = re.compile(r'[\u0900-\u097F]+')
BANNER_PATTERNS = [
    re.compile(r'निर्मा[णण]\s*Batch.*', re.I),
    re.compile(r'ननमा[ाय][णण]\s*Batch.*', re.I),
    re.compile(r'Live Helpline Number.*', re.I),
    re.compile(r'Contact\s*-?\s*\d{10}.*', re.I),
    re.compile(r'NIRMAN BATCH.*', re.I),
    re.compile(r'N\s*E\s*E\s*R\s*A\s*J\s*J\s*A\s*N\s*G\s*I\s*D', re.I),
]

EXAM_PATTERNS = [
    re.compile(r'(?:RRB|Railway|ALP|Technician|Group-?D|NTPC|JE|SSC|UPSC)[^\n]+?(?:Shift|Stage|Tier|\d{4})[^\n]*', re.I),
    re.compile(r'RRB\s+[A-Za-z0-9\s\-\/\.]+(?:Shift|Stage)[^\n]*', re.I),
]

HEADER_PATTERNS = [
    re.compile(r'Previous\s*Years?\s*Questions?', re.I),
    re.compile(r'SCIENCE\s*EXAM\s*REVIEW', re.I),
    re.compile(r'PRACTICE\s*QUESTIONS?', re.I),
    re.compile(r'MOCK\s*TEST', re.I),
]


def strip_hindi(text: str) -> str:
    """Removes Hindi characters and normalizes whitespace."""
    if not text:
        return ""
    cleaned = HINDI_REGEX.sub(' ', text)
    cleaned = re.sub(r'[ \t]+', ' ', cleaned)
    cleaned = re.sub(r'\n\s*\n', '\n', cleaned)
    return cleaned.strip()


def is_banner(line: str) -> bool:
    """Checks if a line is promotional text or helpline contact."""
    for p in BANNER_PATTERNS:
        if p.search(line):
            return True
    return False


def clean_line(line: str) -> str:
    """Cleans a single line of text."""
    line = strip_hindi(line)
    if is_banner(line):
        return ""
    return line.strip()


def extract_exam_tag(text: str) -> str:
    """Extracts official exam tag from slide text."""
    for p in EXAM_PATTERNS:
        m = p.search(text)
        if m:
            tag = clean_line(m.group(0))
            if len(tag) > 5:
                return tag
    return ""


def parse_slide_question(page, page_num: int) -> Optional[Dict[str, Any]]:
    """
    Parses a single slide page into structured question data using
    spatial 2D bounding boxes to resolve 2-column options and multi-line stems.
    """
    raw_text = page.get_text()
    
    # 1. Check if slide looks like a question
    has_header = any(p.search(raw_text) for p in HEADER_PATTERNS)
    has_tag = any(p.search(raw_text) for p in EXAM_PATTERNS)
    opt_indicators = len(re.findall(r'(?:^|\s|\n)(?:[A-D]\.|\([A-D]\)|[A-D]\s*\n)', raw_text))
    
    if not (has_header or has_tag) and opt_indicators < 3:
        return None

    # 2. Extract blocks with coordinates (x0, y0, x1, y1, text)
    blocks = page.get_text("blocks")
    if not blocks:
        return None

    sorted_blocks = sorted(blocks, key=lambda b: (b[1], b[0]))
    exam_tag = extract_exam_tag(raw_text)
    
    stem_lines = []
    option_blocks = []
    
    for b in sorted_blocks:
        b_text = b[4].strip()
        lines = [clean_line(l) for l in b_text.splitlines() if clean_line(l)]
        if not lines:
            continue
            
        combined_block = " ".join(lines)
        if any(h.search(combined_block) for h in HEADER_PATTERNS):
            continue
        if exam_tag and (combined_block == exam_tag or combined_block in exam_tag):
            continue
            
        has_opt_marker = re.match(r'^[A-D][\.\)]?$', lines[0]) or re.match(r'^[A-D]\s+[A-Za-z0-9]', lines[0])
        
        # In landscape slides (height ~540pt), question stems are in upper 35% (y < 190)
        # Options are below y=175
        if has_opt_marker or b[1] > 175:
            option_blocks.append((b[0], b[1], b[2], b[3], lines))
        else:
            stem_lines.extend(lines)

    # 3. Resolve Question Stem
    filtered_stem = []
    for l in stem_lines:
        if exam_tag and (l in exam_tag or exam_tag in l):
            continue
        if any(h.search(l) for h in HEADER_PATTERNS):
            continue
        filtered_stem.append(l)

    question_stem = " ".join(filtered_stem).strip()
    if not question_stem and option_blocks:
        if option_blocks[0][1] < 150:
            question_stem = " ".join(option_blocks[0][4])
            option_blocks = option_blocks[1:]

    question_stem = strip_hindi(question_stem)
    if not question_stem:
        return None

    # 4. Extract Options (A, B, C, D) using 2D spatial matching
    options_dict = {}

    # Strategy 1: Letter block with adjacent text block (0 < dx < 250, |dy| < 40)
    for b in option_blocks:
        lines = b[4]
        m_single = re.match(r'^([A-D])[\.\)]?$', lines[0].strip())
        if m_single:
            letter = m_single.group(1).upper()
            bx0, by0 = b[0], b[1]
            best_text = ""
            best_dist = 999999
            for other in option_blocks:
                if other == b:
                    continue
                dx = other[0] - bx0
                dy = other[1] - by0
                if 0 < dx < 250 and abs(dy) < 40:
                    dist = dx + abs(dy) * 2
                    if dist < best_dist:
                        best_dist = dist
                        best_text = " ".join(other[4])
            if best_text and letter not in options_dict:
                options_dict[letter] = best_text

    # Strategy 2: Single block containing letter and text (e.g. 'A. Glucose' or 'A Glucose')
    if len(options_dict) < 4:
        for b in option_blocks:
            lines = b[4]
            for idx, l in enumerate(lines):
                m_inline = re.match(r'^([A-D])[\.\)]?\s+(.+)$', l.strip())
                if m_inline:
                    letter = m_inline.group(1).upper()
                    val = m_inline.group(2).strip()
                    if letter not in options_dict and val and not any(h.search(val) for h in HEADER_PATTERNS):
                        options_dict[letter] = val

    # Strategy 3: Multi-line block with letter on line 0, text on line 1
    if len(options_dict) < 4:
        for b in option_blocks:
            lines = b[4]
            if len(lines) >= 2 and re.match(r'^([A-D])[\.\)]?$', lines[0].strip()):
                letter = lines[0].strip()[0].upper()
                val = " ".join(lines[1:]).strip()
                if letter not in options_dict and val and not any(h.search(val) for h in HEADER_PATTERNS):
                    options_dict[letter] = val

    # Strategy 4: Fallback line regex across raw text
    if len(options_dict) < 4:
        text_no_hindi = strip_hindi(raw_text)
        for m in re.finditer(r'(?:^|\n)\s*([A-D])[\.\)]?\s+([^\n]+)', text_no_hindi):
            letter = m.group(1).upper()
            val = m.group(2).strip()
            if letter not in options_dict and val and not any(h.search(val) for h in HEADER_PATTERNS) and val != exam_tag:
                options_dict[letter] = val

    # Clean and validate options
    clean_opts = {}
    for k in ["A", "B", "C", "D"]:
        v = options_dict.get(k, "").strip()
        v = re.sub(r'^[A-D][\.\)]?\s*', '', v).strip()
        clean_opts[k] = strip_hindi(v)

    if not all(clean_opts.values()):
        return None

    return {
        "slidePage": page_num,
        "question": question_stem,
        "options": clean_opts,
        "exam_tag": exam_tag,
        "raw_text": raw_text
    }


def audit_pdf(pdf_path: str) -> Dict[str, Any]:
    """Audits a PDF file, identifying question slides, duplicates, and stats."""
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    questions = []
    duplicates = []
    seen_stems = {}
    
    for page_idx in range(total_pages):
        page_num = page_idx + 1
        page = doc[page_idx]
        q_data = parse_slide_question(page, page_num)
        if q_data:
            norm_stem = re.sub(r'[^a-z0-9]', '', q_data["question"].lower())[:40]
            if norm_stem in seen_stems:
                duplicates.append((page_num, seen_stems[norm_stem], q_data["question"][:50]))
            else:
                seen_stems[norm_stem] = page_num
                questions.append(q_data)
                
    return {
        "pdf_path": pdf_path,
        "filename": os.path.basename(pdf_path),
        "total_pages": total_pages,
        "question_count": len(questions),
        "duplicate_count": len(duplicates),
        "questions": questions,
        "duplicates": duplicates
    }


def compare_with_database(extracted_questions: List[Dict[str, Any]], db_path: str, chapter_filter: Optional[str] = None) -> Dict[str, Any]:
    """Compares extracted slide questions against an existing JSON question database."""
    with open(db_path, "r", encoding="utf-8") as f:
        db = json.load(f)
        
    db_questions = db if isinstance(db, list) else db.get("questions", [])
    if chapter_filter:
        db_questions = [q for q in db_questions if q.get("chapter", "").lower() == chapter_filter.lower()]
        
    matched = []
    unmatched_extracted = []
    
    for ext in extracted_questions:
        ext_words = [w for w in re.sub(r'[^a-z0-9]', ' ', ext["question"].lower()).split() if len(w) > 3]
        found = False
        
        for db_q in db_questions:
            db_text = (db_q.get("question") or "").lower()
            match_count = sum(1 for w in ext_words if w in db_text)
            if ext_words and (match_count / len(ext_words) >= 0.5 or match_count >= 4):
                found = True
                matched.append((ext["slidePage"], db_q.get("id", "")))
                break
                
        if not found:
            unmatched_extracted.append(ext)
            
    return {
        "db_total": len(db_questions),
        "extracted_total": len(extracted_questions),
        "matched_count": len(matched),
        "missing_from_db_count": len(unmatched_extracted),
        "missing_questions": unmatched_extracted
    }


def main():
    parser = argparse.ArgumentParser(description="Universal PDF Question Extractor & Auditor")
    parser.add_argument("--input", "-i", required=True, help="Path to PDF file or directory containing PDFs")
    parser.add_argument("--output", "-o", help="Path to save output JSON file")
    parser.add_argument("--subject", "-s", default="General Science", help="Subject name (e.g. General Science, Quantitative Aptitude)")
    parser.add_argument("--subsubject", help="SubSubject name (e.g. Physics, Chemistry, Biology)")
    parser.add_argument("--chapter", help="Chapter name override")
    parser.add_argument("--audit", action="store_true", help="Run diagnostic audit scan only")
    parser.add_argument("--compare", help="Path to existing JSON questions file to find missing questions")
    
    args = parser.parse_args()
    
    target_pdfs = []
    if os.path.isfile(args.input):
        if args.input.lower().endswith(".pdf"):
            target_pdfs.append(args.input)
        else:
            print(f"Error: {args.input} is not a PDF file.")
            sys.exit(1)
    elif os.path.isdir(args.input):
        for root, _, files in os.walk(args.input):
            for file in sorted(files):
                if file.lower().endswith(".pdf"):
                    target_pdfs.append(os.path.join(root, file))
    else:
        print(f"Error: Path {args.input} does not exist.")
        sys.exit(1)

    print(f"\nUniversal PDF Question Extractor | Found {len(target_pdfs)} target PDF(s)")
    print("=" * 80)
    
    all_extracted = []
    
    for pdf_path in target_pdfs:
        ch_name = args.chapter or os.path.splitext(os.path.basename(pdf_path))[0]
        audit_res = audit_pdf(pdf_path)
        
        print(f"\nPDF: {audit_res['filename']:35} | Pages: {audit_res['total_pages']:4} | Question Slides: {audit_res['question_count']:3} | Duplicates: {audit_res['duplicate_count']}")
        if audit_res['duplicates']:
            for d in audit_res['duplicates']:
                print(f"   [Duplicate] Slide {d[0]} is identical to Slide {d[1]}: {d[2]}")
                
        if args.compare:
            comp = compare_with_database(audit_res['questions'], args.compare, ch_name)
            print(f"   Database Comparison ({args.compare}):")
            print(f"   DB Count: {comp['db_total']} | Matched: {comp['matched_count']} | Missing from DB: {comp['missing_from_db_count']}")
            if comp['missing_questions']:
                print(f"   >>> {len(comp['missing_questions'])} MISSING QUESTION(S) DETECTED:")
                for m in comp['missing_questions']:
                    print(f"       * Slide {m['slidePage']}: {m['question'][:70]}")
                    
        for q in audit_res['questions']:
            q["chapter"] = ch_name
            q["subject"] = args.subject
            if args.subsubject:
                q["subSubject"] = args.subsubject
            all_extracted.append(q)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(all_extracted, f, indent=2, ensure_ascii=False)
        print(f"\nSuccessfully wrote {len(all_extracted)} questions to {args.output}")

    print("\n" + "=" * 80)
    print("Audit & Extraction Complete.")


if __name__ == "__main__":
    main()
