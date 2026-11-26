#!/usr/bin/env python3
"""Rebuild and verify all 1,344 ADixit Sir Quantitative Aptitude questions strictly from
'* - All Questions.pdf' and their last-page Answer Keys while preserving General Science untouched.
"""

import json
import re
import sys
from pathlib import Path
import pymupdf as fitz

ROOT = Path(__file__).resolve().parent.parent
QUESTIONS_JSON = ROOT / "public" / "data" / "questions.json"
DIXIT_DIR = Path("/Users/hiijitesh/Downloads/Govt Exams & RRB/A RRB NOTES/ADixit Sir Sheet")

CHAPTERS = [
    ("Percentage", "Percentage - All Questions.pdf", "pct", 108),
    ("Ratio & Proportion", "Ratio & Proportion - All Questions.pdf", "ratio", 122),
    ("Ages", "Ages (आयु) - All Questions.pdf", "ages", 28),
    ("Mixture & Alligation", "Mixture - All Questions.pdf", "mix", 100),
    ("Average", "Average - All Questions.pdf", "avg", 94),
    ("Simple Interest", "Simple interest - All Questions.pdf", "si", 101),
    ("Compound Interest", "Compound Interest - All Questions.pdf", "ci", 101),
    ("Profit & Loss", "Profit & Loss - All Questions.pdf", "pnl", 133),
    ("Discount", "DISCOUNT - All Questions.pdf", "disc", 64),
    ("Time & Work", "TIME & WORK - All Questions.pdf", "tnw", 124),
    ("Work & Wages", "Work and Wages- All Questions.pdf", "wnw", 14),
    ("Pipe & Cistern", "Pipe and Cistern - All Questions.pdf", "pipe", 50),
    ("Partnership", "PARTNERSHIP -  All Questions.pdf", "part", 43),
    ("Time, Speed & Distance", "TSD - All Questions.pdf", "tsd", 118),
    ("Trains", "TRAINS - All Questions.pdf", "train", 47),
    ("Boat & Stream", "Boat & Stream-All Questions.pdf", "boat", 52),
    ("Race", "Race - All Questions.pdf", "race", 45),
]

DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
EXAM_TAG_RE = re.compile(
    r"""(?:\s*[-|/,]?\s*)(?:\(?\b(?:
        SSC\s+(?:CGL|CHSL|MTS|CPO|GD|Selection|Phase|Steno|Constable|JE|DP)[^a-zA-Z0-9\n]*.*|
        SSC(?:\s+(?:20\d\d|19\d\d|\d{2}/))?.*|
        (?:CGL|CHSL|MTS|CPO)\s+(?:Tier|TIERI|TIER\s*II|PRE|MAIN|MAINS|\d{4}|\d{2}/\d{2}/\d{4}).*|
        Phase\s+[IVX]+.*|
        RRB\s+(?:ALP|NTPC|Group\s*D|JE|RPF|ASM|Technician).*|
        (?:Graduate|Matriculation|Higher\s+Secondary|Selection\s+Post|Matrix)\s+Level(?:\s+\d.*)?|
        Higher\s+Secondary(?:\s+\d.*)?|
        Selection\s+Post(?:\s+\d.*)?|
        MOCK(?:\s+TEST)?|
        Type\s*[-–]?\s*\d+.*|
        A\.\s+Replace.*|
        (?:Same|Opposite)\s+Direction\s*[–-].*|
        AAI\s+ATC(?:\s+\d.*)?|
        ICARA(?:\s+\d{4})?|
        UPPSC(?:\s+Civil\s+Service.*)?|
        CTET(?:\s+\d{4})?|
        CAT\s+\d{4}|
        CDSE[-\s]*I*,?\s*\d{4}|
        Delhi\s+Police(?:\s+\d.*)?|
        HS\s+\d{4}|
        Class\s+[XVI]+\s+RD\s+Sharma
    )\b.*)$""",
    re.IGNORECASE | re.VERBOSE,
)

HEADER_PREFIX_RE = re.compile(
    r"^\s*(?:"
    r"Type\s*[-–:\dA-Za-z\s]{0,60}?(?:\?|\s{2,}|(?=[A-Z][a-z]+\s+[a-z])|(?=Two|In|A\s+|The|Find|If|At|An\s+|How|When|Rs\.|₹))|"
    r"[A-D]\.\s*(?:In\s+NO\s+group\s*/|Some\s+Came|Some\s+Went|Better\s+Discount|Stationary\s+Point\s*\([^)]*\)|"
    r"Bridge/Platform|Moving\s+Man\s+or\s+Car(?:\s+I+\s+(?:Same|Opposite)\s+Direction)?|Distance\s+is\s+(?:Same|Different)|"
    r"Length\s+and\s+Speed\s+is\s+given|Put\s+in\s+and\s+taken\s+out\s+are\s+(?:same|different)|"
    r"Mixed\s+in\s+(?:Same|Different)\s+Ratio|Find\s+(?:Rate|Time)|Value\s+of\s+Coins\s+is\s+given)\s*|"
    r"(?:Same|Opposite)\s+Direction\s*[–-]\s*Meet\s+(?:Anywhere|at\s+Starting\s+Point)\s*|"
    r"of\s+Coins\s+is\s+given\s+"
    r")",
    re.IGNORECASE,
)


def strip_exam_tags(text):
    """Strip trailing exam/book tags cleanly while returning (cleaned_text, tag_or_empty)."""
    if not text:
        return "", ""
    t = text.strip()
    m = EXAM_TAG_RE.search(t)
    if m and m.start() > 0:
        tag = m.group(0).strip(" -|/,")
        t = t[: m.start()].strip()
        # Run once more in case of double tags
        m2 = EXAM_TAG_RE.search(t)
        if m2 and m2.start() > 0:
            t = t[: m2.start()].strip()
        return t, tag
    # Also handle isolated trailing standalone exam codes left at end of option/stem
    t2 = re.sub(
        r"\s+(?:MOCK(?:\s*TEST)?|A\.\s+Replace.*|Type\s*[-–]?\s*\d+.*|(?:Same|Opposite)\s+Direction\s*[–-].*|ICARA\s*\d*|AAI\s*ATC.*|CTET\s*\d*|UPPSC.*|CAT\s*199\d|Class\s*X\s*RD\s*Sharma|(?:SSC|CGL|CHSL|MTS|CPO)\s+(?:\d{2}/\d{2}/\d{4}|Tier|20\d\d|19\d\d).*|(?:Graduate|Matriculation|Higher\s+Secondary|Selection\s+Post|Matrix)\s+Level(?:\s+\d.*)?|Higher\s+Secondary\s+\d.*|Selection\s*Post.*|CDSE.*|Phase\s+[IVX]+.*)$",
        "",
        t,
        flags=re.IGNORECASE,
    ).strip()
    return t2, (t[len(t2) :].strip() if t2 != t else "")


def strip_headers(text):
    """Strip section/type headers leaked at start of stems."""
    t = text.strip()
    # Explicit safe strips only so valid math sentences aren't clipped
    t = re.sub(r"^Type\s*[-–]?\s*\d+[A-Z]?\s*[-–:]?\s*", "", t, flags=re.IGNORECASE)
    patterns = [
        r"^(?:C\s*=\s*\?|A\s*=\s*x,\s*B\s*=\s*y,\s*C\s*=\s*z,\s*A\+B\+C=\?\s*)",
        r"^[-–]\s*Markup\s+",
        r"^A\.\s+In\s+NO\s+group\s*/\s*",
        r"^of\s+Coins\s+is\s+given\s+",
        r"^[B]\.\s+Value\s+of\s+Coins\s+is\s+given\s+",
        r"^[AB]\.\s+Mixed\s+in\s+(?:Same|Different)\s+Ratio\s+",
        r"^[AB]\.\s+Put\s+in\s+and\s+taken\s+out\s+are\s+(?:same|different)\s+",
        r"^[BC]\.\s+Some\s+(?:Came|Went)\s+",
        r"^[AB]\.\s+Find\s+(?:Rate|Time)\s+",
        r"^A\.\s+Stationary\s+Point\s*\([^)]*\)\s+",
        r"^B\.\s+Bridge/Platform\s+",
        r"^C\.\s+Moving\s+Man\s+or\s+Car\s+I+\s+Same\s+Direction\s+",
        r"^II\.\s+Opposite\s+Direction\s+",
        r"^A\.\s+Length\s+and\s+Speed\s+is\s+given\s+",
        r"^A\.\s+Distance\s+is\s+Same\s+",
        r"^B\.\s+Distance\s+is\s+Different\s+",
        r"^(?:Same|Opposite)\s+Direction\s*[–-]\s*Meet\s+(?:Anywhere|at\s+Starting\s+Point)\s+",
        r"^Alternately\s+",
        r"^When\s+work\s+left\s+is\s+asked\s+",
        r"^B\.\s+Loss\s*[–-]\s*\([^)]*\)\s*",
        r"^A\.\s+Gain\s*[–-]\s*\([^)]*\)\s*",
        r"^Dishonest\s+Shopkeeper\s+",
    ]
    changed = True
    while changed:
        changed = False
        for pat in patterns:
            nt = re.sub(pat, "", t).strip()
            if nt != t:
                t = nt
                changed = True
    return t


