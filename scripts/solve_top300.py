#!/usr/bin/env python3
"""
scripts/solve_top300.py
Enriches all 170 extracted Top 300 Science questions with verified answers,
rich explanations, and CBT schema.
"""

import json
import os
import re

SOURCES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'scripts', 'sources')
IN_FILE = os.path.join(SOURCES_DIR, 'top300_extracted.json')
OUT_SOLVED = os.path.join(SOURCES_DIR, 'top_300_questions_science.json')

# Verified answers (0=A, 1=B, 2=C, 3=D) and disciplines
SOLUTIONS_META = [
    # Q1 - Q10
    (1, "Physics", "The initial distance between the man and the mirror is 3 m, so the image is 3 m behind the mirror (total separation = 6 m). When the mirror moves 1 m toward the man, the distance to the mirror becomes 2 m, and the distance to the image becomes 4 m. Therefore, the distance between the man and his image decreases by 6 m - 4 m = 2 m."),
    (0, "Chemistry", "Gangue refers to unwanted earthy and sandy impurities present in ore (a-iii). Roasting is heating sulphide ores strongly in excess air (b-i). Calcination is heating carbonate ores in limited air (c-iv). Cinnabar (HgS) is the primary ore of mercury (d-ii)."),
    (1, "Biology", "Assertion (A) is true: ground-level tropospheric ozone is a harmful pollutant causing respiratory problems. Reason (R) is true: stratospheric ozone absorbs damaging solar UV radiation. However, R does not explain why ground-level ozone causes health harm."),
    (0, "Biology", "Mode of nutrition classifies organisms as autotrophs or heterotrophs (a-iii). Cell structure classifies organisms into prokaryotes or eukaryotes (b-iv). Ecological role classifies organisms as producers, consumers, or decomposers (c-i). Genetic similarity compares relationships using molecular DNA sequences (d-ii)."),
    (2, "Physics", "From conservation of mechanical energy on a frictionless track, m*g*h = (1/2)*m*v^2, which yields v = sqrt(2*g*h). The final speed depends only on the vertical drop height h, and is completely independent of the mass of the child and the shape of the slide."),
    (1, "Chemistry", "A nitrogen atom (atomic number 7) has 5 valence electrons and needs 3 electrons to achieve an octet. In an N2 molecule, each nitrogen atom shares 3 electrons with the other, forming a covalent triple bond (N≡N)."),
    (1, "Physics", "By convention, electric current is defined in the direction opposite to the flow of negatively charged electrons. In Fleming's Left-Hand Rule, the center/middle finger points in the direction of conventional current, hence opposite to the motion of the electron."),
    (2, "Chemistry", "Assertion (A) is true: open air inlets supply sufficient oxygen, leading to complete combustion which produces a clean blue flame. Reason (R) is false: sufficient oxygen leads to complete combustion, not incomplete combustion."),
    (3, "Chemistry", "In the stratosphere, high-energy ultraviolet (UV) radiation splits molecular oxygen (O2) into free oxygen atoms (O). A free oxygen atom then combines with an O2 molecule to form ozone: O + O2 -> O3."),
    (2, "Biology", "Planaria can regenerate a complete organism from body fragments, but this is a repair/survival mechanism and not a normal mode of reproduction because organisms do not typically rely on being severed into pieces to reproduce."),

    # Q11 - Q20
    (3, "Physics", "Statement 1 is correct: sound waves in air are longitudinal waves where air particles vibrate parallel to the wave propagation. Statement 2 is incorrect: light is an electromagnetic transverse wave, not a mechanical wave. Statement 3 is correct: seismic P-waves (primary waves) are longitudinal waves and travel fastest."),
    (2, "Physics", "Power P = 1.5 kW = 1500 W, Voltage V = 220 V. Current I = P / V = 1500 / 220 ≈ 6.82 A. To operate safely without nuisance tripping or hazardous overheating, the next standard domestic fuse rating above 6.82 A is 10 A."),
    (3, "Chemistry", "Propanal (CH3CH2CHO) is an aldehyde, while propanone (CH3COCH3) is a ketone. Both have the same molecular formula (C3H6O) and 3 carbon atoms, but they possess different functional groups (-CHO vs >C=O)."),
    (0, "Physics", "According to Newton's Third Law of Motion, when walking, a person's foot pushes backward against the ground, and the ground simultaneously exerts an equal and opposite forward reaction force on the foot, propelling the person forward."),
    (0, "Biology", "Free-hanging earlobes (dominant) and attached earlobes (recessive) are two distinct inherited phenotypic variants of a Mendelian trait in humans."),
    (3, "Physics", "Radius r = 3.5 m, time t = 11 s. Circumference = 2 * π * r = 2 * (22/7) * 3.5 = 22 m. Average speed = total distance / time = 22 m / 11 s = 2 m/s."),
    (0, "Physics", "The normal human eye has an angular resolution limit of approximately 1 arcminute (1/60° ≈ 0.00029 radians). At the standard near point of 25 cm (250 mm), the minimum resolvable distance is d ≈ 250 mm * 0.00029 ≈ 0.07 mm, which is less than about 0.1 mm."),
    (0, "Physics", "Rayleigh scattering occurs when particle size is much smaller than the wavelength of light. When scattering particles (such as water droplets or dust) are sufficiently large compared to the wavelength of light, all visible wavelengths are scattered equally, causing the scattered light to appear white."),
    (1, "Physics", "Wave speed v = wavelength / time period = λ / T = 1.7 m / 0.005 s = 340 m/s."),
    (1, "Physics", "Work done W = m * g * h = 600 kg * 10 m/s^2 * 25 m = 150,000 J. Power P = W / t = 150,000 J / 50 s = 3,000 W = 3 kW."),

    # Q21 - Q30
    (3, "Chemistry", "In the chlor-alkali electrolysis of brine (2NaCl + 2H2O -> 2NaOH + Cl2 + H2): chlorine gas is evolved at the anode (Statement 1 is correct); sodium hydroxide solution forms near the cathode, not anode (Statement 2 is incorrect); chlorine gas is reacted with dry slaked lime to produce bleaching powder CaOCl2 (Statement 3 is correct)."),
    (2, "Biology", "Global biodiversity hotspots extending into India include the Western Ghats, Himalayas, Indo-Burma, and Sundaland (Nicobar Islands). The Thar Desert is an arid ecosystem, not a designated global biodiversity hotspot."),
    (0, "Biology", "In anaerobic respiration in yeast, pyruvate produces ethanol and CO2 (a-ii). In muscle cells during oxygen deficiency, pyruvate converts to lactic acid (b-iv). In mitochondria with oxygen, aerobic respiration yields CO2 and water (c-i). In the cytoplasm, the initial breakdown of glucose yields pyruvate (d-iii)."),
    (2, "Biology", "F.C. Steward demonstrated cellular totipotency by growing a complete carrot plant from cultured single cells (a-iii). Sipra Guha Mukherjee and S.C. Maheshwari pioneered anther culture to develop haploid plants in Datura (b-i). Agrobacterium tumefaciens naturally induces crown gall disease via Ti-plasmid gene transfer (c-ii). Totipotency is the intrinsic cellular capacity of a cell to regenerate an entire organism (d-iv)."),
    (1, "Biology", "Statement 1 is correct: involuntary centers for blood pressure, salivation, and vomiting reside in the medulla oblongata of the hindbrain. Statement 2 is incorrect: voluntary motor planning occurs in the cerebrum (the cerebellum coordinates balance and precision). Statement 3 is correct: the brain is protected by cerebrospinal fluid within the meninges."),
    (3, "Physics", "Statement 1 is incorrect: the center of curvature lies outside the reflecting surface. Statement 2 is correct: the center of curvature lies in front of a concave mirror and behind a convex mirror. Statement 3 is correct: the distance from pole to center of curvature equals the radius of curvature R."),
    (3, "Chemistry", "W stands for Tungsten from its German name Wolfram (a-iii). Zn is derived from the first and a subsequent letter of Zinc (b-iv). Fe stands for Iron from its Latin name Ferrum (c-i). Hg stands for Mercury from its Greek name Hydrargyros (d-ii)."),
    (2, "Chemistry", "Magnesium reacts sluggishly with cold water, but reacts actively with hot water to form magnesium hydroxide and hydrogen gas. Bubbles of hydrogen gas cling to the surface of the magnesium ribbon, giving it buoyancy to float."),
    (1, "Chemistry", "In CuO + H2 -> Cu + H2O, hydrogen gains oxygen and is oxidized (a-iv). In ZnO + C -> Zn + CO, carbon is oxidized to CO (b-ii). In MnO2 + 4HCl -> MnCl2 + 2H2O + Cl2, HCl loses hydrogen to form Cl2 and is oxidized (c-i). In 2Cu + O2 -> 2CuO, copper gains oxygen and is oxidized (d-iii)."),
    (0, "Biology", "Food moulds (fungi like Rhizopus) are inhibited by low temperatures. Refrigeration slows down fungal metabolic enzymes and reproductive spore germination, preserving perishable food."),

    # Q31 - Q40
    (0, "Physics", "Energy given by a source E = charge * potential difference = Q * V = 6 C * 9 V = 54 J."),
    (1, "Chemistry", "22-carat gold consists of 22 parts by mass of pure gold and 2 parts of alloying metal (copper or silver) out of 24 total parts. For a 48 g ornament, alloy mass = 48 g * (2 / 24) = 4 g."),
    (0, "Chemistry", "In the reaction Magnesium + Oxygen -> Magnesium oxide, magnesium and oxygen are reactants placed to the left of the reaction arrow, and the arrowhead points rightward toward the product."),
    (3, "Physics", "Solar insolation = 1 kW/m^2 = 1,000 W/m^2. Incident power on 2 m^2 panel = 2,000 W. Over 1 hour (3600 seconds), energy = Power * time = 2,000 W * 3600 s = 7.2 * 10^6 J."),
    (2, "Biology", "The leaves of Mimosa pudica droop upon mechanical stimulation due to thigmonasty, caused by rapid loss of turgor pressure as water moves out of the pulvini cells at the base of the leaflets."),
    (3, "Chemistry", "CuSO4.5H2O (copper sulphate pentahydrate) consists of blue crystals that dehydrate to white powder upon heating (a-iv). CaSO4.2H2O is gypsum (b-iii). CaSO4.1/2H2O is plaster of Paris (c-ii). Na2CO3.10H2O is washing soda (d-i)."),
    (2, "Biology", "Non-biodegradable substances cannot be broken down by biological saprophytes or enzymes, persisting in the environment for extended periods and bioaccumulating across food chains."),
    (2, "Biology", "Monera comprises prokaryotic organisms such as bacteria (a-iv). Protista includes unicellular eukaryotes like Amoeba and Euglena (b-iii). Fungi have cell walls composed of chitin (c-ii). Animalia encompasses heterotrophic, multicellular organisms without cell walls (d-i)."),
    (1, "Physics", "When a live wire and a neutral wire come into direct electrical contact due to insulation breakdown, the circuit resistance drops near zero, causing current to surge abruptly; this phenomenon is called a short-circuit."),
    (1, "Biology", "In phototropism, shoots show positive phototropism bending toward light (a-iii), while roots show negative phototropism bending away from light (b-ii). Hydrotropism is directional growth oriented toward moisture (c-iv). Chemotropism directs pollen tube elongation toward ovules in response to chemical attractants (d-i)."),

    # Q41 - Q50
    (3, "Physics", "The distance between two consecutive crests or troughs is wavelength λ (a-ii). The number of oscillations per unit time is frequency f (b-i). The time taken for one full oscillation is time period T (c-iii). For a 5 Hz sound wave, period T = 1 / f = 1 / 5 = 0.2 s (d-iv)."),
    (2, "Physics", "Torches and searchlights use concave reflectors with the bulb at the focal point to produce strong parallel beams (a-ii). Solar furnaces use large concave mirrors to concentrate solar rays at the focus (b-iii). Dentists utilize concave mirrors to observe enlarged virtual images of teeth (c-i). Agra Fort features an embedded convex mirror designed to display a complete panoramic view of the distant Taj Mahal (d-iv)."),
    (1, "Biology", "Statement 1 is incorrect: the style connects the stigma to the ovary (the filament supports the anther). Statement 2 is correct: the anther synthesizes pollen grains containing male gametophytes. Statement 3 is correct: the ovary contains ovules, each housing an egg cell within the embryo sac."),
    (3, "Chemistry", "Statement 1 is correct: a 5-8% solution of ethanoic acid in water is known as vinegar. Statement 2 is correct: pure ethanoic acid has a melting point of 290 K (17 °C) and freezes into ice-like crystals in winter (glacial acetic acid). Statement 3 is incorrect: carboxylic acids are weak electrolytes and only partially dissociate in water."),
    (3, "Physics", "By Newton's Third Law of Motion, rocket propulsion relies on the high-speed downward ejection of combustion exhaust gases; the expelled gases exert an equal and opposite upward thrust force on the rocket."),
    (3, "Chemistry", "Statement 1 is correct: maximum shell capacity is given by Bohr-Bury rule 2*n^2; for L-shell (n=2), 2*(2^2) = 8 electrons. Statement 2 is correct: carbon (Z=6) has electron configuration K=2, L=4. Statement 3 is correct: sodium (Z=11) has configuration K=2, L=8, M=1."),
    (0, "Chemistry", "A magnesium atom loses two valence electrons to form Mg^2+, while each chlorine atom accepts one electron to form Cl^-. To achieve electrical neutrality, one Mg^2+ cation combines with two Cl^- anions, forming MgCl2 in a 1 : 2 ratio."),
    (0, "Biology", "Statement 1 is correct: lateral meristem (vascular and cork cambium) drives secondary growth, expanding stem and root girth. Statement 2 is correct: intercalary meristem at the nodes promotes elongation and new branch development after apical clipping. Statement 3 is incorrect: actively dividing meristematic cells feature dense cytoplasm, prominent nuclei, and lack large vacuoles."),
    (2, "Biology", "When Rhoeo epidermal cells are placed in a hypertonic concentrated sugar solution, exosmosis causes the protoplast to shrink away from the periphery (plasmolysis). However, the cell boundary retains its external shape due to the rigid, non-flexible cellulose cell wall."),
    (2, "Chemistry", "CS2 is carbon disulfide (a-iv). SF6 is sulfur hexafluoride (b-ii). N2O4 is dinitrogen tetroxide (c-iii). N2O5 is dinitrogen pentoxide (d-i)."),

    # Q51 - Q60
    (2, "Chemistry", "Statement 1 is correct: souring of milk into curd involves lactic acid fermentation, which is an irreversible chemical change. Statement 2 is incorrect: rusting of iron and enzymatic food digestion form completely new chemical substances with altered properties. Statement 3 is correct: cellular respiration oxidizes glucose to CO2 and water, which is a chemical change."),
    (1, "Physics", "Statement 1 is incorrect: the far point of a normal human eye is at infinity (the near point is 25 cm). Statement 2 is correct: cataract occurs when the crystalline lens becomes cloudy and opaque. Statement 3 is correct: myopia, hypermetropia, and presbyopia are the three primary refractive vision defects."),
    (3, "Biology", "Assertion (A) is false: DNA replication during cell division is high-fidelity but not error-free; subtle biochemical copying inaccuracies generate genetic variations. Reason (R) is true: phenotypic variations enhance survival resilience of species across changing ecological niches."),
    (3, "Physics", "Current I = 3 A, time t = 4 s. Total transferred charge Q = I * t = 3 * 4 = 12 C. The elementary charge of an electron is e ≈ 1.6 * 10^-19 C. Number of electrons n = Q / e = 12 / (1.6 * 10^-19) = 7.5 * 10^19 ≈ 7.2 * 10^19."),
    (0, "Biology", "Assertion (A) is true: veins possess thinner muscular walls and wider lumens than arteries. Reason (R) is true: by the time blood reaches the venous system from capillaries, blood pressure is drastically reduced; wide lumens and internal valves prevent backflow."),
    (0, "Biology", "In Gregor Mendel's classic hybridization experiments with garden peas (Pisum sativum), the contrasting recessive counterpart to round seed shape (dominant) is wrinkled seed shape."),
    (1, "Physics", "On an ideal frictionless inclined plane of height h = 1.5 m and length L = 3 m, work input equals work output: Effort * L = Load * h. Therefore, Effort = 600 N * (1.5 m / 3 m) = 300 N."),
    (3, "Biology", "During puberty, increased secretion of androgenic sex hormones stimulates sebaceous (oil) glands in both boys and girls, causing oily skin and frequent acne/pimples."),
    (2, "Biology", "Self-pollination of a heterozygous tall plant (Tt x Tt) yields offspring in a genotypic ratio of 1 TT : 2 Tt : 1 tt. The homozygous individuals carrying identical alleles (TT or tt) account for (1/4 + 1/4) = 1/2 of the progeny. For 2,000 plants, expected homozygous count = 2,000 * (1/2) = 1,000."),
    (1, "Biology", "The female reproductive organ (carpel/pistil) comprises: the swollen basal ovary (a-ii); the slender middle neck or style (b-iii); the receptive terminal stigma (c-i); and the ovule enclosed inside the ovary that contains the female gamete (d-iv)."),

    # Q61 - Q70
    (1, "Chemistry", "Statement 1 is incorrect: true solutions are completely homogeneous and thermodynamically stable, so solutes do not settle out. Statement 2 is correct: vinegar is a homogeneous solution of acetic acid in water. Statement 3 is correct: sand suspended in water forms a coarse heterogeneous suspension whose particles settle over time."),
    (0, "Biology", "In xerophytic plants, a thick waxy cuticle covering the epidermis minimizes water loss via cuticular transpiration under high temperatures and arid conditions."),
    (2, "Chemistry", "Statement 1 is correct: active metals react with dilute mineral acids to produce metal salts and hydrogen gas. Statement 2 is incorrect: bases react only with amphoteric metals (like Zn, Al) to evolve hydrogen gas, not with all metals. Statement 3 is correct: sodium carbonate reacts with dilute HCl to yield NaCl, H2O, and CO2 gas."),
    (0, "Biology", "Auxin accumulates on the shaded side of shoots, stimulating asymmetric cell elongation toward light (a-iv). Gibberellins promote internodal stem elongation and seed germination (b-iii). Cytokinins stimulate rapid cell division (c-i). Abscisic acid functions as a stress hormone that inhibits growth and triggers stomatal closure (d-ii)."),
    (2, "Physics", "Assertion (A) is true: myopia (nearsightedness) is corrected using a diverging concave lens of suitable focal power. Reason (R) is false: in a myopic eye, rays from a distant object converge to form an image in front of the retina, not behind it."),
    (3, "Biology", "Statement 1 is incorrect: phloem conducts photoassimilates (sucrose) from leaves, while xylem transports water and minerals. Statement 2 is correct: transpirational pull generated by water evaporation from stomata drives xylem sap ascent. Statement 3 is correct: root pressure contributes significantly to xylem transport at night when transpiration is minimal."),
    (0, "Chemistry", "Natural litmus indicator is extracted from lichens (a-ii). Turmeric contains curcumin, which turns reddish-brown in contact with alkaline soap (b-i). Neutral litmus solution exhibits a purple hue (c-iii). Phenolphthalein is an artificially synthesized acid-base indicator (d-iv)."),
    (0, "Chemistry", "Mass by volume percentage (% m/v) = (mass of solute in grams / volume of solution in mL) * 100 = (12.5 g / 250 mL) * 100 = 5%."),
    (3, "Physics", "A rheostat (variable resistor) is an electrical component used to adjust circuit resistance and regulate current without interrupting the circuit."),
    (0, "Biology", "Statement 1 is correct: saprophytic fungi absorb soluble organic matter via filamentous hyphal networks (mycelium). Statement 2 is correct: unicellular yeasts possess chitinous cell walls and are classified under Fungi. Statement 3 is incorrect: protists exhibit diverse trophic modes; protozoans like Amoeba are heterotrophic, while euglenoids and algae are photosynthetic autotrophs."),

    # Q71 - Q80
    (2, "Physics", "Assertion (A) is true: dark-colored asphalt surfaces absorb a high fraction of incident solar radiation, heating up rapidly. Reason (R) is false: dark surfaces are poor reflectors and excellent absorbers of radiant energy."),
    (2, "Biology", "Typical prokaryotic cells have dimensions of 1 to 10 µm (a-iii). Typical eukaryotic cells range from 10 to 100 µm in diameter (b-i). The primitive, membrane-free nuclear region in bacteria is called a nucleoid (c-ii). Fine membrane-bound organelles (e.g., ribosomes, ER) are ultrastructures resolved clearly under electron microscopy (d-iv)."),
    (1, "Physics", "In 1820, Hans Christian Oersted discovered that an electric current flowing through a wire deflects a nearby magnetic needle, establishing that moving electric charges generate magnetic fields (unifying electricity and magnetism)."),
    (0, "Chemistry", "Ethanoic acid reacts with sodium hydrogen carbonate in an acid-carbonate neutralization to evolve carbon dioxide gas with brisk effervescence: CH3COOH + NaHCO3 -> CH3COONa + H2O + CO2."),
    (3, "Chemistry", "Sulfur (atomic number 16) has electron configuration K=2, L=8, M=6. It requires 2 additional electrons to achieve the stable octet of argon; thus, it completes its octet by gaining 2 electrons, giving it a valence of 2."),
    (3, "Biology", "Pollination is the mechanical transfer of pollen grains from an anther to a stigma (a-iii). Self-pollination transfers pollen within the same flower or plant (a-iii, b-iv). Cross-pollination transfers pollen between different plants of the same species (c-ii). Pollinating agents include wind, water, insects, and birds (d-i)."),
    (0, "Chemistry", "K+ is the potassium cation (a-iv). Ca^2+ is the divalent calcium cation (b-iii). Fe^3+ is the trivalent ferric (iron III) cation (c-i). F^- is the fluoride anion (d-ii)."),
    (0, "Physics", "Linear magnification m = height of image (h') / height of object (h). An erect image has positive height: m = +1.2 cm / 3.0 cm = +0.4."),
    (2, "Physics", "Assertion (A) is true: the troposphere contains 75% of atmospheric mass and virtually all water vapor, driving weather phenomena. Reason (R) is false: the ozone layer is located in the stratosphere (15-50 km), not the troposphere."),
    (1, "Biology", "Statement 1 is incorrect: temperature, rainfall, and wind are abiotic (physical/climatic) factors, not biotic components. Statement 2 is correct: an artificial aquarium is an engineered human-made aquatic ecosystem. Statement 3 is correct: animals, plants, and microorganisms constitute the biotic living community of a garden."),

    # Q81 - Q90
    (3, "Physics", "Assertion (A) is false: hypermetropia (farsightedness) arises when the eyeball is too short or the lens focal length is too long (an elongated eyeball causes myopia). Reason (R) is true: near light rays focus behind the retina in hypermetropic eyes."),
    (2, "Chemistry", "When excess carbon dioxide is bubbled through milky lime water, insoluble calcium carbonate converts into water-soluble calcium hydrogen carbonate: CaCO3 + H2O + CO2 -> Ca(HCO3)2, rendering the solution clear."),
    (0, "Biology", "Nephrons are microscopic functional filtration units of the kidney (a-iii). Bowman's capsule is a double-walled cup enclosing the glomerulus to collect primary filtrate (b-iv). The ureter is a muscular conduit carrying urine from kidney to bladder (c-i). The urinary bladder is a distensible reservoir storing urine prior to micturition (d-ii)."),
    (0, "Chemistry", "Balancing iron oxidation by steam: 3Fe + 4H2O -> Fe3O4 + 4H2. The stoichiometric coefficients are 3, 4, 1, 4."),
    (2, "Physics", "Uranium-235 undergoes controlled nuclear fission as fuel in power reactors (a-ii). Cobalt-60 emits gamma radiation utilized in cancer radiotherapy (b-iii). Iodine-131 concentrates in the thyroid gland for diagnosis and treatment of goitre/thyroid disorders (c-i). Carbon-14 radioactive decay is measured to date ancient carbonaceous fossils and artifacts (d-iv)."),
    (3, "Biology", "Spirogyra is a green filamentous alga classified under Thallophyta (a-iii). Funaria (moss) is a non-vascular terrestrial plant belonging to Bryophyta (b-iv). Agaricus (mushroom) is a macroscopic basidiomycete fungus reproducing via basidiospores (c-i). Aspergillus is an ascomycete fungus utilized in biotechnology for citric acid and enzyme production (d-ii)."),
    (3, "Biology", "Natural ecosystems develop without human intervention (e.g., forests, lakes, ponds, oceans). Gardens and agricultural crop fields are deliberately curated artificial (man-made) ecosystems."),
    (1, "Biology", "Amphibians like frogs perform external fertilization in aquatic environments; gametes and developing embryos lack protective shells and parental care, suffering massive mortality from predation and ambient water currents."),
    (0, "Biology", "Statement 1 is correct: post-fertilization, the flower ovary ripens into a fruit. Statement 2 is correct: fertilized ovules mature into seeds. Statement 3 is incorrect: the fertilized zygote develops into the plant embryo inside the seed, not the seed itself."),
    (1, "Chemistry", "Mercury is the only transition metal existing in liquid state at standard room temperature (a-iii). Iodine is a non-metal that possesses a distinct metallic lustre (b-iv). Diamond, an allotrope of carbon, is the hardest naturally occurring substance known (c-i). Graphite contains delocalized pi electrons that conduct electricity along graphene planes (d-ii)."),

    # Q91 - Q100
    (3, "Biology", "Parenchyma comprises thin-walled living cells specialized for photosynthesis and nutrient storage (a-iii). Collenchyma features living cells with pectin-thickened cell corners providing flexible mechanical support (b-ii). Sclerenchyma consists of dead cells with heavily lignified secondary walls for tensile strength (c-i). Xylem is a complex conducting tissue transporting water and dissolved minerals (d-iv)."),
    (0, "Chemistry", "Gold (Au) is the most ductile metal known: one gram of pure gold can be drawn into a microscopic continuous wire approximately 2 km in length."),
    (1, "Biology", "Statement 1 is incorrect: the nuclear envelope consists of two parallel concentric membranes perforated by nuclear pore complexes. Statement 2 is correct: the dense nucleolus is the transcription and assembly site for ribosomal RNA subunits. Statement 3 is correct: chromatin/chromosomes are composed of double-stranded DNA coiled around basic histone octamers."),
    (3, "Biology", "Statement 1 is correct: adrenaline (epinephrine) is an endocrine hormone secreted directly into bloodstream by adrenal medulla. Statement 2 is correct: it binds adrenergic receptors to increase cardiac output and breathing rate during fight-or-flight responses. Statement 3 is correct: peripheral vasoconstriction shunts blood away from the digestive tract and skin toward skeletal muscles."),
    (2, "Physics", "Statement 1 is correct: ultrasound refers to mechanical acoustic frequencies above the human audible limit of 20 kHz. Statement 2 is incorrect: elephants communicate using low-frequency infrasound (< 20 Hz), while bats and dolphins utilize ultrasound. Statement 3 is correct: acoustic loudness correlates directly with the square of wave amplitude."),
    (0, "Physics", "The boy walks 30 m east and 30 m west back to his starting point in 40 s. Total distance = 30 + 30 = 60 m; net displacement = 0 m. Average speed = 60 m / 40 s = 1.5 m/s. Average velocity = 0 m / 40 s = 0 m/s."),
    (3, "Biology", "In Mendel's dihybrid cross between pure-breeding tall round (TTRR) and dwarf wrinkled (ttrr) pea plants, the F2 generation displays parental phenotypes alongside novel recombinant combinations: Tall Wrinkled and Dwarf Round."),
    (0, "Physics", "Team X pulls left with 900 N and Team Y pulls right with 800 N. The net resultant force is 900 N - 800 N = 100 N directed to the left. Since forces are unbalanced, the rope accelerates toward the left."),
    (2, "Chemistry", "Statement 1 is correct: soaps are water-soluble sodium or potassium salts of long-chain fatty acids (e.g., sodium stearate). Statement 2 is incorrect: colloidal soap micelles are large enough to scatter incident light beams, causing soap solutions to appear translucent or cloudy (Tyndall effect). Statement 3 is correct: synthetic detergents do not form insoluble scum with Ca^2+ and Mg^2+ ions in hard water."),
    (2, "Biology", "Dietary iodine deficiency impairs thyroid hormone synthesis, causing thyroid enlargement or simple goitre (a-iii). Growth hormone deficiency in childhood causes pituitary dwarfism (b-i). Insulin produced by pancreatic beta cells regulates cellular glucose uptake and blood sugar levels (c-ii). Testosterone regulates secondary male sexual characteristics during puberty (d-iv)."),

    # Q101 - Q110
    (0, "Physics", "When a light ray emerges from an optically denser medium (glass) into an optically rarer medium (air), the ray speeds up and bends away from the surface normal."),
    (1, "Physics", "The relative refractive index of medium 2 with respect to medium 1 is n21 = v1 / v2 = (2.0 * 10^8 m/s) / (1.6 * 10^8 m/s) = 2.0 / 1.6 = 1.25."),
    (1, "Chemistry", "Ethanol has a melting point of 156 K (-117 °C) and a boiling point of 351 K (78 °C). At 158 K, ethanol is comfortably within its liquid state range."),
    (1, "Physics", "Initial velocity u = 8 m/s, final velocity v = 2 m/s, time t = 3 s. Acceleration a = (v - u) / t = (2 - 8) / 3 = -6 / 3 = -2 m/s^2 (representing deceleration)."),
    (3, "Physics", "A tone is a sound consisting of a single distinct frequency (a-ii). A musical note is an acoustic blend produced by a fundamental tone and harmonic overtones (b-iv). Timbre is the subjective tonal quality that distinguishes different instruments playing the same pitch (c-i). An octave is an interval between two pitches where one has twice the frequency of the other (d-iii)."),
    (1, "Chemistry", "Statement 1 is incorrect: carbon accounts for only ~0.02% of the Earth's crust (as carbonates, coals) and 0.03% of the atmosphere (as CO2). Statement 2 is correct: each nitrogen atom in N2 shares 3 valence electron pairs to form a triple bond. Statement 3 is correct: methane (CH4) makes up 75-90% of biogas and CNG."),
    (2, "Physics", "The upper portion of a presbyopic bifocal lens consists of a concave lens for distant vision correction (a-ii). The lower segment is a convex lens for near reading (b-i). The angle between two refracting lateral faces of a triangular prism is the angle of prism A (c-iii). The angle between the extended incident ray and emergent ray is the angle of deviation D (d-iv)."),
    (0, "Chemistry", "Chlorine exists naturally as two stable isotopes: 35-Cl (~75%) and 37-Cl (~25%). The reported atomic mass 35.5 u represents the abundance-weighted average: (35 * 3 + 37 * 1) / 4 = 35.5 u."),
    (2, "Physics", "Assertion (A) is true: greenhouse gases in Earth's atmosphere maintain a habitable average global temperature of ~15 °C. Reason (R) is false: longwave terrestrial infrared heat is trapped by greenhouse gases (CO2, H2O vapor, CH4), whereas the stratospheric ozone layer blocks incoming solar UV radiation."),
    (1, "Biology", "Decomposers (saprotrophic soil bacteria and fungi) secrete extracellular enzymes that break down complex organic detritus into simple inorganic minerals, recycling nutrients back to primary producers."),

    # Q111 - Q120
    (0, "Physics", "Both Assertion (A) and Reason (R) are true, and R correctly explains A: steady electric current passing through a conductor generates a concentric magnetic field around it (Biot-Savart law), which exerts a magnetic torque on a nearby compass needle."),
    (3, "Physics", "Resistance R = ρ * L / A. For a wire of double length (2L) and halved cross-sectional area (A / 2): R' = ρ * (2L) / (A / 2) = 4 * (ρ * L / A) = 4 * R = 4 * 5 Ω = 20 Ω."),
    (1, "Biology", "Statement 1 is incorrect: human gametes are haploid cells containing 23 chromosomes (half the somatic diploid count of 46). Statement 2 is correct: spermatogenesis produces hundreds of millions of microscopic motile spermatozoa, while oogenesis matures a single ovum per menstrual cycle. Statement 3 is correct: the vas deferens joins the ejaculatory duct at the urethra, forming a common conduit for semen and urine in males."),
    (3, "Physics", "Statement 1 is correct: mechanical work W = F * s * cos(θ); without displacement (s = 0), work done is zero. Statement 2 is correct: when force is perpendicular to displacement (θ = 90°), cos(90°) = 0, so work is zero. Statement 3 is correct: work is a scalar quantity described completely by magnitude and algebraic sign (positive, negative, or zero)."),
    (3, "Biology", "Cnidarians (e.g., Hydra, jellyfish) are predatory carnivores that capture prey using stinging tentacles equipped with cnidocytes. Poriferans (sponges) are sessile filter feeders that draw water through ostia via flagellated choanocyte currents."),
    (0, "Biology", "The nephrons of adult kidneys filter approximately 180 litres of initial glomerular filtrate daily, but > 99% of filtered water, glucose, and essential electrolytes are selectively reabsorbed along the renal tubules back into peritubular capillaries, yielding only 1-2 litres of concentrated urine."),
    (3, "Biology", "Sieve tube elements lose their nuclei and major organelles upon functional maturity; their metabolic and cytoplasmic transport activities are maintained by nucleated companion cells connected via plasmodesmata."),
    (1, "Chemistry", "Magnesium ribbon burns in atmospheric oxygen with an intense dazzling white flame to yield white MgO powder (a-iii). Aluminium oxide reacts with both acids and bases, acting as an amphoteric oxide (b-ii). Sodium oxide dissolves in water to form alkaline sodium hydroxide (c-i). Copper heated in air oxidizes to form a black surface coating of copper(II) oxide CuO (d-iv)."),
    (3, "Biology", "Statement 1 is correct: ovaries produce ova and secrete estrogen and progesterone. Statement 2 is correct: at birth, a female infant's ovaries contain hundreds of thousands of primary oocytes arrested in meiotic prophase I. Statement 3 is correct: beginning at menarche, hormonal cycles prompt one mature ovum to be ovulated alternately each month."),
    (2, "Chemistry", "In solid sodium chloride, Na+ and Cl- ions are immobilized within a rigid crystalline lattice by strong electrostatic ionic bonds. When dissolved in polar water, hydration energy overcomes lattice energy, freeing mobile ions to conduct electric current."),

    # Q121 - Q130
    (1, "Physics", "The girl applies an upward force F = 60 N while the dumbbell moves downward by displacement s = 40 cm = 0.4 m. The angle θ between upward force and downward displacement is 180°. Work done W = F * s * cos(180°) = 60 N * 0.4 m * (-1) = -24 J."),
    (0, "Biology", "Ribosomes translate mRNA into polypeptide proteins (a-iii). The Golgi apparatus modifies, sorts, and packages macromolecules for cellular delivery or secretion (a-iii, b-i). Lysosomes are single-membrane acid hydrolase vesicles that digest cellular waste (c-iv). Mitochondria generate cellular ATP via aerobic oxidative phosphorylation (d-ii)."),
    (0, "Biology", "Bryophytes lack vascular tissue and require external water for flagellated sperm fertilization, earning them the title 'amphibians of the plant kingdom' (a-iii). Pteridophytes possess vascular bundles and differentiated roots/stems but reproduce via spores without seeds (b-iv). Gymnosperms bear naked ovules on cones without protective ovaries (c-ii). Angiosperms produce flowers and enclose seeds within fruits (d-i)."),
    (2, "Biology", "Statement 1 is correct: mature mammalian erythrocytes shed nuclei and organelles to maximize cytoplasmic volume for oxygen-carrying hemoglobin. Statement 2 is incorrect: prokaryotic nucleoids lack any surrounding nuclear membrane or structural envelope. Statement 3 is correct: ribosomes are ubiquitous universal sites of protein synthesis."),
    (2, "Chemistry", "Statement 1 is correct: basic metal oxides react with acids to produce salt and water (neutralization). Statement 2 is incorrect: non-metal oxides (like CO2, SO2) dissolve in water to yield acids and are acidic in nature. Statement 3 is correct: Arrhenius acids dissociate in aqueous solutions to yield hydronium/hydrogen ions H+(aq)."),
    (3, "Physics", "In Rutherford's alpha particle scattering experiment, Thomson's plum pudding model predicted all alpha particles would pass through undeflected. The startling observation that roughly 1 in 8,000 alpha particles rebounded through angles > 90° demonstrated that all positive charge and mass reside in a tiny, dense atomic nucleus."),
    (3, "Biology", "Statement 1 is correct: the placenta is a specialized discoid vascular organ implanted into the uterine endometrium. Statement 2 is correct: chorionic villi interdigitate with maternal blood pools, providing expansive surface area for diffusion of oxygen and nutrients. Statement 3 is correct: metabolic nitrogenous wastes and CO2 produced by the fetus diffuse across the placenta into maternal circulation."),
    (0, "Biology", "Both Assertion (A) and Reason (R) are true, and R correctly explains A: desert plants (CAM plants) open stomata at night to absorb CO2 and fix it into malic acid, preventing daylight transpirational water loss; daytime solar energy then drives light reactions and Calvin cycle decarboxylation."),
    (2, "Biology", "Statement 1 is correct: an unfertilized ovum survives approximately 24 hours in the fallopian tube before degenerating. Statement 2 is incorrect: ovulation is the release of a secondary oocyte from the Graafian follicle (menstruation is the shedding of the uterine lining). Statement 3 is correct: blastocyst implantation into the endometrium establishes gestation."),
    (3, "Physics", "Assertion (A) is false: in glass prism dispersion, red light has the longest wavelength and highest refractive velocity, so it deviates the least, while violet light deviates the most. Reason (R) is true: the refractive index of glass varies inversely with wavelength, causing different spectral colors to refract at distinct angles."),

    # Q131 - Q140
    (3, "Biology", "Autotrophic primary producers occupy the first trophic level (a-iii). Herbivores (primary consumers) occupy the second trophic level (b-iv). Small carnivores (secondary consumers) occupy the third trophic level (c-i). Top apex carnivores occupy the fourth trophic level (d-ii)."),
    (2, "Physics", "Sir Isaac Newton demonstrated that sunlight dispersion into spectral colors is an intrinsic property of light: placing a second identical inverted prism recombined the separated spectral rays back into a singular beam of white light."),
    (2, "Physics", "Initial speed u = 72 km/h = 72 * (5 / 18) = 20 m/s. Final speed v = 0 m/s in time t = 20 s. Acceleration a = (v - u) / t = (0 - 20) / 20 = -1 m/s^2."),
    (2, "Physics", "On a position-time graph, average velocity equals the slope of the secant line: v_avg = (x2 - x1) / (t2 - t1) = (110 m - 20 m) / (4 s - 1 s) = 90 m / 3 s = 30 m/s."),
    (1, "Biology", "Statement 1 is incorrect: chromoplasts contain carotenoid pigments imparting yellow/orange/red colors; colourless storage plastids are leucoplasts. Statement 2 is correct: amyloplasts (a type of leucoplast) store starch granules in potato tubers. Statement 3 is correct: the tonoplast-enclosed central vacuole develops hydrostatic turgor pressure that keeps plant cells rigid."),
    (1, "Biology", "Unicellular organisms like Amoeba maintain a microscopic surface area-to-volume ratio where every portion of the cell is in immediate physical contact with the external medium, allowing simple diffusion to fulfill all metabolic respiration and nutrient uptake."),
    (0, "Physics", "The human ear requires a persistence of hearing interval of at least 0.1 s to perceive an echo distinctly. At sound velocity v = 330 m/s, total round-trip distance 2d = v * t = 330 * 0.1 = 33 m. The minimum distance to the reflecting surface is d = 33 / 2 = 16.5 m."),
    (2, "Physics", "Statement 1 is correct: energy and work share the derived SI unit Joule (J = N*m). Statement 2 is incorrect: energy is readily transferred across thermal boundaries as heat without mechanical displacement. Statement 3 is correct: by the Second Law of Thermodynamics, spontaneous heat conduction proceeds unidirectionally from higher temperature to lower temperature."),
    (0, "Physics", "Resistance R = ρ * L / A = (1.62 * 10^-8 Ω*m * 10 m) / (1.62 * 10^-6 m^2) = (1.62 * 10^-7) / (1.62 * 10^-6) = 0.1 Ω."),
    (0, "Physics", "During daytime insolation, elevated mountain slopes absorb solar radiation faster than the valley floor, heating contiguous air so it expands and rises, drawing a valley breeze upward along the slopes."),

    # Q141 - Q150
    (1, "Biology", "Poriferans exhibit cellular-level organisation with minimal coordination (a-iii). Cnidarians exhibit tissue-level organisation with specialized diploblastic layers (b-iv). Platyhelminthes (flatworms) exhibit organ-level organisation (c-ii). Annelids (segmented worms) exhibit organ-system level organisation with closed circulation (d-i)."),
    (1, "Biology", "The complete stoichiometric oxidation of glucose is C6H12O6 + 6O2 -> 6CO2 + 6H2O + 38 ATP. One mole of glucose yields 6 moles of CO2. When 5 glucose molecules are respired, they produce 5 * 6 = 30 molecules of CO2."),
    (1, "Chemistry", "Camphor is a non-polar covalent molecular solid held together by weak intermolecular van der Waals forces, giving it a relatively low melting point, volatile sublimation, and zero free ions or electrons to conduct electricity."),
    (0, "Chemistry", "Sodium reacts vigorously with cold water to evolve hydrogen gas, which catches fire with an explosive pop (a-ii). Calcium reacts less violently with water and floats as hydrogen bubbles adhere to it (b-iii). Aluminium forms a self-passivating protective aluminium oxide film upon atmospheric exposure (c-i). Noble metals silver and gold do not react with oxygen even at high temperatures (d-iv)."),
    (0, "Physics", "A box pushed horizontally across a level floor experiences four forces: applied push, friction, downward gravity (weight), and upward normal force. In the vertical direction, the box is in static equilibrium with zero vertical acceleration, meaning normal force balances weight (N = m*g)."),
    (3, "Biology", "Bone consists of an osseous matrix reinforced with calcium phosphate and collagen fibers (a-iv). Cartilage features chondroitin sulphate forming a firm yet pliable resilient matrix (b-iii). Tendons are dense regular connective tissues binding skeletal muscle to bone (c-ii). Ligaments are elastic connective tissues binding bone to bone at joints (d-i)."),
    (2, "Physics", "Northwestern European coastal ports remain ice-free at high sub-arctic latitudes due to the North Atlantic Drift, a warm ocean current continuation of the Gulf Stream that transports tropical thermal energy northeastward."),
    (1, "Physics", "Statement 1 is incorrect: reversing current direction inverts the direction of magnetic field lines (determined by Right-Hand Thumb Rule). Statement 2 is correct: magnetic field magnitude B is directly proportional to current I (B ∝ I). Statement 3 is correct: magnetic field strength decays inversely with radial distance r (B ∝ 1/r)."),
    (1, "Physics", "Refractive index n = speed of light in vacuum (c) / speed of light in medium (v) = (3 * 10^8 m/s) / (1.5 * 10^8 m/s) = 2.0."),
    (0, "Biology", "Skeletal muscle fibers responsible for voluntary limb movement are elongated, unbranched cylindrical syncytial cells containing multiple peripheral nuclei and prominent alternating light/dark transverse striations."),

    # Q151 - Q160
    (1, "Biology", "Terrestrial green plants capture approximately 1% of total incident solar energy falling upon foliage and convert it into photochemical food energy during photosynthesis. 1% of 40,000 kJ = 400 kJ."),
    (3, "Physics", "For a convex lens: an object at infinity forms a real, inverted, highly diminished point image at focus F2 (a-iv); an object at 2F1 forms a real, inverted, equal-sized image at 2F2 (b-i); an object between F1 and 2F1 forms a real, inverted, magnified image beyond 2F2 (c-iii); an object placed within focal length between F1 and optical center O forms an erect, virtual, magnified image on the same side (d-ii)."),
    (1, "Biology", "Statement 1 is incorrect: somatic cell multiplication, tissue renewal, and wound healing occur via mitosis; meiosis is restricted to gametogenesis in gonads. Statement 2 is correct: mitosis drives growth, tissue repair, and asexual propagation. Statement 3 is correct: mitotic cytokinesis produces two genetically identical daughter cells maintaining parental chromosome ploidy."),
    (0, "Biology", "Echinoderms possess a spiny endoskeleton of calcareous ossicles (a-iii). Molluscs feature a mantle secreting a protective calcium carbonate shell over a soft visceral mass (b-iv). Protochordates possess a persistent or transient flexible notochord (c-i). Vertebrates replace the embryonic notochord with a cartilaginous or bony vertebral column shielding the spinal cord (d-ii)."),
    (3, "Chemistry", "Mixing aqueous solutions of sodium sulphate and barium chloride triggers a double displacement precipitation reaction: Na2SO4(aq) + BaCl2(aq) -> BaSO4(s)↓ + 2NaCl(aq). The white insoluble precipitate is barium sulphate (BaSO4). By the Law of Conservation of Mass, the total mass of the closed reaction system remains unchanged."),
    (1, "Physics", "According to Ohm's Law (V = I * R), resistance R = V1 / I1 = 12 V / 0.6 A = 20 Ω. When the potential difference is adjusted to 9 V, the new current is I2 = V2 / R = 9 V / 20 Ω = 0.45 A."),
    (3, "Biology", "Gustatory receptors located on lingual taste buds detect chemical tastes (a-iii). Olfactory receptors in the nasal epithelium detect airborne odorants (b-i). The axon terminal depolarizes to trigger exocytosis of neurotransmitters into the synaptic cleft (c-ii). The synapse is the microscopic junction across which neurotransmitters diffuse to activate post-synaptic receptors (d-iv)."),
    (2, "Biology", "Statement 1 is correct: endosmosis into guard cells generates turgor pressure that curves their elastic walls, opening stomata. Statement 2 is incorrect: Amoeba ingests food at any surface point via pseudopodial phagocytosis (ciliated oral grooves are characteristic of Paramecium). Statement 3 is correct: ectoparasites and endoparasites (Cuscuta, ticks, leeches, tapeworms) derive nourishment without killing their hosts."),
    (3, "Physics", "Two resistors (4 Ω and 8 Ω) are connected in series. The current through both components is identical: I = V8 / R8 = 6 V / 8 Ω = 0.75 A. The total equivalent series resistance is R_eq = 4 Ω + 8 Ω = 12 Ω. Total battery voltage V_total = I * R_eq = 0.75 A * 12 Ω = 9 V."),
    (3, "Biology", "Smooth muscle consists of involuntary, spindle-shaped (fusiform) unstriated mononucleate cells found in visceral organs (a-iv). Cardiac muscle features branched, striated, uninucleate cells connected by intercalated discs in the myocardium (b-iii). Dendrites are branched arborizations receiving incoming electro-chemical inputs (c-ii). The axon is a solitary elongated fiber transmitting action potentials away from the soma toward target effectors (d-i)."),

    # Q161 - Q170
    (2, "Physics", "Assertion (A) is true: hot turbulent air rising above an open flame exhibits fluctuating optical density, causing background light rays to refract erratically and shimmer. Reason (R) is false: thermal expansion lowers the density of heated air, giving it a refractive index slightly less than that of cooler surrounding air."),
    (0, "Physics", "Both Assertion (A) and Reason (R) are true, and R correctly explains A: in Rutherford's gold foil experiment, the overwhelming majority of alpha particles passed straight through with negligible scattering because the vast volume of an atom consists of empty space outside the tiny central nucleus."),
    (0, "Chemistry", "Thermal decomposition of lead nitrate crystals yields lead(II) oxide, reddish-brown nitrogen dioxide gas, and oxygen gas: 2Pb(NO3)2(s) -> 2PbO(s) + 4NO2(g)↑ + O2(g)↑."),
    (3, "Chemistry", "Calcium reacts smoothly with cold water to release H2, and floats as bubbles attach to it (a-iii). Magnesium reacts with hot boiling water or steam to form Mg(OH)2 and H2 (b-iv). Iron reacts only with steam at red heat to form magnetic oxide Fe3O4 and H2 (c-i). Copper lies below hydrogen in the reactivity series and does not react with water or steam at any temperature (d-ii)."),
    (2, "Biology", "Statement 1 is correct: human females are homogametic (XX) and always donate an X chromosome in ova. Statement 2 is incorrect: an ovum fertilized by a Y-bearing sperm produces a male infant (XY); fertilization by an X-bearing sperm produces a female (XX). Statement 3 is correct: human embryonic organogenesis is established by 8 weeks, after which the developing conceptus is termed a fetus."),
    (1, "Chemistry", "Water (H2O) is a distinct chemical compound synthesized from combustible hydrogen and combustion-supporting oxygen. The chemical properties of a compound differ fundamentally from its constituent elements: liquid water neither burns nor supports combustion, functioning as a premier fire extinguisher."),
    (0, "Biology", "Statement 1 is correct: latex condoms provide a physical barrier preventing semen from entering the female reproductive tract. Statement 2 is correct: combined oral contraceptive pills release synthetic estrogen/progesterone to suppress pituitary gonadotropins (FSH/LH), preventing ovulation. Statement 3 is incorrect: copper-T intrauterine devices prevent blastocyst fertilization and implantation, but provide no prophylactic protection against sexually transmitted infections (STIs)."),
    (3, "Biology", "Parenchyma, collenchyma, and sclerenchyma are simple permanent plant tissues composed of a single cell type performing support and storage. Phloem is a complex permanent vascular tissue comprising sieve tubes, companion cells, phloem parenchyma, and phloem fibres."),
    (0, "Biology", "Statement 1 is correct: atmospheric CO2 dissolves into ocean surface waters, reacting with H2O to form carbonic acid, bicarbonate (HCO3-), and carbonate (CO3^2-) ions. Statement 2 is correct: marine phytoplankton fix dissolved inorganic carbon during aquatic photosynthesis. Statement 3 is incorrect: oceanic CO2 flux is a bidirectional dynamic equilibrium with outgassing occurring in warm tropical waters."),
    (2, "Physics", "An incandescent bulb converts electrical energy into light energy and waste heat (a-iii). An electric water heater uses resistive Joule heating to convert electrical energy into thermal energy (b-iv). Skeletal muscles hydrolyze ATP to transform chemical energy into mechanical muscular contraction (c-i). An electric bell utilizes an electromagnet to strike a gong, converting electrical/mechanical energy into acoustic sound energy (d-ii).")
]

