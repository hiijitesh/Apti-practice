import json
import re
import os

with open("scripts/sources/science.json", "r", encoding="utf-8") as f:
    science_data = json.load(f)

with open("/Users/hiijitesh/.gemini/antigravity/brain/1311f5f5-e855-413a-bd61-4fefd97538ca/scratch/bio_mapping_results.json", "r", encoding="utf-8") as f:
    mapping_data = json.load(f)

hindi_regex = re.compile(r'[\u0900-\u097F]+')

def strip_hindi(text):
    if not text:
        return ""
    # Replace Hindi sequences with space
    t = hindi_regex.sub(' ', text)
    t = re.sub(r'\s+', ' ', t).strip()
    return t

# 1. Update existing questions with slidePage and clean Hindi
for ch_key, info in mapping_data.items():
    if ch_key not in science_data:
        continue
    questions = science_data[ch_key].get("questions", [])
    matches = info.get("matches", {})
    
    for idx_str, slide_page in matches.items():
        idx = int(idx_str)
        if idx < len(questions):
            q = questions[idx]
            q["slidePage"] = int(slide_page)
            
            # Clean question stem
            q["question"] = strip_hindi(q.get("question", ""))
            
            # Clean options
            opts = q.get("options", {})
            if isinstance(opts, dict):
                cleaned_opts = {}
                for k in ["A", "B", "C", "D"]:
                    cleaned_opts[k] = strip_hindi(str(opts.get(k, "")))
                q["options"] = cleaned_opts
            elif isinstance(opts, list):
                q["options"] = [strip_hindi(str(o)) for o in opts]
                
            # Clean explanation and ensure slide reference
            expl = strip_hindi(q.get("explanation", ""))
            if f"Slide: Page {slide_page}" not in expl:
                if expl:
                    expl = f"{expl} | Slide: Page {slide_page}"
                else:
                    exam_tag = q.get("exam_tag", "").strip()
                    tag_part = f"Exam: {exam_tag} | " if exam_tag else ""
                    expl = f"Official Science Magnet question. | {tag_part}Slide: Page {slide_page}"
            q["explanation"] = expl