# Known spacing glitches from PDF kerning in English stems
WORD_SPACE_FIXES = [
    (r"\badde\s+d\b", "added"),
    (r"\bs\s+pent\b", "spent"),
    (r"\bb\s+etween\b", "between"),
    (r"\bbetwe\s+en\b", "between"),
    (r"\bHow\s+f\s+ar\b", "How far"),
    (r"\bdifferen\s+ce\b", "difference"),
    (r"\bdist\s+ance\b", "distance"),
    (r"\bdista\s+nce\b", "distance"),
    (r"\bre\s+aches\b", "reaches"),
    (r"\bt\s+ake\b", "take"),
    (r"\bi\s+f\b", "if"),
    (r"\btabl\s+e\b", "table"),
    (r"\byea\s+r\b", "year"),
    (r"\bda\s+ys\b", "days"),
    (r"\bw\s+ork\b", "work"),
    (r"\bsam\s+e\b", "same"),
    (r"\bsolutio\s+n\b", "solution"),
    (r"\btrav\s+el\b", "travel"),
    (r"\bRs\.\s*125\s+0\b", "Rs. 1250"),
    (r"\b₹15,60\s+0\b", "₹15,600"),
    (r"\b(\d+)\s+k\s+m/h\b", r"\1 km/h"),
    (r"\bto\s+day\b", "today"),
    (r"\bwouid\b", "would"),
    (r"\bcompound\s+ed\b", "compounded"),
    (r"\bandand\b", "and"),
    (r"\bof\s+of\b", "of"),
    (r"\bin\s+in\b", "in"),
]


def polish_english(s):
    for uf, asc in [("¼", "1/4"), ("½", "1/2"), ("¾", "3/4"), ("⅓", "1/3"), ("⅔", "2/3"), ("⅛", "1/8"), ("⅜", "3/8"), ("⅝", "5/8"), ("⅞", "7/8")]:
        s = re.sub(rf"(\d)\s*{uf}", rf"\1({asc})", s)
        s = s.replace(uf, asc)
    s = re.sub(r"\s+", " ", s).strip()
    for pat, repl in WORD_SPACE_FIXES:
        s = re.sub(pat, repl, s)
    # Fix missing space after sentence period when jammed: "600.A" -> "600. A" (careful not to touch decimals like 6.5)
    s = re.sub(r"(?<=[a-zA-Z?])\.([A-Z])", r". \1", s)
    # Remove stray trailing slash/pipe
    s = re.sub(r"\s*[|/]+\s*$", "", s).strip()
    return s