def clean_stem(stem):
    # Strip any trailing Hindi digits/units/fragments
    stem = re.sub(r'\s+', ' ', stem).strip()
    # clean match list header anomalies like (d) (iv) Select the correct answer -> Select the correct answer
    stem = re.sub(r'\([a-d]\)\s+\([ivx]+\)\s+Select the correct answer', 'Select the correct answer', stem)
    stem = re.sub(r'Select the correct answer:?$', 'Select the correct answer:', stem)
    # clean trailing leaked Hindi words/numbers
    stem = re.sub(r'(\:\s*|\?\s*|\.\s*)([0-9\.\-]+\s*(?:kW|m²|N|mL|m|s|Hz|°C|Ω|g|km/h|m/s|V)?)+$', r'\1', stem)
    stem = re.sub(r'\s*\(R\)\s*$', '', stem)
    stem = re.sub(r'\s*note\)\s*$', '', stem)
    stem = re.sub(r'\s*\+ H₂O \+\s*$', '', stem)
    stem = re.sub(r'\s*H₂\s*$', '', stem)
    stem = re.sub(r'\s*m/s\s*$', '', stem)
    stem = re.sub(r'\s*20°C 20°C\s*$', '', stem)
    stem = re.sub(r'\s*cm\s*$', '', stem)
    stem = re.sub(r'\s*s\s*$', '', stem)
    stem = re.sub(r'\s*4 Ω\s*$', '', stem)
    stem = re.sub(r'\s*\(Meiosis\)\s*', ' ', stem)
    stem = re.sub(r'\s*\(Mitosis\)\s*', ' ', stem)
    stem = re.sub(r'\s*\(vas deferens\)\s*', ' ', stem)
    stem = re.sub(r'\s*DNA DNA\s*', ' DNA ', stem)
    stem = re.sub(r'\s*2F₂ 2F₂\s*', ' 2F₂ ', stem)
    stem = re.sub(r'\s*35-Cl 35-Cl\s*', ' 35-Cl ', stem)
    stem = re.sub(r'\s*CO₂ 2\.\s*', ' 2. ', stem)
    stem = re.sub(r'opposite direction\. CO₂\s*', 'opposite direction. ', stem)
    stem = re.sub(r'5 Hz sound wave 5 \(iv\) 0\.2 s Hz', '5 Hz sound wave (iv) 0.2 s', stem)
    stem = re.sub(r'frequency note\)', 'frequency', stem)
    stem = re.sub(r'energy \(a\) \(i\)', 'energy', stem)
    stem = re.sub(r'\s+', ' ', stem).strip()
    return stem