# 2. Add the 44 missing questions
missing_44 = [
    # CELL (6)
    {
        "chapter": "CELL",
        "question": "What will happen if a plant cell is placed in a medium having higher water concentration than the cell?",
        "options": {
            "A": "It will probably swell",
            "B": "It will probably shrink",
            "C": "There will be no change",
            "D": "It will burst"
        },
        "answer": "A",
        "exam_tag": "RRB Technicians Grade III 30-12-2024 (Shift-2)",
        "explanation": "When a plant cell is kept in a hypotonic solution (higher water concentration outside), water enters by endosmosis causing the cell to swell. The rigid plant cell wall prevents it from bursting. | Exam: RRB Technicians Grade III 30-12-2024 (Shift-2) | Slide: Page 43",
        "slidePage": 43
    },
    {
        "chapter": "CELL",
        "question": "Which of the following is a rod-like structure that is found in the nucleus only when the cell is about to divide?",
        "options": {
            "A": "Lysosome",
            "B": "Chromosome",
            "C": "Chromatin",
            "D": "Centrioles"
        },
        "answer": "B",
        "exam_tag": "RRB Technicians Grade III 24-12-2024 (Shift-2)",
        "explanation": "Chromatin condenses into rod-like distinct structures called chromosomes only when the cell is preparing to divide. | Exam: RRB Technicians Grade III 24-12-2024 (Shift-2) | Slide: Page 59",
        "slidePage": 59
    },
    {
        "chapter": "CELL",
        "question": "Which of the following in eukaryotes is separated from the cytoplasm by a double membrane and directs the life processes of the cell?",
        "options": {
            "A": "Nucleus",
            "B": "Plastids",
            "C": "Ribosome",
            "D": "Endoplasmic reticulum"
        },
        "answer": "A",
        "exam_tag": "RRB Technicians Grade III 20-12-2024 (Shift-3)",
        "explanation": "The nucleus is enclosed by a double membrane (nuclear envelope) with pores and acts as the control center of eukaryotic cellular activities. | Exam: RRB Technicians Grade III 20-12-2024 (Shift-3) | Slide: Page 71",
        "slidePage": 71
    },
    {
        "chapter": "CELL",
        "question": "Which of the following cellular components is not present in most prokaryotes?",
        "options": {
            "A": "Cytoplasm",
            "B": "Nuclear membrane",
            "C": "Cell wall",
            "D": "Ribosome"
        },
        "answer": "B",
        "exam_tag": "RRB Group-D-02/09/2022 (Shift-II)",
        "explanation": "Prokaryotic cells lack a defined nucleus enclosed by a nuclear membrane; their genetic material lies naked in a region called the nucleoid. | Exam: RRB Group-D-02/09/2022 (Shift-II) | Slide: Page 129",
        "slidePage": 129
    },
    {
        "chapter": "CELL",
        "question": "Some characteristics of prokaryotic cells are mentioned below. Select the incorrect option from the given options.",
        "options": {
            "A": "Presence of membrane-bound organelles",
            "B": "Extremely small size",
            "C": "Single chromosome",
            "D": "Its nuclear region is called nucleoid"
        },
        "answer": "A",
        "exam_tag": "RRB Group-D - 05/09/2022 (Shift-1)",
        "explanation": "Prokaryotic cells do not possess membrane-bound cell organelles like mitochondria, endoplasmic reticulum, or Golgi apparatus. | Exam: RRB Group-D - 05/09/2022 (Shift-1) | Slide: Page 130",
        "slidePage": 130
    },
    {
        "chapter": "CELL",
        "question": "Which type of cell division is used for repair of injury and wear-and-tear in the body?",
        "options": {
            "A": "Only mitosis",
            "B": "Meiosis only",
            "C": "Both mitosis and meiosis",
            "D": "Neither mitosis nor meiosis"
        },
        "answer": "A",
        "exam_tag": "RRB NTPC Stage Ist 26.04.2016 (Shift-II)",
        "explanation": "Mitosis is somatic cell division responsible for growth, replacement of worn-out cells, and healing of injuries. | Exam: RRB NTPC Stage Ist 26.04.2016 (Shift-II) | Slide: Page 132",
        "slidePage": 132
    },

    # CIRCULATORY SYSTEM (4)
    {
        "chapter": "CIRCULATORY SYSTEM",
        "question": "Which of the following statements is/are correct related to transportation?\n(i) Arteries are the vessels which carry blood away from the heart to various organs of the body.\n(ii) The arteries have thin and elastic walls.\n(iii) Veins have valves that ensure that blood flows only in one direction.",
        "options": {
            "A": "Only (i)",
            "B": "Only (i) and (iii)",
            "C": "(i), (ii) and (iii)",
            "D": "Only (i) and (ii)"
        },
        "answer": "B",
        "exam_tag": "Railway Technician 23/12/2024 --> 2nd shift",
        "explanation": "Arteries carry blood away from the heart under high pressure, so they have thick, elastic walls (statement ii is incorrect). Veins collect blood and have valves preventing backflow (statements i and iii are correct). | Exam: Railway Technician 23/12/2024 --> 2nd shift | Slide: Page 12",
        "slidePage": 12
    },
    {
        "chapter": "CIRCULATORY SYSTEM",
        "question": "Which organ of the human body pumps blood?",
        "options": {
            "A": "Pancreas",
            "B": "Stomach",
            "C": "Liver",
            "D": "Heart"
        },
        "answer": "D",
        "exam_tag": "RRB Technicians Grade III 27-12-2024 (Shift-3)",
        "explanation": "The heart is the muscular pumping organ that circulates oxygenated and deoxygenated blood throughout the body. | Exam: RRB Technicians Grade III 27-12-2024 (Shift-3) | Slide: Page 14",
        "slidePage": 14
    },
    {
        "chapter": "CIRCULATORY SYSTEM",
        "question": "Through which vessel does oxygenated blood come to the heart from the lungs?",
        "options": {
            "A": "Left atrium",
            "B": "Pulmonary veins",
            "C": "Pulmonary arteries",
            "D": "Left ventricle"
        },
        "answer": "B",
        "exam_tag": "RRB Technicians Grade III 27-12-2024 (Shift-2)",
        "explanation": "Pulmonary veins carry oxygen-rich blood from the lungs into the left atrium of the heart. | Exam: RRB Technicians Grade III 27-12-2024 (Shift-2) | Slide: Page 23",
        "slidePage": 23
    },
    {
        "chapter": "CIRCULATORY SYSTEM",
        "question": "Which of the following organisms has a three-chambered heart?",
        "options": {
            "A": "Mammals",
            "B": "Amphibians",
            "C": "Birds",
            "D": "Fishes"
        },
        "answer": "B",
        "exam_tag": "RRB Technicians Grade III 28-12-2024 (Shift-2)",
        "explanation": "Amphibians and most reptiles have a three-chambered heart (two atria and one ventricle), whereas fishes have a two-chambered heart and mammals/birds have four chambers. | Exam: RRB Technicians Grade III 28-12-2024 (Shift-2) | Slide: Page 48",
        "slidePage": 48
    },

    # DIGESTIVE SYSTEM (5)
    {
        "chapter": "DIGESTIVE SYSTEM",
        "question": "Which gland secretes the enzyme trypsin?",
        "options": {
            "A": "Salivary gland",
            "B": "Liver",
            "C": "Gastric gland",
            "D": "Pancreas"
        },
        "answer": "D",
        "exam_tag": "RRB Technicians Grade III 27-12-2024 (Shift-2)",
        "explanation": "The pancreas secretes pancreatic juice containing the enzyme trypsin for digesting proteins into peptides. | Exam: RRB Technicians Grade III 27-12-2024 (Shift-2) | Slide: Page 71",
        "slidePage": 71
    },
    {
        "chapter": "DIGESTIVE SYSTEM",
        "question": "Which of the following is called a biological catalyst?",
        "options": {
            "A": "Enzyme",
            "B": "Mucus",
            "C": "Hydrochloric acid",
            "D": "Digestive juice"
        },
        "answer": "A",
        "exam_tag": "RRB Technicians Grade III 30-12-2024 (Shift-3)",
        "explanation": "Enzymes are proteinaceous biocatalysts that accelerate chemical and biochemical reactions in living organisms. | Exam: RRB Technicians Grade III 30-12-2024 (Shift-3) | Slide: Page 73",
        "slidePage": 73
    },
    {
        "chapter": "DIGESTIVE SYSTEM",
        "question": "Using bio-catalysts, complex substances are broken down into simpler substances; these bio-catalysts are called ____.",
        "options": {
            "A": "Fats",
            "B": "Carbohydrates",
            "C": "Enzymes",
            "D": "Oils"
        },
        "answer": "C",
        "exam_tag": "RRB Technicians Grade III 29-12-2024 (Shift-2)",
        "explanation": "Enzymes act as biological catalysts to break down complex food polymers into simpler absorbable units during digestion. | Exam: RRB Technicians Grade III 29-12-2024 (Shift-2) | Slide: Page 74",
        "slidePage": 74
    },
    {
        "chapter": "DIGESTIVE SYSTEM",
        "question": "Which of the following statements related to enzymes in digestion is/are correct?\n(i) The food we eat is digested in our body by various enzymes.\n(ii) Enzymes are specific in their action.\n(iii) Specific enzymes are required for the breakdown of a particular substance.",
        "options": {
            "A": "Only (ii) and (iii)",
            "B": "Only (i)",
            "C": "(i), (ii) and (iii)",
            "D": "Only (i) and (ii)"
        },
        "answer": "C",
        "exam_tag": "RRB Technicians Grade III 24-12-2024 (Shift-2)",
        "explanation": "All three statements are correct: digestion utilizes diverse enzymes, and each enzyme exhibits substrate specificity, catalyzing specific biochemical cleavage reactions. | Exam: RRB Technicians Grade III 24-12-2024 (Shift-2) | Slide: Page 75",
        "slidePage": 75
    },
    {
        "chapter": "DIGESTIVE SYSTEM",
        "question": "Which of the following is the longest part of the alimentary canal?",
        "options": {
            "A": "Large intestine",
            "B": "Small intestine",
            "C": "Stomach",
            "D": "Oesophagus"
        },
        "answer": "B",
        "exam_tag": "RRB Technicians Grade III 28-12-2024 (Shift-2)",
        "explanation": "The small intestine is about 6 to 6.5 meters long in an adult human, making it the longest section of the alimentary canal. | Exam: RRB Technicians Grade III 28-12-2024 (Shift-2) | Slide: Page 80",
        "slidePage": 80
    },

    # ENDOCRINE SYSTEM (8)
    {
        "chapter": "ENDOCRINE SYSTEM",
        "question": "Which of the following endocrine glands secretes growth hormone?",
        "options": {
            "A": "Adrenal gland",
            "B": "Pancreas",
            "C": "Thyroid gland",
            "D": "Pituitary gland"
        },
        "answer": "D",
        "exam_tag": "RRB Technicians Grade III 24-12-2024 (Shift-1)",
        "explanation": "Growth hormone (somatotropin) is synthesized and secreted by the anterior lobe of the pituitary gland. | Exam: RRB Technicians Grade III 24-12-2024 (Shift-1) | Slide: Page 17",
        "slidePage": 17
    },
    {
        "chapter": "ENDOCRINE SYSTEM",
        "question": "What is the function of growth hormone secreted by the pituitary gland?",
        "options": {
            "A": "It regulates blood sugar level.",
            "B": "It regulates the menstrual cycle.",
            "C": "It stimulates growth in all body organs.",
            "D": "It regulates metabolism for body growth."
        },
        "answer": "C",
        "exam_tag": "RRB Technicians Grade III 29-12-2024 (Shift-3)",
        "explanation": "Growth hormone promotes cell division, protein synthesis, bone elongation, and development across somatic body tissues. | Exam: RRB Technicians Grade III 29-12-2024 (Shift-3) | Slide: Page 19",
        "slidePage": 19
    },
    {
        "chapter": "ENDOCRINE SYSTEM",
        "question": "When the level of growth hormone is low, which gland releases growth hormone releasing factor and stimulates the pituitary gland to secrete growth hormone?",
        "options": {
            "A": "Pancreas",
            "B": "Hypothalamus",
            "C": "Adrenal gland",
            "D": "Thyroid gland"
        },
        "answer": "B",
        "exam_tag": "RRB Technicians Grade III 20-12-2024 (Shift-2)",
        "explanation": "The hypothalamus releases Growth Hormone-Releasing Hormone (GHRH) into the hypophyseal portal system to stimulate the anterior pituitary. | Exam: RRB Technicians Grade III 20-12-2024 (Shift-2) | Slide: Page 25",
        "slidePage": 25
    },
    {
        "chapter": "ENDOCRINE SYSTEM",
        "question": "Which hormone controls the metabolism of carbohydrates, proteins and fats in the body, and requires iodine for its synthesis?",
        "options": {
            "A": "Adrenaline hormone",
            "B": "Insulin hormone",
            "C": "Thyroxine hormone",
            "D": "Testosterone hormone"
        },
        "answer": "C",
        "exam_tag": "RRB Technicians Grade III 26-12-2024 (Shift-2)",
        "explanation": "Thyroxine, secreted by the thyroid gland, regulates basal metabolic rate (BMR) of carbohydrates, proteins, and fats, and strictly requires dietary iodine. | Exam: RRB Technicians Grade III 26-12-2024 (Shift-2) | Slide: Page 34",
        "slidePage": 34
    },
    {
        "chapter": "ENDOCRINE SYSTEM",
        "question": "Which of the following statements is/are correct regarding the adrenaline hormone?\n(i) The heart beats faster\n(ii) The breathing rate increases\n(iii) Blood pressure decreases",
        "options": {
            "A": "(i) and (iii) only",
            "B": "(i) and (ii) only",
            "C": "(ii) and (iii) only",
            "D": "(i), (ii) and (iii)"
        },
        "answer": "B",
        "exam_tag": "RRB Technicians Grade III 27-12-2024 (Shift-1)",
        "explanation": "Adrenaline increases heart rate and respiratory rate to prepare the body for emergency 'fight or flight', and increases (not decreases) blood pressure. Thus, only (i) and (ii) are correct. | Exam: RRB Technicians Grade III 27-12-2024 (Shift-1) | Slide: Page 35",
        "slidePage": 35
    },
    {
        "chapter": "ENDOCRINE SYSTEM",
        "question": "Which hormone prepares the body of a squirrel to fight or run away?",
        "options": {
            "A": "Thyroxine",
            "B": "Testosterone",
            "C": "Estrogen",
            "D": "Adrenaline"
        },
        "answer": "D",
        "exam_tag": "RRB Technicians Grade III 26-12-2024 (Shift-2)",
        "explanation": "Adrenaline (epinephrine), secreted by the adrenal medulla, triggers the sympathetic 'fight or flight' response in animals faced with danger. | Exam: RRB Technicians Grade III 26-12-2024 (Shift-2) | Slide: Page 44",
        "slidePage": 44
    },
    {
        "chapter": "ENDOCRINE SYSTEM",
        "question": "Which hormone helps in the development of female reproductive organs and regulates the menstrual cycle?",
        "options": {
            "A": "Testosterone",
            "B": "Thyroxine",
            "C": "Adrenaline",
            "D": "Oestrogen"
        },
        "answer": "D",
        "exam_tag": "RRB Technicians Grade III 23-12-2024 (Shift-3)",
        "explanation": "Estrogen (oestrogen), secreted by the ovaries, stimulates development of female secondary sexual characteristics and regulates the menstrual cycle. | Exam: RRB Technicians Grade III 23-12-2024 (Shift-3) | Slide: Page 61",
        "slidePage": 61
    },
    {
        "chapter": "ENDOCRINE SYSTEM",
        "question": "Match the hormones with their respective functions:\n1. Thyroxine - a. Control of metabolism of fats, proteins and carbohydrates\n2. Growth hormone - b. Control of growth and development of the body\n3. Testosterone - c. Development of male sex organs\n4. Insulin - d. Control of blood sugar level in the body",
        "options": {
            "A": "1-d, 2-a, 3-b, 4-c",
            "B": "1-b, 2-a, 3-d, 4-c",
            "C": "1-d, 2-b, 3-c, 4-a",
            "D": "1-a, 2-b, 3-c, 4-d"
        },
        "answer": "D",
        "exam_tag": "RRB Technicians Grade III 28-12-2024 (Shift-3)",
        "explanation": "Thyroxine regulates metabolism (1-a), Growth hormone regulates body growth (2-b), Testosterone drives male sex organ development (3-c), and Insulin lowers blood glucose level (4-d). | Exam: RRB Technicians Grade III 28-12-2024 (Shift-3) | Slide: Page 68",
        "slidePage": 68
    },

    # EXCRETORY SYSTEM (2)
    {
        "chapter": "EXCRETORY SYSTEM",
        "question": "Which of the following connects the kidney to the urinary bladder?",
        "options": {
            "A": "Ureter",
            "B": "Pelvis",
            "C": "Urethra",
            "D": "Penis"
        },
        "answer": "A",
        "exam_tag": "RRB Technicians Grade III 20-12-2024 (Shift-3)",
        "explanation": "A pair of ureters convey urine formed in the kidneys downward into the urinary bladder. | Exam: RRB Technicians Grade III 20-12-2024 (Shift-3) | Slide: Page 26",
        "slidePage": 26
    },
    {
        "chapter": "EXCRETORY SYSTEM",
        "question": "What is the filtration unit of the kidney?",
        "options": {
            "A": "Sperm",
            "B": "Neuron",
            "C": "Seminiferous tubule",
            "D": "Nephron"
        },
        "answer": "D",
        "exam_tag": "RRB Technicians Grade III 28-12-2024 (Shift-3)",
        "explanation": "The nephron is the structural and functional filtration unit of the kidney, containing the glomerulus and Bowman's capsule. | Exam: RRB Technicians Grade III 28-12-2024 (Shift-3) | Slide: Page 36",
        "slidePage": 36
    },

    # NERVOUS SYSTEM (5)
    {
        "chapter": "NERVOUS SYSTEM",
        "question": "Which of the following forms the central nervous system that receives and integrates information from all parts of the body?",
        "options": {
            "A": "Only brain",
            "B": "Only spinal cord",
            "C": "Only heart",
            "D": "Brain and spinal cord"
        },
        "answer": "D",
        "exam_tag": "RRB Technicians Grade III 26-12-2024 (Shift-2)",
        "explanation": "The Central Nervous System (CNS) consists of the brain and spinal cord, which process and integrate afferent sensory information. | Exam: RRB Technicians Grade III 26-12-2024 (Shift-2) | Slide: Page 7",
        "slidePage": 7
    },
    {
        "chapter": "NERVOUS SYSTEM",
        "question": "Which part of the brain is the main thinking center that receives sensory impulses (information) from various receptors?",
        "options": {
            "A": "Fore-brain",
            "B": "Hind-brain",
            "C": "Mid-brain",
            "D": "Spinal cord"
        },
        "answer": "A",
        "exam_tag": "RRB Technicians Grade III 20-12-2024 (Shift-3)",
        "explanation": "The forebrain (principally the cerebrum) is the chief thinking center responsible for voluntary control, intelligence, memory, and sensory interpretation. | Exam: RRB Technicians Grade III 20-12-2024 (Shift-3) | Slide: Page 21",
        "slidePage": 21
    },
    {
        "chapter": "NERVOUS SYSTEM",
        "question": "Which of the following actions is controlled by the medulla of the hind brain?",
        "options": {
            "A": "Riding a bicycle",
            "B": "Maintaining balance and posture",
            "C": "Salivation",
            "D": "Walking"
        },
        "answer": "C",
        "exam_tag": "RRB Technicians Grade III 26-12-2024 (Shift-3)",
        "explanation": "Involuntary autonomic reflexes like salivation, vomiting, blood pressure, and swallowing are centered in the medulla oblongata, whereas posture and balance are maintained by the cerebellum. | Exam: RRB Technicians Grade III 26-12-2024 (Shift-3) | Slide: Page 35",
        "slidePage": 35
    },
    {
        "chapter": "NERVOUS SYSTEM",
        "question": "Which of the following functions is not controlled by the medulla in the hindbrain?",
        "options": {
            "A": "Regulation of hearing",
            "B": "Blood pressure regulation",
            "C": "Salivary regulation",
            "D": "Vomiting control"
        },
        "answer": "A",
        "exam_tag": "RRB Technicians Grade III 30-12-2024 (Shift-1)",
        "explanation": "Hearing sensations are mapped to the auditory cortex in the temporal lobes of the cerebrum (forebrain), not the medulla. | Exam: RRB Technicians Grade III 30-12-2024 (Shift-1) | Slide: Page 36",
        "slidePage": 36
    },
    {
        "chapter": "NERVOUS SYSTEM",
        "question": "What is the function of gustatory receptors?",
        "options": {
            "A": "They detect light.",
            "B": "They detect taste.",
            "C": "They detect smell.",
            "D": "They detect sound."
        },
        "answer": "B",
        "exam_tag": "RRB Technicians Grade III 24-12-2024 (Shift-3)",
        "explanation": "Gustatory receptors located on the tongue detect chemical tastants (taste), while olfactory receptors in nasal cavities detect odorants (smell). | Exam: RRB Technicians Grade III 24-12-2024 (Shift-3) | Slide: Page 57",
        "slidePage": 57
    },

    # NUTRITION (11)
    {
        "chapter": "NUTRITION",
        "question": "Which of the following is not a parasitic organism?",
        "options": {
            "A": "Ticks",
            "B": "Amoeba",
            "C": "Lice",
            "D": "Cuscuta"
        },
        "answer": "B",
        "exam_tag": "RRB Technicians Grade III 27-12-2024 (Shift-3)",
        "explanation": "Amoeba is a free-living, single-celled eukaryote exhibiting holozoic nutrition, unlike ectoparasites (ticks, lice) and plant parasites (Cuscuta). | Exam: RRB Technicians Grade III 27-12-2024 (Shift-3) | Slide: Page 33",
        "slidePage": 33
    },
    {
        "chapter": "NUTRITION",
        "question": "Mushroom is a/an __________",
        "options": {
            "A": "Slime mould",
            "B": "Fungus",
            "C": "Animal",
            "D": "Plant"
        },
        "answer": "B",
        "exam_tag": "RRB JE 24.05.2019 (Shift-III)",
        "explanation": "A mushroom is the spore-bearing fruiting body of a fungus (typically Agaricus under Basidiomycetes). | Exam: RRB JE 24.05.2019 (Shift-III) | Slide: Page 37",
        "slidePage": 37
    },
    {
        "chapter": "NUTRITION",
        "question": "What type of nutrition is observed in mushrooms?",
        "options": {
            "A": "Chemotrophic",
            "B": "Saprotrophic",
            "C": "Symbiotic",
            "D": "Autotrophic"
        },
        "answer": "B",
        "exam_tag": "RRB Group-D-20/09/2022 (Shift-I)",
        "explanation": "Mushrooms lack chlorophyll and obtain nutrients by secreting digestive enzymes onto dead organic matter (saprotrophic nutrition). | Exam: RRB Group-D-20/09/2022 (Shift-I) | Slide: Page 38",
        "slidePage": 38
    },
    {
        "chapter": "NUTRITION",
        "question": "Which of the following organisms is commonly called bread mould?",
        "options": {
            "A": "Planaria",
            "B": "Yeast",
            "C": "Spirogyra",
            "D": "Rhizopus"
        },
        "answer": "D",
        "exam_tag": "RRB Technicians Grade III 23-12-2024 (Shift-1)",
        "explanation": "Rhizopus stolonifer is commonly known as black bread mould, a saprophytic zygomycete fungus growing on moist bread. | Exam: RRB Technicians Grade III 23-12-2024 (Shift-1) | Slide: Page 39",
        "slidePage": 39
    },
    {
        "chapter": "NUTRITION",
        "question": "Which among the following is a saprophytic fungus?",
        "options": {
            "A": "Algae",
            "B": "Tapeworm",
            "C": "Cuscuta",
            "D": "Penicillium"
        },
        "answer": "D",
        "exam_tag": "RRB NTPC 03.03.2021 (Shift-II) Stage Ist",
        "explanation": "Penicillium is a genus of ascomycetous saprophytic fungi from which the antibiotic penicillin was discovered. | Exam: RRB NTPC 03.03.2021 (Shift-II) Stage Ist | Slide: Page 41",
        "slidePage": 41
    },
    {
        "chapter": "NUTRITION",
        "question": "Which of the following is a nitrogen-fixing bacterium?",
        "options": {
            "A": "Salmonella",
            "B": "Rhizobium",
            "C": "E. coli",
            "D": "Pseudomonas"
        },
        "answer": "B",
        "exam_tag": "RRB NTPC 16.04.2016 (Shift-I) Stage Ist",
        "explanation": "Rhizobium lives symbiotically in root nodules of leguminous plants, converting atmospheric dinitrogen into assimilable ammonia. | Exam: RRB NTPC 16.04.2016 (Shift-I) Stage Ist | Slide: Page 44",
        "slidePage": 44
    },
    {
        "chapter": "NUTRITION",
        "question": "Find the correct total number of atoms in a glucose molecule.",
        "options": {
            "A": "6",
            "B": "12",
            "C": "18",
            "D": "24"
        },
        "answer": "D",
        "exam_tag": "RRB Technicians Grade III 23-12-2024 (Shift-3)",
        "explanation": "Glucose has the chemical formula C6H12O6: 6 carbon atoms + 12 hydrogen atoms + 6 oxygen atoms = 24 total atoms. | Exam: RRB Technicians Grade III 23-12-2024 (Shift-3) | Slide: Page 63",
        "slidePage": 63
    },
    {
        "chapter": "NUTRITION",
        "question": "The plasma membrane is made up of ____.",
        "options": {
            "A": "Only protein",
            "B": "Only cellulose",
            "C": "Both protein and lipid",
            "D": "Only lipid"
        },
        "answer": "C",
        "exam_tag": "RRB Technicians Grade III 27-12-2024 (Shift-2)",
        "explanation": "Biological plasma membranes are composed primarily of a lipid bilayer (phospholipids) and embedded proteins along with minor carbohydrates. | Exam: RRB Technicians Grade III 27-12-2024 (Shift-2) | Slide: Page 74",
        "slidePage": 74
    },
    {
        "chapter": "NUTRITION",
        "question": "What is the simplest form of protein?",
        "options": {
            "A": "Glucose",
            "B": "Fatty acid",
            "C": "Glycerol",
            "D": "Amino acid"
        },
        "answer": "D",
        "exam_tag": "RRB Technicians Grade III 30-12-2024 (Shift-2)",
        "explanation": "Amino acids are the fundamental building blocks (monomers) into which complex proteins are broken down during digestion. | Exam: RRB Technicians Grade III 30-12-2024 (Shift-2) | Slide: Page 76",
        "slidePage": 76
    },
    {
        "chapter": "NUTRITION",
        "question": "The disease caused by deficiency of protein in children is called?",
        "options": {
            "A": "Kwashiorkor",
            "B": "Pellagra",
            "C": "Beri-beri",
            "D": "Rickets"
        },
        "answer": "A",
        "exam_tag": "RRB JE 22.05.2019 (Shift-III)",
        "explanation": "Kwashiorkor is severe protein malnutrition in young children, marked by edema (swollen belly), thinning hair, and growth retardation. | Exam: RRB JE 22.05.2019 (Shift-III) | Slide: Page 81",
        "slidePage": 81
    },
    {
        "chapter": "NUTRITION",
        "question": "Which disease is caused by the deficiency of protein in our body?",
        "options": {
            "A": "Scurvy",
            "B": "Beri-beri",
            "C": "Rickets",
            "D": "Kwashiorkor"
        },
        "answer": "D",
        "exam_tag": "RRB NTPC 21.01.2021 (Shift-II) Stage Ist",
        "explanation": "Kwashiorkor is caused by inadequate protein intake despite adequate caloric intake, distinguishing it from general starvation (marasmus). | Exam: RRB NTPC 21.01.2021 (Shift-II) Stage Ist | Slide: Page 82",
        "slidePage": 82
    },

    # RESPIRATORY SYSTEM (1)
    {
        "chapter": "RESPIRATORY SYSTEM",
        "question": "The energy released in a fixed amount from the breakdown of ATP, which can drive endothermic reactions inside the cell, is associated with which organelle?",
        "options": {
            "A": "Chloroplast",
            "B": "Mitochondria",
            "C": "Ribosome",
            "D": "Lysosome"
        },
        "answer": "B",
        "exam_tag": "RRB Technicians Grade III 30-12-2024 (Shift-3)",
        "explanation": "Mitochondria are the primary sites of cellular respiration where ATP is produced by oxidative phosphorylation to power endothermic cellular processes. | Exam: RRB Technicians Grade III 30-12-2024 (Shift-3) | Slide: Page 27",
        "slidePage": 27
    },

    # TISSUE (2)
    {
        "chapter": "TISSUE",
        "question": "The apical meristem increases the ____ of stem and root.",
        "options": {
            "A": "Branches",
            "B": "Girth",
            "C": "Flower",
            "D": "Length"
        },
        "answer": "D",
        "exam_tag": "RRB Technicians Grade III 28-12-2024 (Shift-2)",
        "explanation": "Apical meristem is present at the growing tips of roots and stems and causes primary growth, increasing their length. Lateral meristem (cambium) increases girth. | Exam: RRB Technicians Grade III 28-12-2024 (Shift-2) | Slide: Page 19",
        "slidePage": 19
    },
    {
        "chapter": "TISSUE",
        "question": "In plants, the cells of meristematic tissue undergo a process wherein they lose their ability to divide, take up a permanent shape and size, and specialize to perform a specific function. What is this process known as?",
        "options": {
            "A": "Development",
            "B": "Regeneration",
            "C": "Differentiation",
            "D": "Proliferation"
        },
        "answer": "C",
        "exam_tag": "RRB Group-D 25-08-2022 (Shift-I)",
        "explanation": "Differentiation is the cellular process by which unspecialized meristematic cells mature into specialized permanent tissues (parenchyma, collenchyma, sclerenchyma, vascular tissues). | Exam: RRB Group-D 25-08-2022 (Shift-I) | Slide: Page 23",
        "slidePage": 23
    }
]

# Append new questions with sequential q_num
for item in missing_44:
    ch = item["chapter"]
    qs = science_data[ch]["questions"]
    max_qnum = max([q.get("q_num", 0) for q in qs] + [len(qs)])
    new_q = {
        "q_num": max_qnum + 1,
        "question": item["question"],
        "options": item["options"],
        "answer": item["answer"],
        "exam_tag": item["exam_tag"],
        "explanation": item["explanation"],
        "slidePage": item["slidePage"]
    }
    qs.append(new_q)
    science_data[ch]["total_questions"] = len(qs)

# Save updated science.json
with open("scripts/sources/science.json", "w", encoding="utf-8") as f:
    json.dump(science_data, f, indent=2, ensure_ascii=False)

print("Updated scripts/sources/science.json successfully!")
for ch_name in sorted(mapping_data.keys()):
    qs = science_data[ch_name]["questions"]
    all_have_slide = all("slidePage" in q for q in qs)
    print(f"  {ch_name:30}: {len(qs):2} questions (all have slidePage: {all_have_slide})")