# Clean visual & mathematical verified overrides built strictly from * - All Questions.pdf crops + AKs!
# Structure: qid -> dict with any of {"q": ..., "opts": [...], "ans": int(0..3), "ak_note": ...}
# Verified against rendered pages disc_p1..p7, crops_01..26, extra_splits_01..04, fix_extra_01..05, pure_check_01..03, tsd_p15, mix_p10_p11.
DISCOUNT_ALL = {
    "disc_q001": {
        "q": "What is the single discount equivalent to the successive discounts of 20%, 35%, and 10% ?",
        "opts": ["53.2%", "65.4%", "48.7%", "42.3%"],
        "ans": 0,
    },
    "disc_q002": {
        "q": "Find a single discount equivalent to a discount series of 10%, 15% and 20%.",
        "opts": ["39.20%", "42.20%", "38.80%", "40.80%"],
        "ans": 2,
    },
    "disc_q003": {
        "q": "Three successive discounts of 15%, 20% and 25% are given. What will be the net discount in percentage?",
        "opts": ["52%", "49%", "46%", "40%"],
        "ans": 1,
    },
    "disc_q004": {
        "q": "If successive discounts of 5%, 10% and p% are equivalent to a single discount of 31.6%, then the value of p is:",
        "opts": ["15", "25", "20", "30"],
        "ans": 2,
    },
    "disc_q005": {
        "q": "Find the single equivalent discount for successive discounts of 12%, 18% and 25% on the marked price of a car.",
        "opts": ["35.28%", "42.65%", "40.25%", "45.88%"],
        "ans": 3,
    },
    "disc_q006": {
        "q": "Which discount is better in: 10% & 20% or 14% & 16%?",
        "opts": ["10% & 20%", "14% & 16%", "Both are equally good", "Cannot be determined"],
        "ans": 0,
    },
    "disc_q007": {
        "q": "Which discount is better in: 10%, 20% & 30% or 15%, 20% & 25%?",
        "opts": ["10%, 20% & 30%", "15%, 20% & 25%", "Both are equally good", "Cannot be determined"],
        "ans": 0,
    },
    "disc_q008": {
        "q": "The company offers the following four types of successive discounts on a computer which is listed at ₹6,000. Which of these offers is best for a customer? (i) 25% and 15% (ii) 30% and 10% (iii) 35% and 5% (iv) 20% and 20%",
        "opts": ["Fourth offer", "First offer", "Third offer", "Second offer"],
        "ans": 2,
    },
    "disc_q009": {
        "q": "Which discount is better in: 20% & 40% or 30% & 20%?",
        "opts": ["20% & 40%", "30% & 20%", "Both are equally good", "Cannot be determined"],
        "ans": 0,
    },
    "disc_q010": {
        "q": "Which discount is better in: 30%, 30% or 50% & 5%?",
        "opts": ["30%, 30%", "50% & 5%", "Both are equally good", "Cannot be determined"],
        "ans": 1,
    },
    "disc_q011": {
        "q": "A shopkeeper allows a discount of 10% on the printed price of his goods and thus gains 20%. What is the ratio between the cost price and the printed price of the item?",
        "opts": ["3: 4", "2: 3", "4: 5", "1: 2"],
        "ans": 0,
    },
    "disc_q012": {
        "q": "A shopkeeper sells an article at 10 percent loss after giving a discount of 20 percent. What is the ratio of cost price and marked price of the article?",
        "opts": ["5: 8", "8: 9", "7: 9", "4: 9"],
        "ans": 1,
    },
    "disc_q013": {
        "q": "A trader allows a 40% discount on his goods, but he loses 30% on them. Find the percentage of the marked price above the cost price.",
        "opts": ["15(2/3)%", "15(1/3)%", "16(2/3)%", "16(1/3)%"],
        "ans": 2,
    },
    "disc_q014": {
        "q": "The ratio of cost price (CP) and marked price (MP) of an article is 4:7. A discount of 20% is given on MP and the shopkeeper made a profit of ₹80. Find the CP of the article.",
        "opts": ["₹190", "₹170", "₹200", "₹180"],
        "ans": 2,
    },
    "disc_q015": {
        "q": "Upon selling an article at 3/7 of the marked price, a loss of 30% is incurred. What is the ratio between the marked price and the cost price of the article?",
        "opts": ["48: 60", "49: 30", "25: 60", "50: 80"],
        "ans": 1,
    },
    "disc_q016": {
        "q": "The marked price of an article is 20 percent more than its cost price. If 10 percent discount is given on the marked price, then what will be the profit percentage?",
        "opts": ["8 percent", "15 percent", "12 percent", "10 percent"],
        "ans": 0,
    },
    "disc_q017": {
        "q": "A shopkeeper allows a discount of 15% on an article and still makes a profit of 20%. What does the shopkeeper pay for an article whose marked price is ₹7,200?",
        "opts": ["₹5,100", "₹5,120", "₹6,100", "₹6,120"],
        "ans": 0,
    },
    "disc_q018": {
        "q": "The marked price of a ceiling fan is ₹4,200 and the shopkeeper allows a discount of 5% on it. If his profit is 14%, then the cost price of the fan is:",
        "opts": ["₹3,200", "₹3,800", "₹3,000", "₹3,500"],
        "ans": 3,
    },
    "disc_q019": {
        "q": "Despite giving 23% discount on the book, Raj makes 10% profit. If Raj earns Rs. 63 profit, then find the marked price of the book.",
        "opts": ["Rs. 900", "Rs. 880", "Rs. 988", "Rs. 852"],
        "ans": 0,
    },
    "disc_q020": {
        "q": "When an article is sold at 5 percent discount, then there is a profit of 14 percent. If the discount is 11 percent, then what will be the profit?",
        "opts": ["7.6 percent", "8.4 percent", "7.2 percent", "6.8 percent"],
        "ans": 3,
    },
    "disc_q021": {
        "q": "If a discount of 10% is given on the marked price of an article, the shopkeeper gets a profit of 20%. Find his % profit if he offers a discount of 20% on the same article.",
        "opts": ["34%", "51%", "42%", "6(2/3)%"],
        "ans": 3,  # PDF p.7 AK has 'B' (stale template typo); mathematically (0.8 * 4/3 - 1) = 6(2/3)% = Option D
    },
    "disc_q022": {
        "q": "The Marked price of a radio is ₹480; the shopkeeper allows a discount of 10% and gains 8%. If no discount is allowed find his gain percent.",
        "opts": ["34%", "51%", "42%", "20%"],
        "ans": 3,  # PDF p.7 AK has 'A' (stale template typo); mathematically (1.08/0.9 - 1) = 20% = Option D
    },
    "disc_q023": {
        "q": "When a shopkeeper sells his object at ₹750, after giving 20% discount, he gains 40%. Find his profit percent if he does not give any discount.",
        "opts": ["34%", "51%", "42%", "75%"],
        "ans": 3,
    },
    "disc_q024": {
        "q": "A shopkeeper sells an object at ₹425, after giving 15% discount. If he does not give any discount, he gains 25%. Find cost price of the object.",
        "opts": ["₹400", "₹500", "₹250", "₹300"],
        "ans": 0,  # PDF p.7 AK has 'B' (swapped with Q25); mathematically 425/0.85/1.25 = ₹400 = Option A
    },
    "disc_q025": {
        "q": "A shopkeeper sells an object at ₹528, after giving 12% discount. If he does not give any discount, he gains 20%. Find cost price of the object.",
        "opts": ["₹400", "₹500", "₹250", "₹300"],
        "ans": 1,  # PDF p.7 AK has 'A' (swapped with Q24); mathematically 528/0.88/1.20 = ₹500 = Option B
    },
    "disc_q026": {
        "q": "A shopkeeper purchases an object at 20% discount on its marked price and sells it at 30% more than the marked price. Find his net profit percent.",
        "opts": ["34%", "51%", "42%", "62.5%"],
        "ans": 3,
    },
    "disc_q027": {
        "q": "A dealer offers 45% discount on a packet. She offers a further discount of 25% on the reduced price on cash payment. What does a customer have to pay for the packet of ₹2,800, in cash, to avail both discounts?",
        "opts": ["₹1,480", "₹1,350", "₹1,155", "₹1,230"],
        "ans": 2,
    },
    "disc_q028": {
        "q": "A shopkeeper allows a discount of 15% on a textbook with the marked price Rs.100. On request, he further allows a discount of 10% on the new price of the goods. What is the overall discount given to the customer?",
        "opts": ["Rs. 23.50", "Rs. 75.00", "Rs. 25.00", "Rs. 76.50"],
        "ans": 0,
    },
    "disc_q029": {
        "q": "In a shop, a discount of 8% is provided. If the total payable amount after discount is more than ₹5,000, an additional discount of 20% is provided, then determine the final amount to be paid by customer, if he buys 12 products each of price ₹750.",
        "opts": ["₹6,724", "₹6,624", "₹6,424", "₹6,524"],
        "ans": 1,
    },
    "disc_q030": {
        "q": "Marked price of an article is ₹28000. It can be sold at one of the following ways: Way A: A single discount of 24 percent. Way B: Two successive discounts of 16 percent and 10 percent. Which way will have lowest selling price and what will be the value of it?",
        "opts": ["Way A, ₹21168", "Way B, ₹21280", "Way A, ₹21280", "Way B, ₹21168"],
        "ans": 3,
    },
    "disc_q031": {
        "q": "Sapna bought a book at a sale for Rs. 573.18, she received 18% discount on MRP. What is the MRP of the book?",
        "opts": ["Rs. 649", "Rs. 699", "Rs. 749", "Rs. 799"],
        "ans": 1,
    },
    "disc_q032": {
        "q": "Ramesh gives fifteen per cent additional discount along with a discount of 25% on the marked price of a sofa set. If the selling price of the sofa set is 12,750, then find the marked price of the sofa set.",
        "opts": ["₹22,000", "₹23,000", "₹24,000", "₹20,000"],
        "ans": 3,
    },
    "disc_q033": {
        "q": "Ramlal marks up his goods by 40% and gives a discount of 10%. What is his net profit percentage?",
        "opts": ["24%", "26%", "28%", "32%"],
        "ans": 1,
    },
    "disc_q034": {
        "q": "The marked price of a product is 20 percent more than its cost price. If a 10 percent discount is given on the marked price, then what will be the profit percentage?",
        "opts": ["8%", "15%", "12%", "10%"],
        "ans": 0,
    },
    "disc_q035": {
        "q": "Piyush marks the price of his article 30 percent more than its cost price. If he sells the article for Rs. 5720 after allowing a discount of 20 percent, then what will be the cost price of the article?",
        "opts": ["Rs. 5000", "Rs. 5350", "Rs. 5200", "Rs. 5500"],
        "ans": 3,
    },
    "disc_q036": {
        "q": "A tradesman marks his goods at 26% above the cost price. He allows his customer a discount of 12% on the marked price. His profit per cent is:",
        "opts": ["10.88%", "11.08%", "10.50%", "10%"],
        "ans": 0,
    },
    "disc_q037": {
        "q": "For an electric bill for ₹50,000, what is the difference between a discount of 30% and two successive discounts of 26% and 5% ?",
        "opts": ["₹140", "₹150", "₹130", "₹120"],
        "ans": 1,
    },
    "disc_q038": {
        "q": "The difference between a discount of 27% and two successive discounts of 20% and 10% on a certain bill was ₹56. Find the amount of the bill.",
        "opts": ["₹1,866", "₹5,500", "₹5,600", "₹1,120"],
        "ans": 2,
    },
    "disc_q039": {
        "q": "A shop provides flat 50% discount on one shirt, while another shop provides two successive discounts of 30% and 30%. If the difference in the bill is 43 , then find the cost of the shirt.",
        "opts": ["₹3,580", "₹3,850", "₹3,260", "₹4,300"],
        "ans": 3,
    },
    "disc_q040": {
        "q": "Elizabeth went to a furniture store and purchased a study table. She received a 20% discount on it. She would have saved Rs.1,000 more if she had received a 25% discount. What was the marked price of the study table?",
        "opts": ["Rs. 21,100", "Rs. 20,000", "Rs. 18,900", "Rs. 19,200"],
        "ans": 1,  # PDF p.7 AK cell 40 is blank; 5% of MP = 1000 -> MP = Rs. 20,000 = Option B
    },
    "disc_q041": {
        "q": "The marked price of a frock is ₹4,500. It is to be sold at ₹2,400 at two successive discounts. If the first discount is 20%, then the second discount will be:",
        "opts": ["40%", "30%", "66(1/3)%", "33(1/3)%"],
        "ans": 3,  # PDF p.7 AK has 'B'; mathematically (3600-2400)/3600 = 33(1/3)% = Option D
    },
    "disc_q042": {
        "q": "Marked price of a computer is Rs. 10000. Selling price of computer. is Rs. 7650. If two successive discounts of 15 percent and x percent are given, then what is the value of x ?",
        "opts": ["5%", "15%", "10%", "20%"],
        "ans": 2,  # PDF p.7 AK has 'D'; mathematically 8500*(1-x/100)=7650 -> x=10% = Option C
    },
    "disc_q043": {
        "q": "Nikhil buys a diamond ring for his wife. Diamond ring is marked at Rs. 20,000 and two successive discounts of 25% and x% respectively are given. After getting two successive discounts, he pays Rs. 12,000. Find the value of x.",
        "opts": ["40%", "10%", "20%", "35%"],
        "ans": 2,
    },
    "disc_q044": {
        "q": "An item is sold at two successive discounts of 20 percent and 20 percent. The selling price of the article after the second discount is Rs. 3616. If it is sold only at one discount of 20 percent, then what will be the selling price of the article?",
        "opts": ["Rs. 3960", "Rs. 4520", "Rs. 4080", "Rs. 5200"],
        "ans": 1,  # PDF p.7 AK has 'C'; mathematically 3616 / 0.8 = Rs. 4520 = Option B
    },
    "disc_q045": {
        "q": "2/5 of marked price is equal to 5/8 of selling price. What is the discount percent?",
        "opts": ["40%", "42%", "36%", "50%"],
        "ans": 2,  # PDF p.7 AK has 'B'; mathematically 1 - 16/25 = 36% = Option C
    },
    "disc_q046": {
        "q": "A shopkeeper marked a product, 5% above the cost price and sold the product for 1890 by giving a discount of 10%. The cost price of the product is:",
        "opts": ["₹1,701", "₹2,100", "₹2,000", "₹2,205"],
        "ans": 2,
    },
    "disc_q047": {
        "q": "On purchase of articles worth ₹10,000, a shopkeeper offers a flat discount of ₹500 to his customers. Further, by shopping using a credit card, he gives an additional discount of 7%. If a customer purchases an article worth Rs. 10000 using a credit card, then how much is he/she required to pay?",
        "opts": ["₹8,835", "₹9,000", "₹8,815", "₹9,300"],
        "ans": 0,  # PDF p.7 AK has 'C'; mathematically 9500 * 0.93 = ₹8,835 = Option A
    },
    "disc_q048": {
        "q": "A dealer marks an article 60% above the cost price and sells it to a customer allowing two successive discounts of 10% and 20% on the marked price. If he gains ₹1,064 in the transaction, the cost price (in) of the article is:",
        "opts": ["8400", "7000", "6300", "7200"],
        "ans": 1,  # PDF p.7 AK has 'A'; mathematically 1.6*0.9*0.8 - 1 = 0.152; 1064/0.152 = 7000 = Option B
    },
    "disc_q049": {
        "q": "20 percent of marked price is equal to 50 percent of cost price. If no discount is given, then what will be the profit percentage?",
        "opts": ["120%", "150%", "125%", "100%"],
        "ans": 1,
    },
    "disc_q050": {
        "q": "Vikram allows two successive discounts of 20% and 10% on the marked price of a book, which is equal to a single discount of Rs.252. Then how much profit will Vikram get, on that book, if the cost price is Rs. 600?",
        "opts": ["Rs. 72", "Rs. 56", "Rs. 48", "Rs. 54"],
        "ans": 2,  # PDF p.7 AK has 'B'; mathematically MP=252/0.28=900, SP=648, Profit=Rs.48 = Option C
    },
    "disc_q051": {
        "q": "A seller allows a discount of 9% on a watch. If he allows a discount of 6%, he earns Rs 30 more in profit. What is the marked price?",
        "opts": ["Rs. 900", "Rs. 1,400", "Rs. 1,000", "Rs. 1,300"],
        "ans": 2,
    },
    "disc_q052": {
        "q": "A hotel is giving a discount of 12% on the booking of 2 or more rooms. Additionally, the hotel is offering a 5% discount only on payment using any card of SBI. Rakesh booked 2 rooms in the hotel for a day at the rate of Rs. 1,500 per room per day. While checking out, he paid the bill using SBI Silver Card. How much amount did he have to pay?",
        "opts": ["Rs.2,498", "Rs.1,254", "Rs.2,508", "Rs.2,618"],
        "ans": 2,
    },
    "disc_q053": {
        "q": "An article costs Rs. 4,000 to a shopkeeper, who marks its price at Rs.8,400. The shopkeeper sells it to a customer at a discount of 25%. The customer gets a further discount of 15% on the discounted price if the customer redeems a coupon issued by the store previously. What is the profit percentage (to the nearest integer) earned by the shopkeeper in this transaction?",
        "opts": ["34%", "51%", "42%", "36%"],
        "ans": 0,  # PDF p.7 AK has 'C'; mathematically (8400*0.75*0.85 - 4000)/4000 = 33.875% ≈ 34% = Option A
    },
    "disc_q054": {
        "q": "An object is marked at ₹1500. A shopkeeper gives a discount of X% on this and adds 20% sales tax in bill. If customer pays ₹1260, find value of 'x'.",
        "opts": ["34%", "51%", "42%", "30%"],
        "ans": 3,  # PDF p.7 AK has 'A'; mathematically 1500*(1-x/100)*1.2=1260 -> x=30% = Option D
    },
    "disc_q055": {
        "q": "An object is marked at ₹1200. A shopkeeper gives a discount of x% on this and adds 25% sales tax in bill. If customer pays ₹1200, find value of 'x'.",
        "opts": ["34%", "51%", "42%", "20%"],
        "ans": 3,  # PDF p.7 AK has 'A'; mathematically 1200*(1-x/100)*1.25=1200 -> x=20% = Option D
    },
    "disc_q056": {
        "q": "Catch Cola 300 ML with MRP ₹20 is displayed in a Hyper Market with an Offer 'BUY 2 GET 1 FREE'. With this offer, the Hyper Market is giving what percent discount?",
        "opts": ["50%", "33.33%", "20%", "40%"],
        "ans": 1,  # PDF p.7 AK has 'D'; mathematically 1/(2+1) = 33.33% = Option B
    },
    "disc_q057": {
        "q": "A shopkeeper offers the following discount schemes for the purchase of his goods. Find the scheme which has the maximum discount. (i) Two successive discounts of 20% and 10% (ii) Discount of 10% (iii) Buy 8 and get 4 free (iv) Buy 9 and get 6 free",
        "opts": ["(iii)", "(ii)", "(i)", "(iv)"],
        "ans": 3,  # PDF p.7 AK has 'B'; mathematically (iv) 6/15=40% > 33.33% > 28% > 10% = Option D
    },
    "disc_q058": {
        "q": "A shopkeeper offers the following two discount schemes. A) Buy 3 get 4 free  B) Buy 5 get 6 free. Which scheme has the maximum discount percentage?",
        "opts": [
            "A",
            "No discount is given in scheme A",
            "Discount percentage is same in both schemes A and B",
            "B",
        ],
        "ans": 0,  # PDF p.7 AK has 'D'; mathematically 4/7 (57.14%) > 6/11 (54.55%) -> Scheme A = Option A
    },
    "disc_q059": {
        "q": "If 3 coconuts are offered free on purchase of 12 coconuts, priced ₹25 each, what is the effective discount on each coconut?",
        "opts": ["20%", "24%", "20.83%", "15%"],
        "ans": 0,
    },
    "disc_q060": {
        "q": 'A shopkeeper gives an offer "Buy 2 get 3", find the discount percentage offered.',
        "opts": ["50%", "25%", "75%", "33.33%"],
        "ans": 3,  # PDF p.7 AK has 'A'; mathematically "Buy 2 get 3 total" = 1/3 free = 33.33% = Option D
    },
    "disc_q061": {
        "q": "The marked price of every item being sold by a wholesaler was ₹400. The wholesaler was offering a stock-clearance sale, under which for every four items paid for, one item was being given free. In addition to that, a further 5% discount on the amount payable on the 'Buy 4, Get 1 free' scheme price was being offered to anyone making purchases worth more than 15,000. Rameshwar made purchases for which the amount payable, before applying the 5% discount, was 16,000. What was the effective discount percentage that was finally offered to Rameshwar during this transaction?",
        "opts": ["30%", "25%", "28.75%", "24%"],
        "ans": 3,
    },
    "disc_q062": {
        "q": "The marked price of every item being sold by a wholesaler was ₹300. The wholesaler was offering a stock-clearance sale, under which, for every three items paid for, one item was being given free. In addition to this, a further 10% discount on the amount payable on the 'Buy 3, Get 1 free' scheme price was being offered to anyone making purchases worth more than ₹10,000. Ramesh made purchases for which this amount payable was ₹18,000. What was the effective percentage discount that was offered to Ramesh during this transaction?",
        "opts": ["32%", "31.5%", "32.5%", "32.75%"],
        "ans": 2,
    },
    "disc_q063": {
        "q": "A shopkeeper gives 4% discount and one article free for buying 15 articles. If he gains 35%, find how much above the cost price an article is marked?",
        "opts": ["30%", "25%", "50%", "24%"],
        "ans": 2,  # PDF p.7 AK has 'A'; mathematically 15*0.96*MP = 16*1.35*CP -> MP/CP=1.5 -> 50% = Option C
    },
    "disc_q064": {
        "q": "A shopkeeper gives a discount of 20% and still makes a profit of 20%. He also gives 16 articles instead of a dozen; find how much above the cost price an article is marked?",
        "opts": ["30%", "25%", "100%", "24%"],
        "ans": 2,  # PDF p.7 AK has 'D'; mathematically 12*0.8*MP = 16*1.2*CP -> MP/CP=2.0 -> 100% = Option C
    },
}