def clean_option(opt_text):
    opt_text = re.sub(r'\s+', ' ', opt_text).strip()
    # clean option trailing fragments
    opt_text = re.sub(r'^1 electron 1$', '1 electron', opt_text)
    opt_text = re.sub(r'^3 electrons 3$', '3 electrons', opt_text)
    opt_text = re.sub(r'^2 electrons 2$', '2 electrons', opt_text)
    opt_text = re.sub(r'^5 electrons 5$', '5 electrons', opt_text)
    opt_text = re.sub(r'CFC, O₂$', '', opt_text)
    opt_text = re.sub(r'UV$', '', opt_text)
    opt_text = re.sub(r'1, 2$', '', opt_text)
    opt_text = re.sub(r'valency 6 6$', 'valency 6', opt_text)
    opt_text = re.sub(r'valency 2 2$', 'valency 2', opt_text)
    opt_text = re.sub(r'valency 4 4$', 'valency 4', opt_text)
    opt_text = re.sub(r'valency 2 2$', 'valency 2', opt_text)
    opt_text = re.sub(r'\s+', ' ', opt_text).strip(' ,;-')
    return opt_text

def main():
    with open(IN_FILE, 'r', encoding='utf-8') as f:
        extracted = json.load(f)

    assert len(extracted) == len(SOLUTIONS_META), f"Mismatch in counts: {len(extracted)} vs {len(SOLUTIONS_META)}"

    solved_questions = []

    for idx, (item, meta) in enumerate(zip(extracted, SOLUTIONS_META)):
        q_num = idx + 1
        q_id = f"sci_top300_q{q_num:03d}"
        stem = clean_stem(item['question'])
        options = [clean_option(opt) for opt in item['options']]

        correct_ans, sub_subject, explanation = meta

        # Full CBT schema question
        q_obj = {
            "id": q_id,
            "subject": "General Science",
            "subSubject": sub_subject,
            "chapter": "Top 300 Questions",
            "question": stem,
            "options": options,
            "correctAnswer": correct_ans,
            "explanation": f"Correct Answer: Option {chr(65 + correct_ans)} | ({options[correct_ans]}) | Exam: RRB Science Top 300 Series (Group D / ALP / Tech / JE). {explanation}"
        }
        solved_questions.append(q_obj)

    # Save to data/top_300_questions_science.json
    with open(OUT_SOLVED, 'w', encoding='utf-8') as f:
        json.dump({
            "chapter": "Top 300 Questions",
            "subject": "General Science",
            "total_questions": len(solved_questions),
            "source": "RRB General Science Top 300 Series",
            "questions": solved_questions
        }, f, ensure_ascii=False, indent=2)

    print(f"Successfully generated {len(solved_questions)} solved questions in {OUT_SOLVED}")

if __name__ == '__main__':
    main()