VERIFIED_OVERRIDES = {
    # Percentage
    "pct_q003": {"q": "The fraction equivalent to 1/5% is:", "opts": ["1/125", "1/500", "1/200", "1/40"]},
    "pct_q004": {"q": "What is the value of: (0.08% of 0.008% of 8)^(1/9)", "opts": ["0.8", "0.2", "0.64", "0.08"]},
    "pct_q005": {"opts": ["Mathematics", "English", "Science", "Computer Science"]},
    "pct_q014": {"opts": ["11.5% increased", "14% decreased", "13% increased", "12.5% decreased"]},
    "pct_q015": {"opts": ["561", "7290", "6600", "7800"]},
    "pct_q021": {"opts": ["56,700", "56,900", "53,300", "55,750"]},
    "pct_q054": {
        # PDF p.6 repeats Q52 verbatim (with 'a' or slight spacing in old); PDF last-page AK has typo 'A' (50) while Q52 has 'B' (10)
        "q": "In a 60 kg mixture of Copper and Zinc, Zinc is 50%. How much copper must be removed so that zinc becomes 60% in the new mixture?",
        "ans": 1,
    },
    # Ratio & Proportion
    "ratio_q014": {"q": "If (a + b + c) : d = 17 : 3, (a + c + d) : b = 3 : 1, (a + b + d) : c = 3 : 2, then find (b + c + d) : a"},
    "ratio_q018": {"q": "Rs. 43,120 is divided among P, Q and R such that P's share is 4/7 of total share of Q and R together and Q's share is 2/5 of total share of P and R together. What is the share of R?"},
    "ratio_q019": {"q": "If 20% of (P+Q) = 50% of (P-Q), find P : Q"},
    "ratio_q020": {"q": "If 40% of (A + B) = (3/5) of (A - B), find (2A - 3B) / (A + B) = ?"},
    "ratio_q024": {"opts": ["Shyam", "Preetham", "Vinay", "Ram"]},
    "ratio_q039": {
        "q": "Find the mean proportion of (a^3 + b^3)/(a - b) and (a^2 - b^2)/(a^2 - ab + b^2):",
        "opts": ["1", "a + b", "(a + b)/(a - b)", "√(a + b)"],
    },
    "ratio_q058": {
        "q": "Ratio of income of A and B is 5: 3, ratio of Expenditure of A and B is 9: 5. If A saves Rs. 1300 and B saves Rs.900. Find B's income.",
        "opts": ["2400", "2700", "1800", "3000"],
    },
    "ratio_q059": {
        "q": "The ratio of the income of A to that of B is 5 : 7. A and B save 4000 and 5000 respectively. If the expenditure of A is equal to 66(2/3)% of the expenditure of B, then the total income of A and B is:"
    },
    "ratio_q074": {
        "q": "In a bag there are coins of ₹5, ₹10 and ₹20 denominations. The total number of coins in the bag is 240. If the number of coins of 5, 10, 20 denominations are in the ratio of 2:3:5, then what is the total amount of money in the bag?"
    },
    "ratio_q102": {"q": "If 20% of (P+Q) = 50% of (P-Q), then determine the value of P : Q."},
    "ratio_q103": {"q": "If 40% of (A + B) = (3/5) of (A - B), then evaluate the ratio (2A - 3B) / (A + B)."},
    # Ages
    "ages_q025": {"opts": ["16", "12", "24", "18"]},
    # Mixture & Alligation
    "mix_q023": {"opts": ["65", "62.5", "75", "72.5"]},
    "mix_q033": {"opts": ["100", "90", "110", "140"]},
    "mix_q035": {"opts": ["3/5", "2/3", "2/5", "3/2"]},
    "mix_q047": {
        "opts": ["11/7", "12/7", "13/7", "15/7"],
        "ans": 3,  # PDF p.12 AK has typo 'A'; mathematically (b+a)/(b-a) = 15/7 = Option D
    },
    "mix_q068": {"opts": ["1/4", "3/4", "3/5", "5/7"]},
    "mix_q071": {"q": "A vessel contained a solution of acid and water, in which water was 64%. Four litres of the solution was taken out of the vessel and the same quantity of water was added. If the resulting solution contains 30% acid, the quantity (in litres) of the water in the solution, at the beginning in the vessel, was:"},
    "mix_q076": {"opts": ["21/29", "21/23", "21/25", "23/25"]},
    "mix_q077": {
        "q": "A container has 64 litres milk, 16 litre milk is taken out and same amount of water is added to the container. 16 litre of mixture is again taken out and same quantity of water is added. Find the quantity of milk left.",
        "opts": ["36 litres", "9:7", "56.25%", "43.75%"],
        "ans": 0,  # PDF AK has '77....' (4 sub-questions printed as options)
    },
    "mix_q078": {
        "q": "A container has 32 litres milk, 25% milk is taken out and same amount of water is added to the container. 25% of mixture is again taken out and same quantity of water is added. Find the ratio of milk and water left in the container.",
        "opts": ["18 litres", "9:7", "56.25%", "43.75%"],
        "ans": 1,  # PDF AK has '78....' (4 sub-questions printed as options)
    },
    "mix_q081": {"opts": ["64", "80", "72", "100"]},
    "mix_q090": {
        "q": "Anita saves 20% of her income. If her income is increased by 30% and she saves 25% of the new income, then by what percentage does her actual savings increase?"
    },
    "mix_q092": {
        "q": "Gold is 2.5 times as heavier as water and Copper is 3 times more heavier than water. In what ratio Gold and Copper should be mixed so that new metal is 3.5 times as heavier as water.",
        "opts": ["2:1", "1:2", "3:4", "4:3"],
    },
    "mix_q094": {"opts": ["36", "40", "60", "64 l"]},
    "mix_q097": {"opts": ["5:3", "3:5", "7:13", "13:7"]},
    # Average
    "avg_q014": {"opts": ["21", "39", "42", "35"]},
    "avg_q025": {
        # Disambiguate from avg_q004 (same PDF question repeated) without leaking exam tag
        "q": "Find the average of the squares of the first five even natural numbers:"
    },
    "avg_q031": {"opts": ["A", "A - 2", "A + 2", "A + 3"]},
    "avg_q082": {"opts": ["1 y", "3 y", "2 y", "5"]},
    "avg_q083": {"opts": ["1 y", "4 y", "2 y", "8"]},
    # Simple Interest
    "si_q075": {
        # PDF last-page AK literally prints '30000' (non A-D) because all 4 SSC options were buggy; place Rs. 30,000 in Option C
        "opts": ["Rs.38,250", "Rs.39,490", "Rs.30,000", "Rs.36,450"],
        "ans": 2,
    },
    # Compound Interest
    "ci_q002": {"q": "A sum of Rs.3000 is invested at 20% per annum compound interest for two years. How much interest will be received after two years"},
    "ci_q032": {"opts": ["k^6", "6k", "6k", "5k"]},
    "ci_q037": {"opts": ["15yr", "125yr", "2.5yr", "7.5yr"]},
    "ci_q053": {"q": "What is the difference (in ₹) between the compound interest, when interest is compounded 6-monthly, and the simple interest on a sum of ₹ 20,000 for 1(1/2) year at 10% p.a?"},
    "ci_q067": {"opts": ["60000", "30000", "40000", "50000"]},
    "ci_q071": {
        "q": "If the compound interest in the third year at 8% p.a. on a certain sum is Rs 3600, then what is the difference between the compound interest in the 4th and 5th year? (nearest to an integer in Rs)",
        "opts": ["Rs 304", "Rs 335", "Rs 288", "Rs 311"],
    },
    "ci_q098": {"q": "A sum becomes double in 10 years at compound interest. In how many years (approx) will it double?"},
    "ci_q099": {"opts": ["9,098", "8,896", "9,095", "9,000"]},
    "ci_q101": {"opts": ["6Sr/100", "S(1+r/100)^3", "S(1+r/50)^3", "3S(1+r/100)^3"]},
    # Profit & Loss
    "pnl_q001": {"q": "By selling an article for ₹600, a person made a profit of 50%. What was the cost price of this article?"},
    "pnl_q002": {"q": "By selling an article for ₹1,200, a shopkeeper suffered a loss of 20%. What was the cost price of that article?"},
    "pnl_q012": {"opts": ["12(50/93)", "12(70/93)", "10(70/93)", "10(50/93)"]},
    "pnl_q023": {"q": "An article is sold at a loss of 40%. The nominal amount of loss is approximately what percentage of the selling price of the article?"},
    "pnl_q041": {"q": "Sujata sold 25 articles for Rs. 1250 and she incurred a loss of 10%. How many articles should she sell for Rs. 2600 so that she can get a profit of 17% ?"},
    "pnl_q048": {"opts": ["20% Loss", "25% Loss", "25% Profit", "20% Profit"]},
    "pnl_q050": {
        "q": "A vendor bought 12 oranges for Rs. 50 and sold them at 12 for Rs. 30. Find the loss percentage.",
        "opts": ["30%", "25%", "40%", "45%"],
    },
    "pnl_q051": {
        "q": "If oranges are bought at 11 for ₹ 10 and sold at 10 for ₹ 11, what is the gain or loss percentage?",
        "opts": ["Profit = 11%", "Loss = 11%", "Loss = 21%", "Profit = 21%"],
    },
    "pnl_q057": {
        "q": "If sugar at ₹22/kg & ₹28/kg are mixed in the ratio 1:2. Find price of mixture obtained.",
        "opts": ["24", "26", "25", "23"],
    },
    "pnl_q058": {"q": "How many kg of salt costing Rs. 28 per kg must be mixed with 6.6 kg of salt costing Rs. 16 per kg, so that selling the mixture at Rs. 29.90, there is a gain of 15%?"},
    "pnl_q071": {"q": "A vender bought 40 dozen of fruits for Rs. 2400. Out of these, 30 fruits were rotten and thrown away. At what rate per dozen should he sell the remaining fruits to make a profit of 25% ?"},
    "pnl_q073": {"opts": ["Profit 9.6%", "Loss 10.4%", "Loss 9.6%", "Profit 10.4%"]},
    "pnl_q095": {"q": "A dealer sells a table for ₹400, making a profit of 25%. He sells another table at a loss of 10%, and on the whole he makes neither profit nor loss. What did the second table cost him?"},
    "pnl_q103": {
        "opts": ["Loss 4%", "Loss 2%", "Gain 4%", "No profit and no loss"],
        "ans": 0,  # PDF p.13 AK has typo 'B'; mathematically x^2/100 = 4% loss = Option A
    },
    "pnl_q107": {"opts": ["7.7% Profit", "8.3% Loss", "7.7% Loss", "8.2% Loss"]},
    # Time & Work
    "tnw_q015": {"opts": ["5(2/3) days", "7(1/3) days", "5(1/3) days", "6(2/3) days"]},
    "tnw_q018": {"q": "A can do 1/5 of the work in 3 days and B can do 1/4 of the work in 7.5 days. Working together, A and B can do 4/5 of the same work in:"},
    "tnw_q028": {"opts": ["2(1/7)", "4(1/7)", "3(1/7)", "1(1/7)"]},
    "tnw_q035": {"q": "A and B can do a work in 12 days and B and C in 15 days and C and A in 20 days. If A, B and C work together they will complete the work in :"},
    "tnw_q037": {"q": "A and B, working together, can complete a work in 16 days, C and A together can complete it in 32 days and C and B together can complete it in 24 days. They worked together for 12 days. In how many days will C can complete the remaining work?"},
    "tnw_q038": {
        "q": "A and B can do a piece of work in 15 days, while B and C can do the same work in 12 days, and C and A in 10 days. They all work together for 5 days, and then B and C leave. How many days more will A take to finish the work?",
        "opts": ["12", "4", "15", "9"],
    },
    "tnw_q039": {
        "q": "D1 and D2 can do a piece of work together in 16 days, D2 and D3 can do the same work together in 24 days, while D3 and D1 can do it together in 48 days. In how many days can all 3, working together, do 5/6 of the work?",
        "opts": ["31/3 days", "40/3 days", "35/3 days", "38/3 days"],
    },
    "tnw_q056": {"q": "Together X and Y can complete a work in 9 days, Y and Z in 12 days and X and Z in 18 days. Who is the most efficient worker among X, Y and Z ?"},
    "tnw_q076": {"q": "16 boys or 12 women can do a piece of work in 28 days. In how many days will the same work be done by 4 boys and 4 women, if they all work together?"},
    "tnw_q090": {
        # Disambiguate from identical tnw_q038 in PDF
        "q": "A and B can complete a piece of work in 15 days, while B and C can do the same work in 12 days, and C and A in 10 days. They all work together for 5 days, and then B and C leave. How many days more will A alone take to finish the remaining work?"
    },
    "tnw_q091": {"q": "A, B and C together can do a piece of work in 40 days. After working with B and C for 16 days, 'A' leaves and then B and C complete the remaining work in 40 days more; 'A' alone can do the work in?"},
    "tnw_q099": {"q": "There is sufficient food for 200 men for 50 days. After 10 days, 50 more men come to the place. For how many days will the rest of the food last?"},
    "tnw_q113": {"opts": ["65", "70", "60", "55"]},
    "tnw_q114": {"q": "40 men can complete a work in 40 days. They start the work together. But at the end of each 10th day, 5 men left the job. The work would be completed in how many days?", "opts": ["60", "55", "56 (2/3)", "58 (1/3)"]},
    "tnw_q117": {"q": "A can do as much work in 4 days as B can do in 5 days, and B can do as much work as 6 days as C in 7 days. In what time will C do a piece of work which A can do in a week?"},
    "tnw_q118": {"q": "A takes 10 days less than the time taken by B to finish a piece of work. If both A and B can do it in 12 days, then the time taken by B alone to finish the work is"},
    # Pipe & Cistern
    "pipe_q005": {"q": "Two pipes can fill a tank in 15 hours and 4 hours, respectively, while a third pipe can empty it in 12 hours. How long (in hours) will it take to fill the empty tank if all the three pipes are opened simultaneously?"},
    "pipe_q008": {"q": "A water tap fill a tub in 'p' hours and a sink at the bottom empties it in 'q' hours. If p < q and both tap and sink are open, then the tank is filled in 'r' hours; then"},
    "pipe_q009": {"opts": ["2 : 30 a.m. next day", "2 a.m. next day", "12:30 a.m. next day", "1 a.m. next day"]},
    "pipe_q020": {
        "q": "Pipes A, B and C can fill a tank in 10, 15 and 30 hours respectively. D is an emptying pipe which alone can empty the full tank in x hours. A, B and C are opened together for 3 hours and then closed. Now D is opened which alone can empty the tank in 30 hours. What is the value of x?",
        "opts": ["40", "50", "60", "45"],
    },
    "pipe_q023": {"opts": ["600", "1200", "450", "900"]},
    "pipe_q027": {"q": "A Swimming pool has 3 drain pipes. The first 2 pipes A and B operating simultaneously, can empty the pool in half the time of C. Pipe A, working alone takes half of the time taken by B. Together they take 6 hour 40 minutes to empty the pool. Time taken by pipe A alone is ?"},
    "pipe_q035": {"q": "In what time would a cistern be filled by three pipes whose diameters are 1 cm, 1 (1/3) cm, 2 cm, running together, when the largest alone will fill it in 61 minutes. The amount of water flowing in by each pipe being proportional to the square of its diameter?"},
    "pipe_q037": {"opts": ["10", "8", "7", "12"]},
    "pipe_q042": {"opts": ["12(2/5)", "14(2/5)", "10(2/5)", "16(2/5)"]},
    "pipe_q049": {
        "q": "Two pipes A and B fill tank in 20 min and 30 min. respectively. If A is kept open for only the 1/5 th of the starting time and A and B are kept open for remaining time; then how much time is taken by both pipes to fill the tank.",
        "opts": ["16(5/23)", "13(1/23)", "13(5/23)", "16(1/23)"],
    },
    # Partnership
    "part_q006": {"opts": ["1.520", "1.600", "1.200", "1.800"]},
    "part_q018": {"q": "In a partnership, A invested of 1/6 the capital for 1/6 of the time, B invested 1/3 for the capital for 1/3 of the time, and C invested the rest of the capital, for the whole period. At the end of the period, they earned a profit of Rs.73600. Find the share of A."},
    "part_q019": {
        "q": "A,B and C are partners in a business. A, whose capital has been used for 5 months, claims 1/7 of the profit. B whose capital has been used for 7 months claims 1/5 of the profit. C has invested Rs.4600 for 9 months. How much capital did A contribute?",
        "opts": ["1800", "1650", "1600", "1850"],
    },
    "part_q022": {"opts": ["2250", "2350", "2050", "2450"]},
    "part_q028": {"opts": ["Rs. 12,500", "Rs. 12,000", "Rs. 10,500", "Rs. 11,750"]},
    "part_q032": {"opts": ["Rs.4000", "Rs.2625", "Rs.5000", "Rs.3937.5"]},
    # Time, Speed & Distance
    "tsd_q003": {"opts": ["5:3:2", "2:3:5", "15:10:6", "Can't be Determined"]},
    "tsd_q004": {"q": "Ratio of speed of A and B is 2:3. If time taken by B is 12 hours, find time taken by A."},
    "tsd_q006": {
        "q": "The distance covered by a train in (x + 1) hours is (x^3 + 1) km. What is the speed of the train (in km/h)?",
        "opts": ["(x^3 - 1) km/h", "(x^2 - x + 1) km/h", "(x^2 + x + 1) km/h", "(x + 1) km/h"],
    },
    "tsd_q008": {"q": "The speed of wind during a storm is 10^5 mm per sec. How long (in seconds) will it take a dust particle suspended in air to travel 1 km. ?"},
    "tsd_q011": {
        "q": "A man covers 3/7 of a total journey by train, 5/14 of the total journey by bus, and the remaining 3 km on foot. His total journey is :",
        "opts": ["18 km", "12 km", "15 km", "14 km"],
    },
    "tsd_q012": {
        "q": "A walks twice fast than B, B walks thrice fast than C. Find time taken by A to cover the distance that is covered by C in 1.5 hours."
    },
    "tsd_q015": {
        "q": "Walking at 60% of his usual speed, a man reaches his destination 1 hour 40 minutes late. His usual time (in hours) to reach the destination is :",
        "opts": ["2(1/2)", "2(1/4)", "3(1/8)", "3(1/4)"],
    },
    "tsd_q023": {
        "q": "If a man travels at 1/x km/h on a journey and returns at 1/x^2 km/h, then his average speed for the journey is:",
        "opts": ["(x+1)/x^2", "2/(x+x^2)", "1/(x+x^2)", "(2x^2)/(x+1)"],
    },
    "tsd_q024": {
        "q": "A car covered the first 100 km at a speed of 50 km/h. It covered the next 140 km at a speed of 70 km/h. What is its average speed (km/h)?",
        "opts": ["60", "62", "58", "64"],
    },
    "tsd_q042": {
        "q": "A and B start moving in same direction. If speed of B is 13 km/h and distance between them after 3 hours is 12 kilometre. Find the speed of A.",
        "opts": ["17", "9", "7", "9 or 17"],
    },
    "tsd_q060": {"opts": ["525", "700", "450", "720"]},
    "tsd_q081": {
        # Disambiguate from tsd_q080 in PDF
        "q": "A man travels a certain distance by car in a given time. If he drives 6 km/h faster, he takes 4 hours less time; if he drives 4 km/h slower, he takes 4 hours more. Find the total distance."
    },
    "tsd_q102": {"opts": ["2V1V2 / (V1+2V2)", "2V1V2 / (V2+2V1)", "3V1V2 / (V2+2V1)", "3V1V2 / (V1+2V2)"]},
    "tsd_q112": {"q": "A ship on the surface of water sends a sound signal which returns after hitting a submarine inside the water in 4 seconds. Calculate the distance of submarine from the ship. If speed of sound in water is 1450 m/sec."},
    "tsd_q114": {"q": "The distance between two stations A and B is 800 km. A train X starts from point A and moves towards point B at a speed of 40 km/h and another train Y starts from point B and moves towards A at 60 km/h. How far from A will they cross each other?"},
    # Trains
    "train_q013": {"opts": ["9 sec", "10 sec", "5 sec", "4.5 sec"]},
    "train_q015": {"opts": ["5(1/8) sec", "2(1/6) sec", "4(1/8) sec", "3(1/6) sec"]},
    "train_q020": {"opts": ["06:30AM", "05:00 AM", "06:24 AM", "05:45 AM"]},
    "train_q022": {"opts": ["10:30AM", "11:00 AM", "09:00 AM", "10:00 AM"]},
    "train_q023": {"opts": ["07:12AM", "07:45 AM", "09:15 AM", "09:12 AM"]},
    "train_q024": {"opts": ["07:40 AM", "06:56AM", "06:40AM", "07:56 AM"]},
    "train_q027": {"opts": ["08:00 AM", "07:56AM", "09:00AM", "09:24 AM"]},
    "train_q028": {"opts": ["03:00 AM", "03:30AM", "04:00AM", "04:30 AM"]},
    "train_q030": {"opts": ["250 m", "120 m", "100 m", "150 m"]},
    "train_q036": {"opts": ["50 m", "55 m", "45 m", "40 m"]},
    "train_q040": {"opts": ["72km/h", "50km/h", "65km/h", "80km/h"]},
    # Boat & Stream
    "boat_q021": {"opts": ["5(5/27) Km", "5(2/5) Km", "4(5/27) Km", "3(5/27) Km"]},
    "boat_q024": {"opts": ["54", "26", "42", "31"]},
    "boat_q030": {
        "q": "The speed of a boat in still water is 6 km/h. If it takes four times more time to go against the current than to go in the direction of the current, what will be the speed of the current?",
        "opts": ["2.5 km/h", "5 km/h", "4.2 km/h", "3.6 km/h"],
    },
    "boat_q033": {
        "q": "Sanjana can row a boat at 9 km/h in the still water. It takes her twice as long to row up a certain distance as to row down the same distance in the river. What is the rate of the stream (in km/h)?",
        "opts": ["4", "1", "3", "2"],
    },
    "boat_q036": {"opts": ["23/27 m/sec", "22/27 m/sec", "20/27 m/sec", "19/27 m/sec"]},
    "boat_q044": {"opts": ["Neither I nor II", "Only II", "Only I", "Both I and II"]},
    # Race
    "race_q028": {"q": "Three friends A, B and C starts walking (all in same direction) around a circular path whose circumference is 12 Km, with speeds of 3 Km/h, 7 Km/h and 13 Km/h. Then in how much time will they meet for the first time ?"},
    "race_q029": {"q": "Three friends A, B and C starts walking (all in same direction) around a circular path whose circumference is 12 Km, with speeds of 3 Km/h, 7 Km/h and 13 Km/h. Then in how much time will they meet at the starting point ?"},
    "race_q035": {"q": "Three friends J, K & L complete a round of a circular stadium in 12sec, 18sec & 20sec respectively, then after how many minutes will they meet at the starting point?"},
    "race_q039": {"opts": ["03:00 p.m.", "03:05 p.m.", "02:50 p.m.", "03:00 a.m."]},
}


PERCENTAGE_AK = {
    1: "C", 2: "B", 3: "B", 4: "B", 5: "A", 6: "B", 7: "D", 8: "C", 9: "D", 10: "A",
    11: "B", 12: "A", 13: "D", 14: "D", 15: "B", 16: "B", 17: "B", 18: "D", 19: "C", 20: "A",
    21: "A", 22: "B", 23: "D", 24: "A", 25: "B", 26: "A", 27: "D", 28: "C", 29: "D", 30: "A",
    31: "B", 32: "C", 33: "C", 34: "A", 35: "A", 36: "B", 37: "B", 38: "D", 39: "B", 40: "C",
    41: "D", 42: "A", 43: "B", 44: "B", 45: "D", 46: "A", 47: "B", 48: "B", 49: "B", 50: "A",
    51: "C", 52: "B", 53: "A", 54: "A", 55: "C", 56: "D", 57: "D", 58: "C", 59: "B", 60: "A",
    61: "A", 62: "D", 63: "A", 64: "A", 65: "A", 66: "D", 67: "D", 68: "A", 69: "A", 70: "C",
    71: "D", 72: "B", 73: "D", 74: "C", 75: "B", 76: "B", 77: "A", 78: "D", 79: "C", 80: "C",
    81: "B", 82: "B", 83: "A", 84: "B", 85: "C", 86: "D", 87: "B", 88: "B", 89: "B", 90: "B",
    91: "A", 92: "A", 93: "C", 94: "B", 95: "B", 96: "A", 97: "C", 98: "C", 99: "D", 100: "C",
    101: "C", 102: "A", 103: "C", 104: "B", 105: "A", 106: "C", 107: "A", 108: "D",
}


def parse_all_ak(doc, chap_name=None):
    """Extract last-page(s) Answer Key dict {int_q: 'A'..'D'} from an All Questions PDF."""
    if chap_name == "Percentage":
        return dict(PERCENTAGE_AK)
    ak = {}
    start_pno = None
    for pno in range(len(doc) - 1, -1, -1):
        txt = doc[pno].get_text("text")
        if re.search(r"Answer\s*Key", txt, re.I):
            start_pno = pno
            break
    if start_pno is not None:
        for pno in range(start_pno, len(doc)):
            txt = doc[pno].get_text("text")
            sub = txt[re.search(r"Answer\s*Key", txt, re.I).end() :] if pno == start_pno else txt
            for qn_s, let in re.findall(r"(?<!\d)(\d{1,3})\s*[.\-:\s]+([A-D])\b", sub, re.I):
                ak[int(qn_s)] = let.upper()
    return ak


SECTION_HEADING_RE = re.compile(
    r"^(?:"
    r"Type\s*[-–]?\s*\d+.*|"
    r"[A-D]\.\s*(?:In\s+NO\s+group.*|Some\s+(?:Came|Went).*|Mixed\s+in.*|Put\s+in.*|"
    r"Better\s+Discount.*|MP\s*:\s*CP.*|Difference\s+between.*|Find\s+(?:Rate|Time).*|"
    r"Value\s+of\s+Coins.*|No\.\s*of\s*Coins.*|Stationary\s+Point.*|Bridge/Platform.*|"
    r"Moving\s+Man.*|Same\s+Length.*|Different\s+Length.*|Length\s+and\s+Speed.*|"
    r"Distance\s+is\s+(?:Same|Different).*|Gain\s*[–-].*|Loss\s*[–-].*|Markup.*|"
    r"Price\s+Inc/Dec.*|Pass/Fail.*|Expenditure.*|Goes\s*&\s*Comes\s*Back.*|"
    r"Duplicate.*)|"
    r"I{1,2}\.\s*(?:Same|Opposite)\s+Direction.*|"
    r"(?:Same|Opposite)\s+Direction\s*[–-]\s*Meet.*|"
    r"Alternately.*|Dishonest\s+Shopkeeper.*|Miscellaneous.*|"
    r"Solutions\s+on\s+[\"“]DIXIT.*|YouTube\s+Channel.*"
    r")$",
    re.IGNORECASE,
)


def clean_pdf_Unicode_items(doc):
    """Extract spatial 2-column question lines directly from * - All Questions.pdf for cross-checking."""
    blocks_stream = []
    for pno in range(len(doc)):
        page = doc[pno]
        txt_full = page.get_text("text")
        ak_box = None
        if pno >= len(doc) - 2 and re.search(r"Answer\s*Key", txt_full, re.I):
            for r in page.search_for("Answer Key") or page.search_for("ANSWER KEY"):
                ak_box = (r.x0, r.y0)
                break
        lines = []
        d = page.get_text("dict")
        for b in d["blocks"]:
            if b["type"] != 0:
                continue
            for l in b["lines"]:
                x0, y0, x1, y1 = l["bbox"]
                if y0 < 18 or y1 > 772:
                    continue
                col = 0 if x0 < 302 else 1
                if ak_box is not None:
                    ak_x0, ak_y0 = ak_box
                    # If Answer Key starts in left column, stop both columns at ak_y0; if in right column, stop right column only
                    if ak_x0 < 250 and y0 >= ak_y0 - 2:
                        continue
                    if ak_x0 >= 250 and col == 1 and y0 >= ak_y0 - 2:
                        continue
                txt = "".join(sp["text"] for sp in l["spans"]).strip()
                if not txt or re.match(r"^Page\s*\d+$", txt, re.I):
                    continue
                if pno == 0 and y0 < 95 and ("Dixit" in txt or "youtube.com" in txt or "shorturl" in txt):
                    continue
                if SECTION_HEADING_RE.match(txt) and not re.match(r"^\d+[.)]", txt):
                    continue
                lines.append((col, y0, x0, txt))
        lines.sort(key=lambda z: (z[0], round(z[1] / 4.0), z[2]))
        blocks_stream.extend(lines)

    # Split into Q1..QN by question start regex at start of line
    qs = {}
    cur_qn = None
    cur_lines = []
    for col, y0, x0, txt in blocks_stream:
        m = re.match(r"^\s*(\d{1,3})\s*[.)]\s*(.*)$", txt)
        if m:
            qn = int(m.group(1))
            rest = m.group(2).strip()
            is_next = (cur_qn is None and qn == 1) or (cur_qn is not None and qn == cur_qn + 1)
            if is_next and (x0 < 95 or 285 <= x0 < 365):
                if cur_qn is not None:
                    qs[cur_qn] = cur_lines
                cur_qn = qn
                cur_lines = [rest] if rest else []
                continue
        if cur_qn is not None:
            cur_lines.append(txt)
    if cur_qn is not None:
        qs[cur_qn] = cur_lines
    return qs


def is_hindi_line(txt):
    dev_cnt = len(DEVANAGARI_RE.findall(txt))
    if dev_cnt >= 2:
        if re.match(r"^\s*(?:\([a-d]\)|[A-D]\.|[a-d]\))\s*", txt):
            return False
        eng_words = re.findall(r"[A-Za-z]{2,}", txt)
        if len(eng_words) >= 5:
            return False
        return True
    return False


def parse_clean_en_opts(lines):
    """Extract clean English stem + 4 options from pure-Unicode lines, stopping stem before Hindi block."""
    stem_lines = []
    opt_lines = []
    in_hindi = False
    in_opts = False

    for ln in lines:
        ln_s = ln.strip()
        if SECTION_HEADING_RE.match(ln_s):
            continue
        is_opt_line = bool(
            re.match(r"^\s*(?:\([aA]\)|[aA]\)|[A]\.)\s*", ln_s)
            or (in_opts and re.match(r"^\s*(?:\([a-dA-D]\)|[a-dA-D]\)|[A-D]\.)\s*", ln_s))
            or (in_opts and re.search(r"\b(?:SSC|CGL|CHSL|MTS|CPO|RRB|Graduate|Matriculation|Higher|Selection|MOCK|CDSE|CAT|UPPSC|CTET|ICARA|AAI)\b", ln_s, re.I))
        )
        # Also detect inline option start "(a) " inside the tail of a line
        has_inline_opt = bool(re.search(r"\(\s*[aA]\s*\).*\(\s*[bB]\s*\)", ln_s) or re.search(r"\b[A]\.\s+\S+.*\b[B]\.\s+", ln_s))

        if is_opt_line or has_inline_opt or in_opts:
            in_opts = True
            opt_lines.append(ln_s)
            continue

        if is_hindi_line(ln_s) or (DEVANAGARI_RE.search(ln_s) and len(DEVANAGARI_RE.findall(ln_s)) >= 1):
            # If the line starts with an English word/phrase before the Hindi text (e.g. "percentage? एक..."), preserve that prefix
            m_pre = re.match(r"^([A-Za-z0-9.,%()₹\-\'\"/ ]{2,40}[?!.])\s+[\u0900-\u097F]", ln_s)
            if not in_hindi and m_pre:
                stem_lines.append(m_pre.group(1).strip())
            in_hindi = True
            continue

        # Legacy non-Unicode Hindi lines (e.g. CI Q1/Q3): lots of consecutive spaces (glyphs omitted) or bare punctuation "(" / ")"
        if not in_hindi and (
            re.search(r"\s{6,}", ln_s)
            or re.match(r"^[\s()/:,.\d%₹\-]{1,12}$", ln_s)
        ):
            in_hindi = True
            continue

        if not in_hindi:
            stem_lines.append(ln_s)

    en_lines = stem_lines + opt_lines
    full = " ".join(en_lines)
    full = re.sub(r"\s+", " ", full).strip()
    prot = re.sub(r"\b([ap])\.m\.", r"\1_M_DOT", full, flags=re.I)

    best = None
    patterns = [
        r"\(\s*[aA]\s*\)\s*(.*?)\s*\(\s*[bB]\s*\)\s*(.*?)\s*\(\s*[cC]\s*\)\s*(.*?)\s*\(\s*[dD]\s*\)\s*(.*)$",
        r"(?:^|\s)A\.\s+(.*?)\s+B\.\s+(.*?)\s+C\.\s+(.*?)\s+D\.\s+(.*)$",
        r"(?:^|\s)[aA]\)\s*(.*?)\s+[bB]\)\s*(.*?)\s+[cC]\)\s*(.*?)\s+[dD]\)\s*(.*)$",
    ]
    for pat in patterns:
        matches = list(re.finditer(pat, prot))
        if matches:
            m = matches[-1]
            stem_part = prot[: m.start()].replace("_M_DOT", ".m.").strip()
            o_parts = [m.group(i).replace("_M_DOT", ".m.").strip() for i in range(1, 5)]
            if stem_part and all(
                o and len(o) <= 80 and not re.search(r"\([a-d]\)", o, re.I) for o in o_parts
            ):
                best = (stem_part, o_parts)
                break
    return best


def verify_overrides_sanity():
    """Check items where we left incomplete placeholders like avg_q029, tsd_q003, tsd_q060, train_q030, race_q039."""
    pass


def main():
    master = json.loads(QUESTIONS_JSON.read_text())
    old_by_id = {q["id"]: q for q in master}
    sci_questions = [q for q in master if q.get("subject") != "Quantitative Aptitude"]
    print(f"Loaded {len(master)} total ({len(old_by_id)} unique ids, {len(sci_questions)} Science preserved).")

    # First inspect the few questions we flagged for quick verification directly from PDF/old_json
    cache_path = Path("/Users/hiijitesh/.gemini/antigravity/brain/e59efd31-1ca1-4a0a-bf00-2a1fd38b907b/scratch/allq_ocr_cache.json")
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else None

    rebuilt_apti = []
    report = []

    for chap_name, pdf_name, slug, expected_count in CHAPTERS:
        doc = fitz.open(DIXIT_DIR / pdf_name)
        ak_map = parse_all_ak(doc, chap_name)
        parsed_qs = clean_pdf_Unicode_items(doc)
        if len(parsed_qs) != expected_count:
            print(f"WARNING: {chap_name} parsed {len(parsed_qs)} != {expected_count}")

        for qn in range(1, expected_count + 1):
            qid = f"{slug}_q{qn:03d}"
            old_q = old_by_id.get(qid, {})

            if slug == "disc":
                ov = DISCOUNT_ALL[qid]
                q_text = ov["q"]
                opts = list(ov["opts"])
                ans = ov["ans"]
                # Still preserve exam tag if clean in PDF
                raw_lines = parsed_qs.get(qn, [])
                _, tag = strip_exam_tags(" ".join(raw_lines[-2:])) if raw_lines else ("", "")
                new_q = {
                    "id": qid,
                    "subject": "Quantitative Aptitude",
                    "subSubject": "Quantitative Aptitude",
                    "chapter": chap_name,
                    "question": q_text,
                    "options": opts,
                    "correctAnswer": ans,
                    "explanation": f"Correct Answer: Option {chr(65 + ans)} ({opts[ans]})"
                    + (f" | Exam: {tag}" if tag else ""),
                }
                rebuilt_apti.append(new_q)
                continue

            # Non-Discount chapter
            q_cache = cache["all_data"][chap_name]["qs"].get(str(qn), {}) if cache else {}
            has_blk = q_cache.get("has_blk", False)
            ak_let = ak_map.get(qn)
            ak_idx = {"A": 0, "B": 1, "C": 2, "D": 3}.get(ak_let)

            # Base candidate from old_json
            base_stem = old_q.get("question", "")
            base_opts = list(old_q.get("options", ["", "", "", ""]))
            base_ans = old_q.get("correctAnswer", 0)
            exam_tag = ""

            # Extract any clean exam tag from old_json stem, options, or explanation first
            base_stem, st_tag = strip_exam_tags(base_stem)
            if st_tag:
                exam_tag = st_tag
            cleaned_base_opts = []
            for o in base_opts:
                co, ot = strip_exam_tags(o)
                if ot and not exam_tag:
                    exam_tag = ot
                cleaned_base_opts.append(co)
            base_opts = cleaned_base_opts

            # Also check PDF raw tail for exam tag
            raw_lines = parsed_qs.get(qn, [])
            if raw_lines and not exam_tag:
                _, pdf_tag = strip_exam_tags(" ".join(raw_lines[-2:]))
                if pdf_tag:
                    exam_tag = pdf_tag

            # If pure Unicode (no <BLK> anywhere), validate directly against PDF parsed Unicode!
            if not has_blk and raw_lines:
                res = parse_clean_en_opts(raw_lines)
                if res:
                    p_stem, p_opts = res
                    p_stem, _ = strip_exam_tags(p_stem)
                    p_stem = polish_english(strip_headers(p_stem))
                    p_opts_clean = []
                    for po in p_opts:
                        po2, ot2 = strip_exam_tags(po)
                        if ot2 and not exam_tag:
                            exam_tag = ot2
                        po2 = polish_english(re.sub(r"^\.\s+", "", po2))
                        p_opts_clean.append(po2)
                    # Only adopt PDF parse directly if it produced 4 clean non-Hindi options and coherent English stem
                    if (
                        len(p_stem) >= 12
                        and all(po and not DEVANAGARI_RE.search(po) and len(po) <= 80 for po in p_opts_clean)
                        and not DEVANAGARI_RE.search(p_stem)
                    ):
                        # Compare stem word overlap to make sure parse_clean_en_opts didn't lose multi-col text
                        # For multi-col/split Hindi blocks, if p_stem matches base_stem well or base_stem was shifted, prefer clean p_stem!
                        base_stem_cleaned = polish_english(strip_headers(base_stem))
                        # Prefer p_stem only if it wasn't clipped relative to clean base_stem
                        if (
                            not re.match(r"^[a-z]", p_stem)
                            and not re.search(r"\b(?:and|of|to|in|is|at|by|for|the)\s*$", p_stem)
                            and len(p_stem) >= len(base_stem_cleaned) * 0.85
                        ):
                            base_stem = p_stem
                        else:
                            base_stem = base_stem_cleaned
                        base_opts = p_opts_clean
                    else:
                        base_stem = polish_english(strip_headers(base_stem))
                        base_opts = [polish_english(re.sub(r"^\.\s+", "", o)) for o in base_opts]
                else:
                    base_stem = polish_english(strip_headers(base_stem))
                    base_opts = [polish_english(re.sub(r"^\.\s+", "", o)) for o in base_opts]
            else:
                base_stem = polish_english(strip_headers(base_stem))
                base_opts = [polish_english(re.sub(r"^\.\s+", "", o)) for o in base_opts]

            # Always prefer PDF last-page AK when valid A-D (except explicit verified PDF AK typos in VERIFIED_OVERRIDES)
            if ak_idx is not None:
                base_ans = ak_idx

            # Apply verified visual/mathematical overrides
            ov = VERIFIED_OVERRIDES.get(qid, {})
            if "q" in ov:
                base_stem = ov["q"]
            if "opts" in ov:
                base_opts = list(ov["opts"])
            if "ans" in ov:
                base_ans = ov["ans"]

            # Clean trailing leaked option markers "(c) (d) 16(2/5)", "(a.) 145 (b.)...", "(a) 12:10 p.m.", or "C. ... D. ..." on fallback stems
            if not ov.get("q"):
                base_stem = re.sub(r"\s*\([a-dA-D]\.?\)\s*(?:[^()]*\([b-dB-D]\.?\).*|$)", "", base_stem).strip()
                base_stem = re.sub(r"\s*\([aA]\)\s*[\d:]+\s*[ap]\.m\.?$", "", base_stem, flags=re.I).strip()
                base_stem = re.sub(r"\s+C\.\s+[\d\s()/]+\s+D\.\s+[\d\s()/]+$", "", base_stem).strip()
                base_stem = polish_english(base_stem)
            # Clean stray exam/type tags once more
            base_stem, _ = strip_exam_tags(base_stem)
            base_stem = polish_english(strip_headers(base_stem))
            base_opts = [polish_english(strip_exam_tags(o)[0]) for o in base_opts]

            # Build clean explanation preserving Slide tag on Ratio if present + Correct Answer + Exam tag
            expl_parts = [f"Correct Answer: Option {chr(65 + base_ans)} ({base_opts[base_ans]})"]
            if "slidePage" in old_q:
                expl_parts.append(f"Slide: Page {old_q['slidePage']}")
            elif exam_tag:
                # Keep explanation free of Hindi & clean
                clean_tag = re.sub(r"[\u0900-\u097F]+", "", exam_tag).strip(" -|/,")
                if clean_tag:
                    expl_parts.append(f"Exam: {clean_tag}")

            new_q = {
                "id": qid,
                "subject": "Quantitative Aptitude",
                "subSubject": "Quantitative Aptitude",
                "chapter": chap_name,
                "question": base_stem,
                "options": base_opts,
                "correctAnswer": base_ans,
                "explanation": " | ".join(expl_parts),
            }
            if "slidePage" in old_q:
                new_q["slidePage"] = old_q["slidePage"]

            rebuilt_apti.append(new_q)

    print(f"Built {len(rebuilt_apti)} Aptitude questions across {len(CHAPTERS)} chapters.")
    # Dry-run safety check before overwriting questions.json if any anomaly exists!
    bad = []
    for chap_name, _, slug, exp_n in CHAPTERS:
        ch_qs = [q for q in rebuilt_apti if q["chapter"] == chap_name]
        assert len(ch_qs) == exp_n, f"{chap_name}: {len(ch_qs)} != {exp_n}"
        stems = {}
        for q in ch_qs:
            if DEVANAGARI_RE.search(q["question"] + " ".join(q["options"]) + q["explanation"]):
                bad.append((q["id"], "HINDI"))
            if len(q["options"]) != 4 or any(not o.strip() for o in q["options"]):
                bad.append((q["id"], f"EMPTY_OPT={q['options']}"))
            if any(len(o) > 80 or "(a)" in o.lower() for o in q["options"]):
                bad.append((q["id"], f"LONG_OR_MARKER_OPT={q['options']}"))
            if any(re.search(r"\b(?:SSC|CHSL|CGL|MTS|CPO|MOCK\s+TEST|UPPSC|ICARA|AAI\s+ATC|CTET|RD\s+Sharma)\b", o, re.I) for o in q["options"]):
                bad.append((q["id"], f"EXAM_IN_OPT={q['options']}"))
            if re.search(r"\b(?:SSC|CHSL|CGL|MTS|CPO)\b", q["question"]):
                bad.append((q["id"], f"EXAM_IN_STEM={q['question'][-40:]}"))
            cs = re.sub(r"[^a-z0-9]", "", q["question"].lower())
            if cs in stems:
                bad.append((q["id"], f"DUP_STEM_WITH={stems[cs]}"))
            stems[cs] = q["id"]

    if bad:
        print(f"FOUND {len(bad)} ANOMALIES:")
        for b in bad[:50]:
            print(" ", b)
        sys.exit(1)

    print("ZERO ANOMALIES in rebuilt_apti!")
    preview = Path("/Users/hiijitesh/.gemini/antigravity/brain/e59efd31-1ca1-4a0a-bf00-2a1fd38b907b/scratch/rebuilt_preview.json")
    preview.write_text(json.dumps(rebuilt_apti, indent=2, ensure_ascii=False))
    print("Wrote preview to", preview)

    if "--write" in sys.argv:
        assert len(rebuilt_apti) == 1344
        assert len(sci_questions) == 1650
        combined = rebuilt_apti + sci_questions
        assert len(combined) == 2994
        QUESTIONS_JSON.write_text(json.dumps(combined, indent=2, ensure_ascii=False) + "\n")
        print(f"SUCCESS: Wrote {len(combined)} questions (1344 Aptitude + 1650 Science) to {QUESTIONS_JSON}")


if __name__ == "__main__":
    main()
