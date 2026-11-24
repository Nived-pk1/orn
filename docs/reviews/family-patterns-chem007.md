# CHEM-007 report for the family patterns (step 8.5e, E4)

Inputs: ORN-real-data-2026-11-24.orn.json (622 species with a structure) + FAMILY-PATTERNS.orn.json merged by ID. Made by tests/integration/family-patterns-report.test.ts (ORN_E4=1) with the app's own membership code on real RDKit. No chemistry judgement, no data edits.

## Counts
- families with a pattern: 124; patterns RDKit refused to parse: 0
- (a) listed but not matching: 2 compounds in 1 families
- (b) matching but not listed (families without an approximate pattern): 474 compounds in 57 families
- families the Studio's own check would NOT try for a species (it tries the first 100 class SMARTS by ID and says "not compared" for the rest): 24: cls_lactones, cls_metal-acetylides, cls_methyl-ketones, cls_monosaccharides, cls_n-nitrosoamines, cls_nitriles, cls_nitro-compounds, cls_nitroarenes, cls_osazones, cls_oximes, cls_peptides, cls_phenols, cls_phenylhydrazones, cls_polyhalogen-compounds, cls_polysaccharides, cls_quaternary-ammonium-salts, cls_semicarbazones, cls_silver-carboxylates, cls_sulfonamides, cls_sulfonic-acids, cls_sulfonyl-chlorides, cls_terminal-alkynes, cls_vicinal-dihalides, cls_vicinal-diols

## (c) Patterns RDKit refused to parse
  - none

## Per family

### cls_2-4-dnp-hydrazones | 2,4-Dinitrophenylhydrazones
SMARTS: [CX3]=[NX2][NX3H1]c1ccc([NX3+](=O)[OX1-])cc1[NX3+](=O)[OX1-]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_acetals | Acetals and ketals
SMARTS: [CX4;H2,H1,H0;!$(C(O)(O)O)]([OX2;!$(O-C=O)][#6])[OX2;!$(O-C=O)][#6]
- listed in the family: 5; match the pattern: 10
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_acid-anhydrides | Acid anhydrides
SMARTS: [CX3](=O)[OX2][CX3](=O)
- listed in the family: 4; match the pattern: 4
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_acidic-amino-acids | Acidic amino acids (approximate pattern: part b not made)
SMARTS: [NX3;!$(N-[CX3]=[O,S,N])][CX4][CX3](=O)[OX2H1].[CX3](=O)[OX2H1]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_acids-with-alpha-h | Carboxylic acids with α-hydrogen
SMARTS: [CX3](=O)([OX2H1])[CX4;!H0]
- listed in the family: 2; match the pattern: 40
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (38):
  - spc_2-bromopropanoic-acid | 2-Bromopropanoic acid | CC(Br)C(=O)O
  - spc_2-chloropropanoic-acid | 2-Chloropropanoic acid | CC(Cl)C(O)=O
  - spc_3-aminobutanoic-acid | 3-Aminobutanoic acid | CC(N)CC(=O)O
  - spc_3-benzoylpropanoic-acid | 4-Oxo-4-phenylbutanoic acid | OC(=O)CCC(=O)c1ccccc1
  - spc_3-bromo-3-phenylpropanoic-acid | 3-Bromo-3-phenylpropanoic acid | OC(=O)CC(Br)c1ccccc1
  - spc_3-chloropropanoic-acid | 3-Chloropropanoic acid | ClCCC(O)=O
  - spc_3-hydroxybutanoic-acid | 3-Hydroxybutanoic acid | CC(O)CC(O)=O
  - spc_4-aminobutanoic-acid | 4-Aminobutanoic acid | NCCCC(=O)O
  - spc_4-chlorobutanoic-acid | 4-Chlorobutanoic acid | ClCCCC(O)=O
  - spc_4-hydroxybutanoic-acid | 4-Hydroxybutanoic acid | OCCCC(O)=O
  - spc_5-aminopentanoic-acid | 5-Aminopentanoic acid | NCCCCC(=O)O
  - spc_acetoacetic-acid | 3-Oxobutanoic acid (acetoacetic acid) | CC(=O)CC(O)=O
  - spc_adipic-acid | Hexanedioic acid (adipic acid) | OC(=O)CCCCC(O)=O
  - spc_alanine | 2-Aminopropanoic acid (alanine) | CC(N)C(O)=O
  - spc_aspartic-acid | Aspartic acid | N[C@@H](CC(=O)O)C(=O)O
  - spc_chloroethanoic-acid | Chloroethanoic acid | OC(=O)CCl
  - spc_cyanoethanoic-acid | Cyanoethanoic acid | N#CCC(O)=O
  - spc_d-tartaric-acid | (2S,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@H](O)C(=O)O
  - spc_dichloroethanoic-acid | Dichloroethanoic acid | OC(=O)C(Cl)Cl
  - spc_gluconic-acid | Gluconic acid | C([C@H]([C@H]([C@@H]([C@H](C(=O)O)O)O)O)O)O
  - spc_glutaric-acid | Pentanedioic acid (glutaric acid) | OC(=O)CCCC(O)=O
  - spc_glycine | Aminoethanoic acid (glycine) | NCC(O)=O
  - spc_glycinium-chloride | Glycine hydrochloride | [NH3+]CC(=O)O.[Cl-]
  - spc_glycolic-acid | Hydroxyethanoic acid (glycolic acid) | OCC(O)=O
  - spc_glycylalanine | Glycylalanine | NCC(=O)NC(C)C(=O)O
  - spc_l-tartaric-acid | (2R,3R)-2,3-Dihydroxybutanedioic acid | O[C@@H](C(=O)O)[C@@H](O)C(=O)O
  - spc_lactic-acid | 2-Hydroxypropanoic acid | CC(O)C(=O)O
  - spc_lysine | Lysine | NCCCC[C@H](N)C(=O)O
  - spc_malonic-acid | Propanedioic acid (malonic acid) | OC(=O)CC(O)=O
  - spc_meso-tartaric-acid | (2R,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@@H](O)C(=O)O
  - spc_methylmalonic-acid | 2-Methylpropanedioic acid | CC(C(=O)O)C(=O)O
  - spc_n-acetylglycine | N-Acetylglycine | CC(=O)NCC(=O)O
  - spc_palmitic-acid | Palmitic acid | CCCCCCCCCCCCCCCC(=O)O
  - spc_pimelic-acid | Heptanedioic acid (pimelic acid) | OC(=O)CCCCCC(O)=O
  - spc_r-lactic-acid | (R)-2-Hydroxypropanoic acid | C[C@@H](O)C(=O)O
  - spc_s-lactic-acid | (S)-2-Hydroxypropanoic acid | C[C@H](O)C(=O)O
  - spc_saccharic-acid | Saccharic acid | OC(=O)C(O)C(O)C(O)C(O)C(=O)O
  - spc_succinic-acid | Butanedioic acid | OC(=O)CCC(=O)O
### cls_acyl-halides | Acyl halides
SMARTS: [CX3;H1,$(C[#6])](=O)[F,Cl,Br,I]
- listed in the family: 3; match the pattern: 3
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_acyloins | Acyloins (α-hydroxy ketones)
SMARTS: [#6][CX3](=O)[CX4][OX2H]
- listed in the family: 1; match the pattern: 3
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (2):
  - spc_d-fructose | D-Fructose (open chain) | C([C@H]([C@H]([C@@H](C(=O)CO)O)O)O)O
  - spc_glucosone-phenylhydrazone | Glucosone phenylhydrazone | OCC(O)C(O)C(O)C(=O)C=NNc1ccccc1
### cls_alcohols | Alcohols
SMARTS: [CX4][OX2H]
- listed in the family: 2; match the pattern: 77
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (32):
  - spc_3-hydroxy-2-methylbutanal | 3-Hydroxy-2-methylbutanal | CC(O)C(C)C=O
  - spc_3-hydroxy-2-methylpentanal | 3-Hydroxy-2-methylpentanal | CCC(O)C(C)C=O
  - spc_3-hydroxybutanal | 3-Hydroxybutanal | CC(O)CC=O
  - spc_3-hydroxybutanoic-acid | 3-Hydroxybutanoic acid | CC(O)CC(O)=O
  - spc_3-hydroxypentanal | 3-Hydroxypentanal | CCC(O)CC=O
  - spc_4-hydroxy-4-methylpentan-2-one | 4-Hydroxy-4-methylpentan-2-one (diacetone alcohol) | CC(=O)CC(C)(C)O
  - spc_4-hydroxybutanoic-acid | 4-Hydroxybutanoic acid | OCCCC(O)=O
  - spc_benzilic-acid | Benzilic acid | OC(=O)C(O)(c1ccccc1)c1ccccc1
  - spc_benzoin | Benzoin | O=C(c1ccccc1)C(O)c1ccccc1
  - spc_d-glyceraldehyde | (R)-2,3-Dihydroxypropanal | OC[C@@H](O)C=O
  - spc_d-tartaric-acid | (2S,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@H](O)C(=O)O
  - spc_ethanal-bisulfite-adduct | Ethanal sodium bisulfite adduct | CC(O)S(=O)(=O)[O-].[Na+]
  - spc_ethyl-3-hydroxybutanoate | Ethyl 3-hydroxybutanoate | CCOC(=O)CC(C)O
  - spc_gluconic-acid | Gluconic acid | C([C@H]([C@H]([C@@H]([C@H](C(=O)O)O)O)O)O)O
  - spc_glucosazone | Glucosazone | OCC(O)C(O)C(O)C(=NNc1ccccc1)C=NNc1ccccc1
  - spc_glucose-oxime | Glucose oxime | ON=CC(O)C(O)C(O)C(O)CO
  - spc_glucose-phenylhydrazone | Glucose phenylhydrazone | OCC(O)C(O)C(O)C(O)C=NNc1ccccc1
  - spc_glucosone-phenylhydrazone | Glucosone phenylhydrazone | OCC(O)C(O)C(O)C(=O)C=NNc1ccccc1
  - spc_glycolic-acid | Hydroxyethanoic acid (glycolic acid) | OCC(O)=O
  - spc_l-glyceraldehyde | (S)-2,3-Dihydroxypropanal | OC[C@H](O)C=O
  - spc_l-tartaric-acid | (2R,3R)-2,3-Dihydroxybutanedioic acid | O[C@@H](C(=O)O)[C@@H](O)C(=O)O
  - spc_lactic-acid | 2-Hydroxypropanoic acid | CC(O)C(=O)O
  - spc_lactose | Lactose | C([C@@H]1[C@@H]([C@@H]([C@H]([C@@H](O1)O[C@@H]2[C@H](O[C@H]([C@@H]([C@H]2O)O)O)CO)O)O)O)O
  - spc_maltose | Maltose | C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O[C@@H]2[C@H](O[C@@H]([C@@H]([C@H]2O)O)O)CO)O)O)O)O
  - spc_meso-tartaric-acid | (2R,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@@H](O)C(=O)O
  - spc_methyl-alpha-d-glucopyranoside | Methyl α-D-glucopyranoside | OC[C@H]1O[C@H](OC)[C@H](O)[C@@H](O)[C@@H]1O
  - spc_methyl-beta-d-glucopyranoside | Methyl β-D-glucopyranoside | OC[C@H]1O[C@@H](OC)[C@H](O)[C@@H](O)[C@@H]1O
  - spc_r-lactic-acid | (R)-2-Hydroxypropanoic acid | C[C@@H](O)C(=O)O
  - spc_s-lactic-acid | (S)-2-Hydroxypropanoic acid | C[C@H](O)C(=O)O
  - spc_saccharic-acid | Saccharic acid | OC(=O)C(O)C(O)C(O)C(O)C(=O)O
  - spc_sodium-glycolate | Sodium glycolate | [Na+].OCC(=O)[O-]
  - spc_sucrose | Sucrose | C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O[C@]2([C@H]([C@@H]([C@H](O2)CO)O)O)CO)O)O)O)O
### cls_alcohols-primary | Primary alcohols
SMARTS: [CX4;H2,H3][OX2H]
- listed in the family: 12; match the pattern: 39
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (27):
  - spc_2-aminopropan-1-ol | 2-Aminopropan-1-ol | CC(N)CO
  - spc_2-deoxy-d-ribose | 2-Deoxy-D-ribose | OC[C@H]1O[C@@H](O)C[C@@H]1O
  - spc_4-hydroxybutanoic-acid | 4-Hydroxybutanoic acid | OCCCC(O)=O
  - spc_alpha-d-glucopyranose | α-D-Glucopyranose | OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O
  - spc_beta-d-glucopyranose | β-D-Glucopyranose | OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O
  - spc_butane-1-3-diol | Butane-1,3-diol | CC(O)CCO
  - spc_d-fructose | D-Fructose (open chain) | C([C@H]([C@H]([C@@H](C(=O)CO)O)O)O)O
  - spc_d-galactose | D-Galactose | C([C@H]([C@@H]([C@@H]([C@H](C=O)O)O)O)O)O
  - spc_d-glucose | D-Glucose (open chain) | C([C@H]([C@H]([C@@H]([C@H](C=O)O)O)O)O)O
  - spc_d-glyceraldehyde | (R)-2,3-Dihydroxypropanal | OC[C@@H](O)C=O
  - spc_d-mannose | D-Mannose | C([C@H]([C@H]([C@@H]([C@@H](C=O)O)O)O)O)O
  - spc_d-ribose | D-Ribose | OC[C@H]1O[C@@H](O)[C@H](O)[C@@H]1O
  - spc_gluconic-acid | Gluconic acid | C([C@H]([C@H]([C@@H]([C@H](C(=O)O)O)O)O)O)O
  - spc_glucosazone | Glucosazone | OCC(O)C(O)C(O)C(=NNc1ccccc1)C=NNc1ccccc1
  - spc_glucose-cyanohydrin | Glucose cyanohydrin | N#CC(O)C(O)C(O)C(O)C(O)CO
  - spc_glucose-oxime | Glucose oxime | ON=CC(O)C(O)C(O)C(O)CO
  - spc_glucose-phenylhydrazone | Glucose phenylhydrazone | OCC(O)C(O)C(O)C(O)C=NNc1ccccc1
  - spc_glucosone-phenylhydrazone | Glucosone phenylhydrazone | OCC(O)C(O)C(O)C(=O)C=NNc1ccccc1
  - spc_glycolic-acid | Hydroxyethanoic acid (glycolic acid) | OCC(O)=O
  - spc_l-glyceraldehyde | (S)-2,3-Dihydroxypropanal | OC[C@H](O)C=O
  - spc_lactose | Lactose | C([C@@H]1[C@@H]([C@@H]([C@H]([C@@H](O1)O[C@@H]2[C@H](O[C@H]([C@@H]([C@H]2O)O)O)CO)O)O)O)O
  - spc_maltose | Maltose | C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O[C@@H]2[C@H](O[C@@H]([C@@H]([C@H]2O)O)O)CO)O)O)O)O
  - spc_methyl-alpha-d-glucopyranoside | Methyl α-D-glucopyranoside | OC[C@H]1O[C@H](OC)[C@H](O)[C@@H](O)[C@@H]1O
  - spc_methyl-beta-d-glucopyranoside | Methyl β-D-glucopyranoside | OC[C@H]1O[C@@H](OC)[C@H](O)[C@@H](O)[C@@H]1O
  - spc_sodium-glycolate | Sodium glycolate | [Na+].OCC(=O)[O-]
  - spc_sorbitol | Hexane-1,2,3,4,5,6-hexol | OCC(O)C(O)C(O)C(O)CO
  - spc_sucrose | Sucrose | C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O[C@]2([C@H]([C@@H]([C@H](O2)CO)O)O)CO)O)O)O)O
### cls_alcohols-secondary | Secondary alcohols
SMARTS: [CX4;H1][OX2H]
- listed in the family: 15; match the pattern: 54
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (39):
  - spc_2-deoxy-d-ribose | 2-Deoxy-D-ribose | OC[C@H]1O[C@@H](O)C[C@@H]1O
  - spc_3-hydroxy-2-methylbutanal | 3-Hydroxy-2-methylbutanal | CC(O)C(C)C=O
  - spc_3-hydroxy-2-methylpentanal | 3-Hydroxy-2-methylpentanal | CCC(O)C(C)C=O
  - spc_3-hydroxybutanal | 3-Hydroxybutanal | CC(O)CC=O
  - spc_3-hydroxybutanoic-acid | 3-Hydroxybutanoic acid | CC(O)CC(O)=O
  - spc_3-hydroxypentanal | 3-Hydroxypentanal | CCC(O)CC=O
  - spc_alpha-d-glucopyranose | α-D-Glucopyranose | OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O
  - spc_benzoin | Benzoin | O=C(c1ccccc1)C(O)c1ccccc1
  - spc_beta-d-glucopyranose | β-D-Glucopyranose | OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O
  - spc_butane-1-3-diol | Butane-1,3-diol | CC(O)CCO
  - spc_d-fructose | D-Fructose (open chain) | C([C@H]([C@H]([C@@H](C(=O)CO)O)O)O)O
  - spc_d-galactose | D-Galactose | C([C@H]([C@@H]([C@@H]([C@H](C=O)O)O)O)O)O
  - spc_d-glucose | D-Glucose (open chain) | C([C@H]([C@H]([C@@H]([C@H](C=O)O)O)O)O)O
  - spc_d-glyceraldehyde | (R)-2,3-Dihydroxypropanal | OC[C@@H](O)C=O
  - spc_d-mannose | D-Mannose | C([C@H]([C@H]([C@@H]([C@@H](C=O)O)O)O)O)O
  - spc_d-ribose | D-Ribose | OC[C@H]1O[C@@H](O)[C@H](O)[C@@H]1O
  - spc_d-tartaric-acid | (2S,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@H](O)C(=O)O
  - spc_ethanal-bisulfite-adduct | Ethanal sodium bisulfite adduct | CC(O)S(=O)(=O)[O-].[Na+]
  - spc_ethanal-cyanohydrin | Ethanal cyanohydrin (2-hydroxypropanenitrile) | CC(O)C#N
  - spc_ethyl-3-hydroxybutanoate | Ethyl 3-hydroxybutanoate | CCOC(=O)CC(C)O
  - spc_gluconic-acid | Gluconic acid | C([C@H]([C@H]([C@@H]([C@H](C(=O)O)O)O)O)O)O
  - spc_glucosazone | Glucosazone | OCC(O)C(O)C(O)C(=NNc1ccccc1)C=NNc1ccccc1
  - spc_glucose-cyanohydrin | Glucose cyanohydrin | N#CC(O)C(O)C(O)C(O)C(O)CO
  - spc_glucose-oxime | Glucose oxime | ON=CC(O)C(O)C(O)C(O)CO
  - spc_glucose-phenylhydrazone | Glucose phenylhydrazone | OCC(O)C(O)C(O)C(O)C=NNc1ccccc1
  - spc_glucosone-phenylhydrazone | Glucosone phenylhydrazone | OCC(O)C(O)C(O)C(=O)C=NNc1ccccc1
  - spc_l-glyceraldehyde | (S)-2,3-Dihydroxypropanal | OC[C@H](O)C=O
  - spc_l-tartaric-acid | (2R,3R)-2,3-Dihydroxybutanedioic acid | O[C@@H](C(=O)O)[C@@H](O)C(=O)O
  - spc_lactic-acid | 2-Hydroxypropanoic acid | CC(O)C(=O)O
  - spc_lactose | Lactose | C([C@@H]1[C@@H]([C@@H]([C@H]([C@@H](O1)O[C@@H]2[C@H](O[C@H]([C@@H]([C@H]2O)O)O)CO)O)O)O)O
  - spc_maltose | Maltose | C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O[C@@H]2[C@H](O[C@@H]([C@@H]([C@H]2O)O)O)CO)O)O)O)O
  - spc_meso-tartaric-acid | (2R,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@@H](O)C(=O)O
  - spc_methyl-alpha-d-glucopyranoside | Methyl α-D-glucopyranoside | OC[C@H]1O[C@H](OC)[C@H](O)[C@@H](O)[C@@H]1O
  - spc_methyl-beta-d-glucopyranoside | Methyl β-D-glucopyranoside | OC[C@H]1O[C@@H](OC)[C@H](O)[C@@H](O)[C@@H]1O
  - spc_r-lactic-acid | (R)-2-Hydroxypropanoic acid | C[C@@H](O)C(=O)O
  - spc_s-lactic-acid | (S)-2-Hydroxypropanoic acid | C[C@H](O)C(=O)O
  - spc_saccharic-acid | Saccharic acid | OC(=O)C(O)C(O)C(O)C(O)C(=O)O
  - spc_sorbitol | Hexane-1,2,3,4,5,6-hexol | OCC(O)C(O)C(O)C(O)CO
  - spc_sucrose | Sucrose | C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O[C@]2([C@H]([C@@H]([C@H](O2)CO)O)O)CO)O)O)O)O
### cls_alcohols-tertiary | Tertiary alcohols
SMARTS: [CX4;H0][OX2H]
- listed in the family: 3; match the pattern: 7
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (4):
  - spc_4-hydroxy-4-methylpentan-2-one | 4-Hydroxy-4-methylpentan-2-one (diacetone alcohol) | CC(=O)CC(C)(C)O
  - spc_acetone-cyanohydrin | Propanone cyanohydrin (2-hydroxy-2-methylpropanenitrile) | CC(C)(O)C#N
  - spc_benzilic-acid | Benzilic acid | OC(=O)C(O)(c1ccccc1)c1ccccc1
  - spc_pinacol | Pinacol (2,3-dimethylbutane-2,3-diol) | CC(C)(O)C(C)(C)O
### cls_aldaric-acids | Aldaric acids
SMARTS: [OX2H1][CX3](=O)[CX4;H1][OX2H].[OX2H1][CX3](=O)[CX4;H1][OX2H]
- listed in the family: 1; match the pattern: 4
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (3):
  - spc_d-tartaric-acid | (2S,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@H](O)C(=O)O
  - spc_l-tartaric-acid | (2R,3R)-2,3-Dihydroxybutanedioic acid | O[C@@H](C(=O)O)[C@@H](O)C(=O)O
  - spc_meso-tartaric-acid | (2R,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@@H](O)C(=O)O
### cls_aldehydes | Aldehydes
SMARTS: [$([CX3H1](=O)[#6]),$([CX3H2]=O)]
- listed in the family: 5; match the pattern: 22
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (4):
  - spc_d-galactose | D-Galactose | C([C@H]([C@@H]([C@@H]([C@H](C=O)O)O)O)O)O
  - spc_d-glucose | D-Glucose (open chain) | C([C@H]([C@H]([C@@H]([C@H](C=O)O)O)O)O)O
  - spc_d-mannose | D-Mannose | C([C@H]([C@H]([C@@H]([C@@H](C=O)O)O)O)O)O
  - spc_glyoxylic-acid | Oxoethanoic acid | O=CC(=O)O
### cls_aldehydes-with-alpha-h | Aldehydes with α-hydrogen
SMARTS: [CX3H1](=O)[CX4;!H0]
- listed in the family: 3; match the pattern: 12
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (9):
  - spc_3-hydroxy-2-methylbutanal | 3-Hydroxy-2-methylbutanal | CC(O)C(C)C=O
  - spc_3-hydroxy-2-methylpentanal | 3-Hydroxy-2-methylpentanal | CCC(O)C(C)C=O
  - spc_3-hydroxybutanal | 3-Hydroxybutanal | CC(O)CC=O
  - spc_3-hydroxypentanal | 3-Hydroxypentanal | CCC(O)CC=O
  - spc_d-galactose | D-Galactose | C([C@H]([C@@H]([C@@H]([C@H](C=O)O)O)O)O)O
  - spc_d-glucose | D-Glucose (open chain) | C([C@H]([C@H]([C@@H]([C@H](C=O)O)O)O)O)O
  - spc_d-glyceraldehyde | (R)-2,3-Dihydroxypropanal | OC[C@@H](O)C=O
  - spc_d-mannose | D-Mannose | C([C@H]([C@H]([C@@H]([C@@H](C=O)O)O)O)O)O
  - spc_l-glyceraldehyde | (S)-2,3-Dihydroxypropanal | OC[C@H](O)C=O
### cls_aldehydes-without-alpha-h | Aldehydes without α-hydrogen
SMARTS: [$([CX3H1](=O)c),$([CX3H1](=O)[CX4;H0]),$([CX3H1](=O)[CX3;H0]),$([CX3H2]=O)]
- listed in the family: 3; match the pattern: 8
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (5):
  - spc_2-methylpent-2-enal | 2-Methylpent-2-enal | CCC=C(C)C=O
  - spc_3-nitrobenzaldehyde | 3-Nitrobenzaldehyde | O=Cc1cccc([N+](=O)[O-])c1
  - spc_4-hydroxybenzaldehyde | 4-Hydroxybenzaldehyde | O=Cc1ccc(O)cc1
  - spc_glyoxylic-acid | Oxoethanoic acid | O=CC(=O)O
  - spc_salicylaldehyde | Salicylaldehyde (2-hydroxybenzaldehyde) | O=Cc1ccccc1O
### cls_aldohexoses | Aldohexoses (approximate pattern: part b not made)
SMARTS: [$([CX3H1](=O)[CX4]([OX2H])[CX4]([OX2H])[CX4]([OX2H])[CX4]([OX2H])[CX4;H2][OX2H]),$([CX4;H1;R]1([OX2H])[OX2;R][CX4;R]([CX4;H2][OX2H])[CX4;R]([OX2H])[CX4;R]([OX2H])[CX4;R]1[OX2H])]
- listed in the family: 5; match the pattern: 5
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_aldonic-acids | Aldonic acids
SMARTS: [OX2H1][CX3](=O)[CX4;H1]([OX2H])[CX4;H1][OX2H]
- listed in the family: 1; match the pattern: 5
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (4):
  - spc_d-tartaric-acid | (2S,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@H](O)C(=O)O
  - spc_l-tartaric-acid | (2R,3R)-2,3-Dihydroxybutanedioic acid | O[C@@H](C(=O)O)[C@@H](O)C(=O)O
  - spc_meso-tartaric-acid | (2R,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@@H](O)C(=O)O
  - spc_saccharic-acid | Saccharic acid | OC(=O)C(O)C(O)C(O)C(O)C(=O)O
### cls_aldoses | Aldoses (approximate pattern: part b not made)
SMARTS: [$([CX3H1](=O)[CX4][CX4]([OX2H])[CX4][OX2H]),$([CX4;H1;R]([OX2H])[OX2;R][CX4;R][CX4;H2][OX2H]),$([CX4;H1;R]([OX2H])[OX2;R][CX4;H2;R])]
- listed in the family: 2; match the pattern: 9
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_aliphatic-aldehydes | Aliphatic aldehydes
SMARTS: [$([CX3H1](=O)[CX4,CX3]),$([CX3H2]=O)]
- listed in the family: 4; match the pattern: 18
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (14):
  - spc_2-methylpent-2-enal | 2-Methylpent-2-enal | CCC=C(C)C=O
  - spc_3-hydroxy-2-methylbutanal | 3-Hydroxy-2-methylbutanal | CC(O)C(C)C=O
  - spc_3-hydroxy-2-methylpentanal | 3-Hydroxy-2-methylpentanal | CCC(O)C(C)C=O
  - spc_3-hydroxybutanal | 3-Hydroxybutanal | CC(O)CC=O
  - spc_3-hydroxypentanal | 3-Hydroxypentanal | CCC(O)CC=O
  - spc_but-2-enal | But-2-enal (crotonaldehyde) | C/C=C/C=O
  - spc_d-galactose | D-Galactose | C([C@H]([C@@H]([C@@H]([C@H](C=O)O)O)O)O)O
  - spc_d-glucose | D-Glucose (open chain) | C([C@H]([C@H]([C@@H]([C@H](C=O)O)O)O)O)O
  - spc_d-glyceraldehyde | (R)-2,3-Dihydroxypropanal | OC[C@@H](O)C=O
  - spc_d-mannose | D-Mannose | C([C@H]([C@H]([C@@H]([C@@H](C=O)O)O)O)O)O
  - spc_glyoxal | Ethanedial | O=CC=O
  - spc_glyoxylic-acid | Oxoethanoic acid | O=CC(=O)O
  - spc_l-glyceraldehyde | (S)-2,3-Dihydroxypropanal | OC[C@H](O)C=O
  - spc_methylglyoxal | Methylglyoxal (2-oxopropanal) | CC(=O)C=O
### cls_alkenes | Alkenes (approximate pattern: part b not made)
SMARTS: [CX3,CX2]=[CX3,CX2]
- listed in the family: 21; match the pattern: 55
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_alkyl-fluorides | Alkyl fluorides
SMARTS: [CX4]F
- listed in the family: 1; match the pattern: 2
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (1):
  - spc_dichlorodifluoromethane | Dichlorodifluoromethane | FC(F)(Cl)Cl
### cls_alkyl-iodides | Alkyl iodides
SMARTS: [CX4]I
- listed in the family: 3; match the pattern: 5
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (2):
  - spc_2-iodopropane | 2-Iodopropane | CC(C)I
  - spc_iodoform | Iodoform | IC(I)I
### cls_alkyl-nitrites | Alkyl nitrites
SMARTS: [CX4][OX2][NX2]=O
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_alkylarenes | Alkylarenes (approximate pattern: part b not made)
SMARTS: [CX4;!$(C~[!#6;!#1])]c
- listed in the family: 1; match the pattern: 19
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_alkylbenzenes | Alkylbenzenes (approximate pattern: part b not made)
SMARTS: [CX4;!H0;!$(C~[!#6;!#1])]c1ccccc1
- listed in the family: 4; match the pattern: 16
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_alkynes | Alkynes (approximate pattern: part b not made)
SMARTS: [CX2]#[CX2]
- listed in the family: 2; match the pattern: 7
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_alpha-amino-acids | α-Amino acids
SMARTS: [NX3;+0;!$(N-[CX3]=[O,S,N]);!$(N-[#6]=[N,O,S])][CX4][CX3](=O)[OX2H1]
- listed in the family: 2; match the pattern: 4
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_alpha-beta-unsaturated-acids | α,β-Unsaturated carboxylic acids
SMARTS: [CX3](=O)([OX2H1])[CX3]=[CX3]
- listed in the family: 3; match the pattern: 3
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_alpha-beta-unsaturated-aldehydes | α,β-Unsaturated aldehydes
SMARTS: [CX3H1](=O)[CX3]=[CX3]
- listed in the family: 2; match the pattern: 2
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_alpha-beta-unsaturated-ketones | α,β-Unsaturated ketones
SMARTS: [#6][CX3](=O)[CX3]=[CX3]
- listed in the family: 4; match the pattern: 7
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (3):
  - spc_benzoquinone | Benzoquinone (cyclohexa-2,5-diene-1,4-dione) | O=C1C=CC(=O)C=C1
  - spc_indophenol | Indophenol | O=C1C=CC(=Nc2ccc(O)cc2)C=C1
  - spc_sodium-indophenolate | Sodium indophenolate (blue) | [Na+].[O-]c1ccc(cc1)N=C1C=CC(=O)C=C1
### cls_alpha-halo-acids | α-Halo carboxylic acids
SMARTS: [CX3](=O)([OX2H1])[CX4][F,Cl,Br,I]
- listed in the family: 5; match the pattern: 5
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_alpha-hydroxy-acids | α-Hydroxy acids
SMARTS: [CX3](=O)([OX2H1])[CX4][OX2H]
- listed in the family: 5; match the pattern: 10
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (5):
  - spc_d-tartaric-acid | (2S,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@H](O)C(=O)O
  - spc_gluconic-acid | Gluconic acid | C([C@H]([C@H]([C@@H]([C@H](C(=O)O)O)O)O)O)O
  - spc_l-tartaric-acid | (2R,3R)-2,3-Dihydroxybutanedioic acid | O[C@@H](C(=O)O)[C@@H](O)C(=O)O
  - spc_meso-tartaric-acid | (2R,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@@H](O)C(=O)O
  - spc_saccharic-acid | Saccharic acid | OC(=O)C(O)C(O)C(O)C(O)C(=O)O
### cls_alpha-keto-acids | α-Keto acids
SMARTS: [CX3](=O)([OX2H1])[CX3](=O)[#6]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_alpha-omega-dihalides | α,ω-Dihalides (terminal dihaloalkanes) (approximate pattern: part b not made)
SMARTS: [$([F,Cl,Br,I][CH2][CX4][CH2][F,Cl,Br,I]),$([F,Cl,Br,I][CH2][CX4][CX4][CH2][F,Cl,Br,I]),$([F,Cl,Br,I][CH2][CX4][CX4][CX4][CH2][F,Cl,Br,I]),$([F,Cl,Br,I][CH2][CX4][CX4][CX4][CX4][CH2][F,Cl,Br,I])]
- listed in the family: 2; match the pattern: 2
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_amides | Amides
SMARTS: [CX3;H1,$(C[#6])](=O)[NX3;!$(N(C=O)C=O)]
- listed in the family: 0; match the pattern: 19
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (2):
  - spc_caprolactam | ε-Caprolactam | O=C1CCCCCN1
  - spc_ethanehydroxamic-acid | Ethanehydroxamic acid | CC(=O)NO
### cls_amides-n-n-disubstituted | N,N-disubstituted amides
SMARTS: [CX3;H1,$(C[#6])](=O)[NX3;H0;!$(N(C=O)C=O)]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_amides-n-substituted | N-substituted amides
SMARTS: [CX3;H1,$(C[#6])](=O)[NX3;H1;!$(N(C=O)C=O)]
- listed in the family: 7; match the pattern: 13
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (4):
  - spc_caprolactam | ε-Caprolactam | O=C1CCCCCN1
  - spc_ethanehydroxamic-acid | Ethanehydroxamic acid | CC(=O)NO
  - spc_glycine-diketopiperazine | Piperazine-2,5-dione | O=C1CNC(=O)CN1
  - spc_glycylalanine | Glycylalanine | NCC(=O)NC(C)C(=O)O
### cls_amides-primary | Primary amides
SMARTS: [CX3;H1,$(C[#6])](=O)[NX3;H2]
- listed in the family: 5; match the pattern: 5
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_amine-oxides | Tertiary amine oxides
SMARTS: [NX4+;H0]([#6])([#6])([#6])[OX1-]
- listed in the family: 0; match the pattern: 0
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_amines | Amines (approximate pattern: part b not made)
SMARTS: [NX3;+0;!$(N-[CX3]=[O,S,N]);!$(N-[#7,#8,#16]);!$(N-C#N);$(N-[#6])]
- listed in the family: 0; match the pattern: 52
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_amines-primary | Primary amines
SMARTS: [NX3;+0;!$(N-[CX3]=[O,S,N]);!$(N-[#7,#8,#16]);!$(N-C#N);$(N-[#6]);H2]
- listed in the family: 1; match the pattern: 37
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (17):
  - spc_2-aminopropan-1-ol | 2-Aminopropan-1-ol | CC(N)CO
  - spc_3-aminobutanoic-acid | 3-Aminobutanoic acid | CC(N)CC(=O)O
  - spc_4-aminoazobenzene | 4-Aminoazobenzene | Nc1ccc(cc1)N=Nc1ccccc1
  - spc_4-aminobutanoic-acid | 4-Aminobutanoic acid | NCCCC(=O)O
  - spc_5-aminopentanoic-acid | 5-Aminopentanoic acid | NCCCCC(=O)O
  - spc_adenine | Adenine | Nc1ncnc2[nH]cnc12
  - spc_alanine | 2-Aminopropanoic acid (alanine) | CC(N)C(O)=O
  - spc_aminoacetonitrile-ethanal | 2-Aminopropanenitrile | CC(N)C#N
  - spc_aspartic-acid | Aspartic acid | N[C@@H](CC(=O)O)C(=O)O
  - spc_cytosine | Cytosine | Nc1cc[nH]c(=O)n1
  - spc_ethyl-3-aminobut-2-enoate | Ethyl 3-aminobut-2-enoate | CCOC(=O)C=C(C)N
  - spc_ethyl-glycinate | Ethyl glycinate | NCC(=O)OCC
  - spc_glycine | Aminoethanoic acid (glycine) | NCC(O)=O
  - spc_glycylalanine | Glycylalanine | NCC(=O)NC(C)C(=O)O
  - spc_guanine | Guanine | Nc1nc2[nH]cnc2c(=O)[nH]1
  - spc_lysine | Lysine | NCCCC[C@H](N)C(=O)O
  - spc_sodium-glycinate | Sodium glycinate | [Na+].NCC(=O)[O-]
### cls_amines-primary-aliphatic | Primary aliphatic amines
SMARTS: [NX3;+0;!$(N-[CX3]=[O,S,N]);!$(N-[#7,#8,#16]);!$(N-C#N);$(N-[#6]);H2;$(N-[CX4])]
- listed in the family: 12; match the pattern: 25
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (13):
  - spc_2-aminopropan-1-ol | 2-Aminopropan-1-ol | CC(N)CO
  - spc_3-aminobutan-2-ol | 3-Aminobutan-2-ol | CC(N)C(C)O
  - spc_3-aminobutanoic-acid | 3-Aminobutanoic acid | CC(N)CC(=O)O
  - spc_4-aminobutanoic-acid | 4-Aminobutanoic acid | NCCCC(=O)O
  - spc_5-aminopentanoic-acid | 5-Aminopentanoic acid | NCCCCC(=O)O
  - spc_alanine | 2-Aminopropanoic acid (alanine) | CC(N)C(O)=O
  - spc_aminoacetonitrile-ethanal | 2-Aminopropanenitrile | CC(N)C#N
  - spc_aspartic-acid | Aspartic acid | N[C@@H](CC(=O)O)C(=O)O
  - spc_ethyl-glycinate | Ethyl glycinate | NCC(=O)OCC
  - spc_glycine | Aminoethanoic acid (glycine) | NCC(O)=O
  - spc_glycylalanine | Glycylalanine | NCC(=O)NC(C)C(=O)O
  - spc_lysine | Lysine | NCCCC[C@H](N)C(=O)O
  - spc_sodium-glycinate | Sodium glycinate | [Na+].NCC(=O)[O-]
### cls_amines-primary-aromatic | Primary aromatic amines
SMARTS: [NX3;+0;!$(N-[CX3]=[O,S,N]);!$(N-[#7,#8,#16]);!$(N-C#N);$(N-[#6]);H2;$(N-c)]
- listed in the family: 7; match the pattern: 11
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (4):
  - spc_4-aminoazobenzene | 4-Aminoazobenzene | Nc1ccc(cc1)N=Nc1ccccc1
  - spc_adenine | Adenine | Nc1ncnc2[nH]cnc12
  - spc_cytosine | Cytosine | Nc1cc[nH]c(=O)n1
  - spc_guanine | Guanine | Nc1nc2[nH]cnc2c(=O)[nH]1
### cls_amines-secondary | Secondary amines
SMARTS: [NX3;+0;!$(N-[CX3]=[O,S,N]);!$(N-[#7,#8,#16]);!$(N-C#N);$(N-[#6]);H1]
- listed in the family: 10; match the pattern: 10
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_amines-tertiary | Tertiary amines
SMARTS: [NX3;+0;!$(N-[CX3]=[O,S,N]);!$(N-[#7,#8,#16]);!$(N-C#N);$(N-[#6]);H0]
- listed in the family: 5; match the pattern: 5
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_amino-alcohols | Amino alcohols (β-amino alcohols)
SMARTS: [NX3;+0;!$(N-[CX3]=[O,S,N])][CX4][CX4][OX2H]
- listed in the family: 2; match the pattern: 3
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (1):
  - spc_1-aminopropan-2-ol | 1-Aminopropan-2-ol | CC(O)CN
### cls_ammonium-salts | Ammonium salts
SMARTS: [NX4+;!H0]
- listed in the family: 6; match the pattern: 8
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (2):
  - spc_ammonium-bromide | Ammonium bromide | [NH4+].[Br-]
  - spc_ammonium-ethanoate | Ammonium ethanoate | [NH4+].CC([O-])=O
### cls_arenes | Arenes (approximate pattern: part b not made)
SMARTS: c1ccccc1
- listed in the family: 10; match the pattern: 149
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_aromatic-aldehydes | Aromatic aldehydes
SMARTS: [CX3H1](=O)c
- listed in the family: 2; match the pattern: 4
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (2):
  - spc_4-hydroxybenzaldehyde | 4-Hydroxybenzaldehyde | O=Cc1ccc(O)cc1
  - spc_salicylaldehyde | Salicylaldehyde (2-hydroxybenzaldehyde) | O=Cc1ccccc1O
### cls_aromatic-carboxylic-acids | Aromatic carboxylic acids
SMARTS: [CX3](=O)([OX2H1])c
- listed in the family: 5; match the pattern: 9
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (4):
  - spc_4-chlorobenzoic-acid | 4-Chlorobenzoic acid | OC(=O)c1ccc(Cl)cc1
  - spc_4-hydroxybenzoic-acid | 4-Hydroxybenzoic acid | OC(=O)c1ccc(O)cc1
  - spc_aspirin | Aspirin (2-acetoxybenzoic acid) | CC(=O)Oc1ccccc1C(=O)O
  - spc_salicylic-acid | Salicylic acid (2-hydroxybenzoic acid) | OC(=O)c1ccccc1O
### cls_aromatic-ketones | Aromatic ketones
SMARTS: [#6][CX3](=O)c
- listed in the family: 5; match the pattern: 12
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (7):
  - spc_2-hydroxyacetophenone | 2′-Hydroxyacetophenone | CC(=O)c1ccccc1O
  - spc_2-methoxyacetophenone | 2′-Methoxyacetophenone | COc1ccccc1C(C)=O
  - spc_3-benzoylpropanoic-acid | 4-Oxo-4-phenylbutanoic acid | OC(=O)CCC(=O)c1ccccc1
  - spc_3-ethylamino-1-phenylpropan-1-one | 3-(Ethylamino)-1-phenylpropan-1-one | CCNCCC(=O)c1ccccc1
  - spc_4-hydroxyacetophenone | 4′-Hydroxyacetophenone | CC(=O)c1ccc(O)cc1
  - spc_4-methoxyacetophenone | 4′-Methoxyacetophenone | COc1ccc(cc1)C(C)=O
  - spc_chalcone | 1,3-Diphenylprop-2-en-1-one | O=C(/C=C/c1ccccc1)c1ccccc1
### cls_aryl-nitriles | Aryl nitriles
SMARTS: [NX1]#[CX2]c
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_azo-compounds | Azo compounds
SMARTS: [#6][NX2]=[NX2][#6]
- listed in the family: 4; match the pattern: 4
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_basic-amino-acids | Basic amino acids (approximate pattern: part b not made)
SMARTS: [NX3;H2][CX4][CX3](=O)[OX2H1].[NX3;+0;H2,H1;!$(N-[CX3]=[O,S,N]);!$(N-[#6]=[N,O,S])]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_beta-amino-acids | β-Amino acids
SMARTS: [NX3;+0;!$(N-[CX3]=[O,S,N])][CX4][CX4][CX3](=O)[OX2H1]
- listed in the family: 1; match the pattern: 2
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (1):
  - spc_aspartic-acid | Aspartic acid | N[C@@H](CC(=O)O)C(=O)O
### cls_beta-enamino-esters | β-Enamino esters
SMARTS: [NX3;H2,H1][CX3]=[CX3][CX3](=O)[OX2][#6]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_beta-halo-acids | β-Halo carboxylic acids
SMARTS: [CX3](=O)([OX2H1])[CX4][CX4][F,Cl,Br,I]
- listed in the family: 2; match the pattern: 2
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_beta-hydroxy-acids | β-Hydroxy acids
SMARTS: [CX3](=O)([OX2H1])[CX4][CX4][OX2H]
- listed in the family: 1; match the pattern: 6
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (5):
  - spc_d-tartaric-acid | (2S,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@H](O)C(=O)O
  - spc_gluconic-acid | Gluconic acid | C([C@H]([C@H]([C@@H]([C@H](C(=O)O)O)O)O)O)O
  - spc_l-tartaric-acid | (2R,3R)-2,3-Dihydroxybutanedioic acid | O[C@@H](C(=O)O)[C@@H](O)C(=O)O
  - spc_meso-tartaric-acid | (2R,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@@H](O)C(=O)O
  - spc_saccharic-acid | Saccharic acid | OC(=O)C(O)C(O)C(O)C(O)C(=O)O
### cls_beta-hydroxy-aldehydes | β-Hydroxy aldehydes (aldols)
SMARTS: [CX3H1](=O)[CX4][CX4][OX2H]
- listed in the family: 4; match the pattern: 9
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (5):
  - spc_d-galactose | D-Galactose | C([C@H]([C@@H]([C@@H]([C@H](C=O)O)O)O)O)O
  - spc_d-glucose | D-Glucose (open chain) | C([C@H]([C@H]([C@@H]([C@H](C=O)O)O)O)O)O
  - spc_d-glyceraldehyde | (R)-2,3-Dihydroxypropanal | OC[C@@H](O)C=O
  - spc_d-mannose | D-Mannose | C([C@H]([C@H]([C@@H]([C@@H](C=O)O)O)O)O)O
  - spc_l-glyceraldehyde | (S)-2,3-Dihydroxypropanal | OC[C@H](O)C=O
### cls_beta-hydroxy-ketones | β-Hydroxy ketones (ketols)
SMARTS: [#6][CX3](=O)[CX4][CX4][OX2H]
- listed in the family: 1; match the pattern: 3
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (2):
  - spc_d-fructose | D-Fructose (open chain) | C([C@H]([C@H]([C@@H](C(=O)CO)O)O)O)O
  - spc_glucosone-phenylhydrazone | Glucosone phenylhydrazone | OCC(O)C(O)C(O)C(=O)C=NNc1ccccc1
### cls_beta-keto-acids | β-Keto acids
SMARTS: [CX3](=O)([OX2H1])[CX4][CX3](=O)[#6]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_beta-keto-esters | β-Keto esters
SMARTS: [CX3](=O)([OX2][#6])[CX4][CX3](=O)[#6]
- listed in the family: 3; match the pattern: 3
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_bisulfite-adducts | Bisulfite addition compounds
SMARTS: [CX4]([OX2H])[SX4](=O)(=O)[OX1-,OX2H1]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_carboxylate-salts | Carboxylate salts
SMARTS: [CX3](=O)[OX1-]
- listed in the family: 10; match the pattern: 18
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (7):
  - spc_barium-carbonate | Barium carbonate | [Ba+2].[O-]C([O-])=O
  - spc_calcium-carbonate | Calcium carbonate | [Ca+2].[O-]C([O-])=O
  - spc_potassium-carbonate | Potassium carbonate | [K+].[K+].[O-]C([O-])=O
  - spc_sodium-carbonate | Sodium carbonate | [Na+].[Na+].[O-]C([O-])=O
  - spc_sodium-glycinate | Sodium glycinate | [Na+].NCC(=O)[O-]
  - spc_sodium-glycolate | Sodium glycolate | [Na+].OCC(=O)[O-]
  - spc_sodium-hydrogencarbonate | Sodium hydrogencarbonate | [Na+].OC([O-])=O
### cls_carboxylic-acids | Carboxylic acids
SMARTS: [CX3](=O)[OX2H1,OX1-]
- listed in the family: 13; match the pattern: 76
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (10):
  - spc_barium-carbonate | Barium carbonate | [Ba+2].[O-]C([O-])=O
  - spc_calcium-carbonate | Calcium carbonate | [Ca+2].[O-]C([O-])=O
  - spc_glycinium-chloride | Glycine hydrochloride | [NH3+]CC(=O)O.[Cl-]
  - spc_glycylalanine | Glycylalanine | NCC(=O)NC(C)C(=O)O
  - spc_n-acetylglycine | N-Acetylglycine | CC(=O)NCC(=O)O
  - spc_potassium-carbonate | Potassium carbonate | [K+].[K+].[O-]C([O-])=O
  - spc_sodium-carbonate | Sodium carbonate | [Na+].[Na+].[O-]C([O-])=O
  - spc_sodium-glycinate | Sodium glycinate | [Na+].NCC(=O)[O-]
  - spc_sodium-glycolate | Sodium glycolate | [Na+].OCC(=O)[O-]
  - spc_sodium-hydrogencarbonate | Sodium hydrogencarbonate | [Na+].OC([O-])=O
### cls_cyanohydrins | Cyanohydrins
SMARTS: [CX4]([OX2H])[CX2]#[NX1]
- listed in the family: 3; match the pattern: 3
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_cycloalkanes | Cycloalkanes (approximate pattern: part b not made)
SMARTS: [CX4;R;!$(C~[!#6;!#1])]
- listed in the family: 6; match the pattern: 33
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_delta-amino-acids | δ-Amino acids
SMARTS: [NX3;+0;!$(N-[CX3]=[O,S,N])][CX4][CX4][CX4][CX4][CX3](=O)[OX2H1]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_diazonium-salts | Diazonium salts
SMARTS: [NX2+]#[NX1]
- listed in the family: 2; match the pattern: 2
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_dicarboxylic-acids | Dicarboxylic acids
SMARTS: [CX3](=O)[OX2H1].[CX3](=O)[OX2H1]
- listed in the family: 6; match the pattern: 13
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (7):
  - spc_aspartic-acid | Aspartic acid | N[C@@H](CC(=O)O)C(=O)O
  - spc_d-tartaric-acid | (2S,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@H](O)C(=O)O
  - spc_l-tartaric-acid | (2R,3R)-2,3-Dihydroxybutanedioic acid | O[C@@H](C(=O)O)[C@@H](O)C(=O)O
  - spc_meso-tartaric-acid | (2R,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@@H](O)C(=O)O
  - spc_methylmalonic-acid | 2-Methylpropanedioic acid | CC(C(=O)O)C(=O)O
  - spc_phthalic-acid | Benzene-1,2-dicarboxylic acid (phthalic acid) | OC(=O)c1ccccc1C(O)=O
  - spc_saccharic-acid | Saccharic acid | OC(=O)C(O)C(O)C(O)C(O)C(=O)O
### cls_diketopiperazines | Diketopiperazines
SMARTS: O=C1[CX4][NX3]C(=O)[CX4][NX3]1
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_dipeptides | Dipeptides (approximate pattern: part b not made)
SMARTS: [NX3;H2][CX4][CX3](=O)[NX3H1][CX4][CX3](=O)[OX2H1]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_disaccharides | Disaccharides (approximate pattern: part b not made)
SMARTS: [CX4;R]([OX2;R][CX4;R])([OX2;!R][CX4;R]).[CX4][OX2H].[CX4][OX2H].[CX4][OX2H]
- listed in the family: 3; match the pattern: 3
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_epoxides | Epoxides
SMARTS: [CX4]1[OX2][CX4]1
- listed in the family: 4; match the pattern: 4
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_esters | Esters
SMARTS: [CX3;H1,$(C[#6]),$(C[NX3])](=O)[OX2;!$(O(C=O)C=O)][#6]
- listed in the family: 14; match the pattern: 24
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (2):
  - spc_ethyl-glycinate-hydrochloride | Ethyl glycinate hydrochloride | [NH3+]CC(=O)OCC.[Cl-]
  - spc_n-ethoxycarbonylmethylphthalimide | Ethyl 2-phthalimidoethanoate | CCOC(=O)CN1C(=O)c2ccccc2C1=O
### cls_esters-with-alpha-h | Esters with α-hydrogen
SMARTS: [CX4;!H0][CX3](=O)[OX2][#6]
- listed in the family: 2; match the pattern: 23
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (21):
  - spc_aspirin | Aspirin (2-acetoxybenzoic acid) | CC(=O)Oc1ccccc1C(=O)O
  - spc_benzylidene-diacetate | Benzylidene diacetate | CC(=O)OC(OC(C)=O)c1ccccc1
  - spc_dimethyl-adipate | Dimethyl hexanedioate (dimethyl adipate) | COC(=O)CCCCC(=O)OC
  - spc_ethanoic-anhydride | Ethanoic anhydride | CC(=O)OC(C)=O
  - spc_ethyl-2-methylacetoacetate | Ethyl 2-methyl-3-oxobutanoate | CCOC(=O)C(C)C(C)=O
  - spc_ethyl-3-hydroxybutanoate | Ethyl 3-hydroxybutanoate | CCOC(=O)CC(C)O
  - spc_ethyl-acetoacetate | Ethyl 3-oxobutanoate | CCOC(=O)CC(C)=O
  - spc_ethyl-bromoethanoate | Ethyl bromoethanoate | BrCC(=O)OCC
  - spc_ethyl-chloroethanoate | Ethyl chloroethanoate | ClCC(=O)OCC
  - spc_ethyl-glycinate | Ethyl glycinate | NCC(=O)OCC
  - spc_ethyl-glycinate-hydrochloride | Ethyl glycinate hydrochloride | [NH3+]CC(=O)OCC.[Cl-]
  - spc_ethylidene-diacetate | Ethane-1,1-diyl diacetate | CC(OC(C)=O)OC(C)=O
  - spc_gamma-butyrolactone | γ-Butyrolactone (oxolan-2-one) | O=C1CCCO1
  - spc_glucose-pentaacetate | Glucose pentaacetate | CC(=O)OCC1OC(OC(C)=O)C(OC(C)=O)C(OC(C)=O)C1OC(C)=O
  - spc_glutaric-anhydride | Glutaric anhydride | O=C1CCCC(=O)O1
  - spc_lactide | Lactide | CC1OC(=O)C(C)OC1=O
  - spc_methyl-2-oxocyclopentanecarboxylate | Methyl 2-oxocyclopentane-1-carboxylate | COC(=O)C1CCCC1=O
  - spc_n-ethoxycarbonylmethylphthalimide | Ethyl 2-phthalimidoethanoate | CCOC(=O)CN1C(=O)c2ccccc2C1=O
  - spc_phenyl-ethanoate | Phenyl ethanoate | CC(=O)Oc1ccccc1
  - spc_succinic-anhydride | Butanedioic anhydride | O=C1CCC(=O)O1
  - spc_vinyl-acetate | Ethenyl ethanoate | C=COC(C)=O
### cls_ethers | Ethers
SMARTS: [OX2;!$(O-[CX3]=O)]([#6])[#6]
- listed in the family: 17; match the pattern: 38
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (11):
  - spc_1-ethoxyethyl-hydroperoxide | 1-Ethoxyethyl hydroperoxide | CCOC(C)OO
  - spc_2-2-3-trimethyloxirane | 2,2,3-Trimethyloxirane | CC1OC1(C)C
  - spc_2-3-dimethyloxirane | 2,3-Dimethyloxirane (2,3-epoxybutane) | CC1OC1C
  - spc_2-deoxy-d-ribose | 2-Deoxy-D-ribose | OC[C@H]1O[C@@H](O)C[C@@H]1O
  - spc_alpha-d-glucopyranose | α-D-Glucopyranose | OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O
  - spc_beta-d-glucopyranose | β-D-Glucopyranose | OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O
  - spc_cyclopentene-oxide | Cyclopentene oxide (6-oxabicyclo[3.1.0]hexane) | C1CC2OC2C1
  - spc_d-ribose | D-Ribose | OC[C@H]1O[C@@H](O)[C@H](O)[C@@H]1O
  - spc_glucose-pentaacetate | Glucose pentaacetate | CC(=O)OCC1OC(OC(C)=O)C(OC(C)=O)C(OC(C)=O)C1OC(C)=O
  - spc_oxirane | Oxirane | C1CO1
  - spc_sodium-ethyl-xanthate | Sodium ethyl xanthate | CCOC(=S)[S-].[Na+]
### cls_gamma-amino-acids | γ-Amino acids
SMARTS: [NX3;+0;!$(N-[CX3]=[O,S,N])][CX4][CX4][CX4][CX3](=O)[OX2H1]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_gamma-halo-acids | γ-Halo carboxylic acids
SMARTS: [CX3](=O)([OX2H1])[CX4][CX4][CX4][F,Cl,Br,I]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_gamma-hydroxy-acids | γ-Hydroxy acids
SMARTS: [CX3](=O)([OX2H1])[CX4][CX4][CX4][OX2H]
- listed in the family: 1; match the pattern: 3
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (2):
  - spc_gluconic-acid | Gluconic acid | C([C@H]([C@H]([C@@H]([C@H](C(=O)O)O)O)O)O)O
  - spc_saccharic-acid | Saccharic acid | OC(=O)C(O)C(O)C(O)C(O)C(=O)O
### cls_geminal-dihalides | Geminal dihalides (gem-dihalides)
SMARTS: [CX4]([F,Cl,Br,I])[F,Cl,Br,I]
- listed in the family: 3; match the pattern: 12
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (9):
  - spc_1-1-2-2-tetrachloroethane | 1,1,2,2-Tetrachloroethane | ClC(Cl)C(Cl)Cl
  - spc_chloroform | Trichloromethane | ClC(Cl)Cl
  - spc_ddt | p,p′-Dichlorodiphenyltrichloroethane | ClC1=CC=C(C=C1)C(C1=CC=C(Cl)C=C1)C(Cl)(Cl)Cl
  - spc_dichlorodifluoromethane | Dichlorodifluoromethane | FC(F)(Cl)Cl
  - spc_dichloroethanoic-acid | Dichloroethanoic acid | OC(=O)C(Cl)Cl
  - spc_dichloromethane | Dichloromethane | ClCCl
  - spc_iodoform | Iodoform | IC(I)I
  - spc_tetrachloromethane | Tetrachloromethane | ClC(Cl)(Cl)Cl
  - spc_trichloroethanoic-acid | Trichloroethanoic acid | OC(=O)C(Cl)(Cl)Cl
### cls_glycosides | Glycosides
SMARTS: [CX4;R;H1,H0]([OX2;R][CX4;R])[OX2;!R][#6].[CX4][OX2H].[CX4][OX2H].[CX4][OX2H]
- listed in the family: 2; match the pattern: 5
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (3):
  - spc_lactose | Lactose | C([C@@H]1[C@@H]([C@@H]([C@H]([C@@H](O1)O[C@@H]2[C@H](O[C@H]([C@@H]([C@H]2O)O)O)CO)O)O)O)O
  - spc_maltose | Maltose | C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O[C@@H]2[C@H](O[C@@H]([C@@H]([C@H]2O)O)O)CO)O)O)O)O
  - spc_sucrose | Sucrose | C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O[C@]2([C@H]([C@@H]([C@H](O2)CO)O)O)CO)O)O)O)O
### cls_grignard-reagents | Grignard reagents
SMARTS: [#6][Mg][F,Cl,Br,I]
- listed in the family: 2; match the pattern: 2
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_haloalkanes | Haloalkanes
SMARTS: [CX4][F,Cl,Br,I]
- listed in the family: 28; match the pattern: 63
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (12):
  - spc_1-bromopropan-2-one | Bromopropanone | CC(=O)CBr
  - spc_2-bromopropanoic-acid | 2-Bromopropanoic acid | CC(Br)C(=O)O
  - spc_2-chloropropanoic-acid | 2-Chloropropanoic acid | CC(Cl)C(O)=O
  - spc_3-bromo-3-phenylpropanoic-acid | 3-Bromo-3-phenylpropanoic acid | OC(=O)CC(Br)c1ccccc1
  - spc_3-chloropropanoic-acid | 3-Chloropropanoic acid | ClCCC(O)=O
  - spc_4-chlorobutanoic-acid | 4-Chlorobutanoic acid | ClCCCC(O)=O
  - spc_bromoethanal | Bromoethanal | BrCC=O
  - spc_chloroethanoic-acid | Chloroethanoic acid | OC(=O)CCl
  - spc_dichloroethanoic-acid | Dichloroethanoic acid | OC(=O)C(Cl)Cl
  - spc_ethyl-bromoethanoate | Ethyl bromoethanoate | BrCC(=O)OCC
  - spc_ethyl-chloroethanoate | Ethyl chloroethanoate | ClCC(=O)OCC
  - spc_trichloroethanoic-acid | Trichloroethanoic acid | OC(=O)C(Cl)(Cl)Cl
### cls_haloalkenes | Haloalkenes
SMARTS: [CX3]([F,Cl,Br,I])=[CX3]
- listed in the family: 5; match the pattern: 5
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_haloarenes | Haloarenes
SMARTS: c[F,Cl,Br,I]
- listed in the family: 12; match the pattern: 25
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (13):
  - spc_2-4-6-tribromoaniline | 2,4,6-Tribromoaniline | Nc1c(Br)cc(Br)cc1Br
  - spc_2-4-6-tribromophenol | 2,4,6-Tribromophenol | Oc1c(Br)cc(Br)cc1Br
  - spc_2-bromoanisole | 2-Bromoanisole | COc1ccccc1Br
  - spc_2-bromophenol | 2-Bromophenol | Oc1ccccc1Br
  - spc_2-chlorobenzenesulfonic-acid | 2-Chlorobenzenesulfonic acid | OS(=O)(=O)c1ccccc1Cl
  - spc_3-bromobenzoic-acid | 3-Bromobenzoic acid | OC(=O)c1cccc(Br)c1
  - spc_4-bromoacetanilide | N-(4-Bromophenyl)ethanamide | CC(=O)Nc1ccc(Br)cc1
  - spc_4-bromoaniline | 4-Bromoaniline | Nc1ccc(Br)cc1
  - spc_4-bromoanisole | 4-Bromoanisole | COc1ccc(Br)cc1
  - spc_4-bromophenol | 4-Bromophenol | Oc1ccc(Br)cc1
  - spc_4-chlorobenzenesulfonic-acid | 4-Chlorobenzenesulfonic acid | OS(=O)(=O)c1ccc(Cl)cc1
  - spc_4-chlorobenzoic-acid | 4-Chlorobenzoic acid | OC(=O)c1ccc(Cl)cc1
  - spc_ddt | p,p′-Dichlorodiphenyltrichloroethane | ClC1=CC=C(C=C1)C(C1=CC=C(Cl)C=C1)C(Cl)(Cl)Cl
### cls_halohydrins | Halohydrins
SMARTS: [CX4]([F,Cl,Br,I])[CX4][OX2H]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_hydrazines | Hydrazines
SMARTS: [NX3][NX3]
- listed in the family: 3; match the pattern: 4
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (1):
  - spc_hydrazine | Hydrazine | NN
### cls_hydrazones | Hydrazones
SMARTS: [CX3]=[NX2][NX3]
- listed in the family: 1; match the pattern: 7
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_hydroxamic-acids | Hydroxamic acids
SMARTS: [CX3](=O)[NX3][OX2H]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_imides | Imides
SMARTS: [CX3](=O)[#7][CX3]=O
- listed in the family: 3; match the pattern: 5
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (2):
  - spc_n-ethoxycarbonylmethylphthalimide | Ethyl 2-phthalimidoethanoate | CCOC(=O)CN1C(=O)c2ccccc2C1=O
  - spc_succinimide | Succinimide | O=C1CCC(=O)N1
### cls_imines | Imines (Schiff bases)
SMARTS: [CX3]=[NX2;+0;!$(N-[OX2])]
- listed in the family: 2; match the pattern: 11
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (2):
  - spc_indophenol | Indophenol | O=C1C=CC(=Nc2ccc(O)cc2)C=C1
  - spc_sodium-indophenolate | Sodium indophenolate (blue) | [Na+].[O-]c1ccc(cc1)N=C1C=CC(=O)C=C1
### cls_isocyanates | Isocyanates
SMARTS: [#6][NX2]=[CX2]=O
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_isocyanides | Isocyanides
SMARTS: [CX1-]#[NX2+]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_isothiocyanates | Isothiocyanates
SMARTS: [#6][NX2]=[CX2]=S
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_ketones | Ketones
SMARTS: [#6][CX3](=O)[#6]
- listed in the family: 6; match the pattern: 36
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (10):
  - spc_3-ethylamino-1-phenylpropan-1-one | 3-(Ethylamino)-1-phenylpropan-1-one | CCNCCC(=O)c1ccccc1
  - spc_acetoacetic-acid | 3-Oxobutanoic acid (acetoacetic acid) | CC(=O)CC(O)=O
  - spc_benzoquinone | Benzoquinone (cyclohexa-2,5-diene-1,4-dione) | O=C1C=CC(=O)C=C1
  - spc_d-fructose | D-Fructose (open chain) | C([C@H]([C@H]([C@@H](C(=O)CO)O)O)O)O
  - spc_ethyl-2-methylacetoacetate | Ethyl 2-methyl-3-oxobutanoate | CCOC(=O)C(C)C(C)=O
  - spc_glucosone-phenylhydrazone | Glucosone phenylhydrazone | OCC(O)C(O)C(O)C(=O)C=NNc1ccccc1
  - spc_indophenol | Indophenol | O=C1C=CC(=Nc2ccc(O)cc2)C=C1
  - spc_methyl-2-oxocyclopentanecarboxylate | Methyl 2-oxocyclopentane-1-carboxylate | COC(=O)C1CCCC1=O
  - spc_pyruvic-acid | Pyruvic acid (2-oxopropanoic acid) | CC(=O)C(O)=O
  - spc_sodium-indophenolate | Sodium indophenolate (blue) | [Na+].[O-]c1ccc(cc1)N=C1C=CC(=O)C=C1
### cls_ketones-with-alpha-h | Ketones with α-hydrogen
SMARTS: [CX4;!H0][CX3](=O)[#6]
- listed in the family: 5; match the pattern: 29
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (17):
  - spc_2-hydroxyacetophenone | 2′-Hydroxyacetophenone | CC(=O)c1ccccc1O
  - spc_2-methoxyacetophenone | 2′-Methoxyacetophenone | COc1ccccc1C(C)=O
  - spc_3-benzoylpropanoic-acid | 4-Oxo-4-phenylbutanoic acid | OC(=O)CCC(=O)c1ccccc1
  - spc_3-ethylamino-1-phenylpropan-1-one | 3-(Ethylamino)-1-phenylpropan-1-one | CCNCCC(=O)c1ccccc1
  - spc_3-methylcyclopent-2-en-1-one | 3-Methylcyclopent-2-en-1-one | CC1=CC(=O)CC1
  - spc_4-hydroxy-4-methylpentan-2-one | 4-Hydroxy-4-methylpentan-2-one (diacetone alcohol) | CC(=O)CC(C)(C)O
  - spc_4-hydroxyacetophenone | 4′-Hydroxyacetophenone | CC(=O)c1ccc(O)cc1
  - spc_4-methoxyacetophenone | 4′-Methoxyacetophenone | COc1ccc(cc1)C(C)=O
  - spc_4-methylpent-3-en-2-one | Mesityl oxide (4-methylpent-3-en-2-one) | CC(C)=CC(C)=O
  - spc_acetoacetic-acid | 3-Oxobutanoic acid (acetoacetic acid) | CC(=O)CC(O)=O
  - spc_benzoin | Benzoin | O=C(c1ccccc1)C(O)c1ccccc1
  - spc_d-fructose | D-Fructose (open chain) | C([C@H]([C@H]([C@@H](C(=O)CO)O)O)O)O
  - spc_ethyl-2-methylacetoacetate | Ethyl 2-methyl-3-oxobutanoate | CCOC(=O)C(C)C(C)=O
  - spc_glucosone-phenylhydrazone | Glucosone phenylhydrazone | OCC(O)C(O)C(O)C(=O)C=NNc1ccccc1
  - spc_methyl-2-oxocyclopentanecarboxylate | Methyl 2-oxocyclopentane-1-carboxylate | COC(=O)C1CCCC1=O
  - spc_pinacolone | Pinacolone (3,3-dimethylbutan-2-one) | CC(=O)C(C)(C)C
  - spc_pyruvic-acid | Pyruvic acid (2-oxopropanoic acid) | CC(=O)C(O)=O
### cls_ketoses | Ketoses (approximate pattern: part b not made)
SMARTS: [$([CX3](=O)([CX4;H2][OX2H])[CX4][OX2H]),$([CX4;H0;R]([OX2H])([OX2;R][CX4;R])[CX4;H2][OX2H])]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_lactams | Lactams (approximate pattern: part b not made)
SMARTS: [CX3;R](=O)[NX3;R;!$(N(C=O)C=O)]
- listed in the family: 2; match the pattern: 4
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_lactides | Lactides
SMARTS: [CX3;R](=O)[OX2;R][CX4;R].[CX3;R](=O)[OX2;R][CX4;R]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_lactones | Lactones
SMARTS: [CX3;R](=O)[OX2;R][CX4;R]
- listed in the family: 1; match the pattern: 2
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (1):
  - spc_lactide | Lactide | CC1OC(=O)C(C)OC1=O
### cls_metal-acetylides | Metal alkynides (acetylides)
SMARTS: [#6-]#[#6]
- listed in the family: 3; match the pattern: 4
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (1):
  - spc_calcium-carbide | Calcium carbide | [Ca+2].[C-]#[C-]
### cls_methyl-ketones | Methyl ketones
SMARTS: [CH3][CX3](=O)[#6]
- listed in the family: 7; match the pattern: 19
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (12):
  - spc_2-hydroxyacetophenone | 2′-Hydroxyacetophenone | CC(=O)c1ccccc1O
  - spc_2-methoxyacetophenone | 2′-Methoxyacetophenone | COc1ccccc1C(C)=O
  - spc_4-hydroxy-4-methylpentan-2-one | 4-Hydroxy-4-methylpentan-2-one (diacetone alcohol) | CC(=O)CC(C)(C)O
  - spc_4-hydroxyacetophenone | 4′-Hydroxyacetophenone | CC(=O)c1ccc(O)cc1
  - spc_4-methoxyacetophenone | 4′-Methoxyacetophenone | COc1ccc(cc1)C(C)=O
  - spc_4-methylpent-3-en-2-one | Mesityl oxide (4-methylpent-3-en-2-one) | CC(C)=CC(C)=O
  - spc_acetoacetic-acid | 3-Oxobutanoic acid (acetoacetic acid) | CC(=O)CC(O)=O
  - spc_ethyl-2-methylacetoacetate | Ethyl 2-methyl-3-oxobutanoate | CCOC(=O)C(C)C(C)=O
  - spc_hexane-2-5-dione | Hexane-2,5-dione | CC(=O)CCC(C)=O
  - spc_methylglyoxal | Methylglyoxal (2-oxopropanal) | CC(=O)C=O
  - spc_pinacolone | Pinacolone (3,3-dimethylbutan-2-one) | CC(=O)C(C)(C)C
  - spc_pyruvic-acid | Pyruvic acid (2-oxopropanoic acid) | CC(=O)C(O)=O
### cls_monosaccharides | Monosaccharides (approximate pattern: part b not made)
SMARTS: [$([CX3H1](=O)[CX4][CX4]([OX2H])[CX4][OX2H]),$([CX4;H1;R]([OX2H])[OX2;R][CX4;R][CX4;H2][OX2H]),$([CX4;H1;R]([OX2H])[OX2;R][CX4;H2;R]),$([CX3](=O)([CX4;H2][OX2H])[CX4][OX2H]),$([CX4;H0;R]([OX2H])([OX2;R][CX4;R])[CX4;H2][OX2H])]
- listed in the family: 0; match the pattern: 10
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_n-nitrosoamines | N-Nitrosoamines
SMARTS: [NX3][NX2]=O
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_nitriles | Nitriles
SMARTS: [CX2]#[NX1]
- listed in the family: 6; match the pattern: 14
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (4):
  - spc_copper-i-cyanide | Copper(I) cyanide | [Cu]C#N
  - spc_cyanoethanoic-acid | Cyanoethanoic acid | N#CCC(O)=O
  - spc_hydrogen-cyanide | Hydrogen cyanide | C#N
  - spc_iron-iii-thiocyanate | Iron(III) thiocyanate | [Fe+3].[S-]C#N.[S-]C#N.[S-]C#N
### cls_nitro-compounds | Nitro compounds
SMARTS: [#6][NX3+](=O)[OX1-]
- listed in the family: 4; match the pattern: 24
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (16):
  - spc_1-chloro-2-4-dinitrobenzene | 1-Chloro-2,4-dinitrobenzene | Clc1ccc(cc1[N+](=O)[O-])[N+](=O)[O-]
  - spc_1-chloro-2-nitrobenzene | 1-Chloro-2-nitrobenzene | [O-][N+](=O)c1ccccc1Cl
  - spc_1-chloro-4-nitrobenzene | 1-Chloro-4-nitrobenzene | [O-][N+](=O)c1ccc(Cl)cc1
  - spc_2-4-dinitrophenol | 2,4-Dinitrophenol | Oc1ccc(cc1[N+](=O)[O-])[N+](=O)[O-]
  - spc_2-4-dinitrophenylhydrazine | 2,4-Dinitrophenylhydrazine (2,4-DNP) | NNc1ccc([N+](=O)[O-])cc1[N+](=O)[O-]
  - spc_2-nitro-2-nitrosopropane | 2-Nitro-2-nitrosopropane | CC(C)(N=O)[N+](=O)[O-]
  - spc_2-nitroaniline | 2-Nitroaniline | Nc1ccccc1[N+](=O)[O-]
  - spc_2-nitrophenol | 2-Nitrophenol | OC1=CC=CC=C1[N+](=O)[O-]
  - spc_3-nitroaniline | 3-Nitroaniline | Nc1cccc(c1)[N+](=O)[O-]
  - spc_3-nitrobenzaldehyde | 3-Nitrobenzaldehyde | O=Cc1cccc([N+](=O)[O-])c1
  - spc_3-nitrobenzoic-acid | 3-Nitrobenzoic acid | OC(=O)c1cccc([N+](=O)[O-])c1
  - spc_4-nitroacetanilide | N-(4-Nitrophenyl)ethanamide | CC(=O)Nc1ccc(cc1)[N+](=O)[O-]
  - spc_4-nitroaniline | 4-Nitroaniline | Nc1ccc(cc1)[N+](=O)[O-]
  - spc_4-nitrophenol | 4-Nitrophenol | Oc1ccc(cc1)[N+](=O)[O-]
  - spc_ethylnitrolic-acid | Ethylnitrolic acid | CC(=NO)[N+](=O)[O-]
  - spc_propanone-2-4-dnp-hydrazone | Propanone 2,4-dinitrophenylhydrazone | CC(C)=NNc1ccc([N+](=O)[O-])cc1[N+](=O)[O-]
### cls_nitroarenes | Nitroarenes
SMARTS: c[NX3+](=O)[OX1-]
- listed in the family: 4; match the pattern: 18
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (14):
  - spc_1-chloro-2-4-dinitrobenzene | 1-Chloro-2,4-dinitrobenzene | Clc1ccc(cc1[N+](=O)[O-])[N+](=O)[O-]
  - spc_1-chloro-2-nitrobenzene | 1-Chloro-2-nitrobenzene | [O-][N+](=O)c1ccccc1Cl
  - spc_1-chloro-4-nitrobenzene | 1-Chloro-4-nitrobenzene | [O-][N+](=O)c1ccc(Cl)cc1
  - spc_2-4-dinitrophenol | 2,4-Dinitrophenol | Oc1ccc(cc1[N+](=O)[O-])[N+](=O)[O-]
  - spc_2-4-dinitrophenylhydrazine | 2,4-Dinitrophenylhydrazine (2,4-DNP) | NNc1ccc([N+](=O)[O-])cc1[N+](=O)[O-]
  - spc_2-nitroaniline | 2-Nitroaniline | Nc1ccccc1[N+](=O)[O-]
  - spc_2-nitrophenol | 2-Nitrophenol | OC1=CC=CC=C1[N+](=O)[O-]
  - spc_3-nitroaniline | 3-Nitroaniline | Nc1cccc(c1)[N+](=O)[O-]
  - spc_3-nitrobenzaldehyde | 3-Nitrobenzaldehyde | O=Cc1cccc([N+](=O)[O-])c1
  - spc_3-nitrobenzoic-acid | 3-Nitrobenzoic acid | OC(=O)c1cccc([N+](=O)[O-])c1
  - spc_4-nitroacetanilide | N-(4-Nitrophenyl)ethanamide | CC(=O)Nc1ccc(cc1)[N+](=O)[O-]
  - spc_4-nitroaniline | 4-Nitroaniline | Nc1ccc(cc1)[N+](=O)[O-]
  - spc_4-nitrophenol | 4-Nitrophenol | Oc1ccc(cc1)[N+](=O)[O-]
  - spc_propanone-2-4-dnp-hydrazone | Propanone 2,4-dinitrophenylhydrazone | CC(C)=NNc1ccc([N+](=O)[O-])cc1[N+](=O)[O-]
### cls_osazones | Osazones
SMARTS: [CX3](=[NX2][NX3H1]c)[CX3]=[NX2][NX3H1]c
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_oximes | Oximes
SMARTS: [CX3]=[NX2][OX2H]
- listed in the family: 4; match the pattern: 5
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (1):
  - spc_ethylnitrolic-acid | Ethylnitrolic acid | CC(=NO)[N+](=O)[O-]
### cls_peptides | Peptides (approximate pattern: part b not made)
SMARTS: [NX3][CX4][CX3](=O)[NX3H1][CX4][CX3](=O)
- listed in the family: 0; match the pattern: 2
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_phenols | Phenols
SMARTS: c[OX2H]
- listed in the family: 19; match the pattern: 23
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (4):
  - spc_1-phenylazo-2-naphthol | 1-(Phenylazo)naphthalen-2-ol | Oc1ccc2ccccc2c1N=Nc1ccccc1
  - spc_4-hydroxyazobenzene | 4-Hydroxyazobenzene | Oc1ccc(cc1)N=Nc1ccccc1
  - spc_indophenol | Indophenol | O=C1C=CC(=Nc2ccc(O)cc2)C=C1
  - spc_sodium-4-hydroxybenzoate | Sodium 4-hydroxybenzoate | [Na+].[O-]C(=O)c1ccc(O)cc1
### cls_phenylhydrazones | Phenylhydrazones
SMARTS: [CX3]=[NX2][NX3H1]c
- listed in the family: 3; match the pattern: 5
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_polyhalogen-compounds | Polyhalogen compounds (approximate pattern: part b not made)
SMARTS: [$([CX4]([F,Cl,Br,I])([F,Cl,Br,I])[F,Cl,Br,I]),$([CH2]([F,Cl,Br,I])[F,Cl,Br,I])]
- listed in the family: 8; match the pattern: 7
- (a) listed but NOT matching (2):
  - spc_1-1-2-2-tetrachloroethane | 1,1,2,2-Tetrachloroethane | ClC(Cl)C(Cl)Cl
  - spc_hexachlorocyclohexane | Hexachlorocyclohexane | ClC1C(Cl)C(Cl)C(Cl)C(Cl)C1Cl
- (b) matching but NOT listed (not made):
### cls_polysaccharides | Polysaccharides (approximate pattern: part b not made)
SMARTS: [CX4;R]([OX2;R][CX4;R])([OX2;!R][CX4;R]).[CX4;R]([OX2;R][CX4;R])([OX2;!R][CX4;R]).[CX4][OX2H].[CX4][OX2H].[CX4][OX2H]
- listed in the family: 0; match the pattern: 0
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (not made):
### cls_quaternary-ammonium-salts | Quaternary ammonium salts
SMARTS: [NX4+;H0]([#6])([#6])([#6])[#6]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_semicarbazones | Semicarbazones
SMARTS: [CX3]=[NX2][NX3H1][CX3](=O)[NX3H2]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_silver-carboxylates | Silver carboxylates
SMARTS: [CX3](=O)[OX1-].[Ag+]
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_sulfonamides | Sulfonamides
SMARTS: [SX4](=O)(=O)[NX3]
- listed in the family: 2; match the pattern: 2
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_sulfonic-acids | Sulfonic acids
SMARTS: [#6][SX4](=O)(=O)[OX2H1,OX1-]
- listed in the family: 5; match the pattern: 8
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (2):
  - spc_sodium-benzenesulfonate | Sodium benzenesulfonate | [Na+].[O-]S(=O)(=O)c1ccccc1
  - spc_sulfanilic-acid | 4-Aminobenzenesulfonic acid | Nc1ccc(cc1)S(=O)(=O)O
### cls_sulfonyl-chlorides | Sulfonyl chlorides
SMARTS: [#6][SX4](=O)(=O)Cl
- listed in the family: 1; match the pattern: 1
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_terminal-alkynes | Terminal alkynes (1-alkynes)
SMARTS: [CX2;H1]#[CX2]
- listed in the family: 5; match the pattern: 5
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (0):
### cls_vicinal-dihalides | Vicinal dihalides (vic-dihalides)
SMARTS: [CX4]([F,Cl,Br,I])[CX4][F,Cl,Br,I]
- listed in the family: 5; match the pattern: 7
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (2):
  - spc_1-1-2-2-tetrachloroethane | 1,1,2,2-Tetrachloroethane | ClC(Cl)C(Cl)Cl
  - spc_hexachlorocyclohexane | Hexachlorocyclohexane | ClC1C(Cl)C(Cl)C(Cl)C(Cl)C1Cl
### cls_vicinal-diols | Vicinal diols (glycols)
SMARTS: [CX4]([OX2H])[CX4][OX2H]
- listed in the family: 2; match the pattern: 29
- (a) listed but NOT matching (0):
- (b) matching but NOT listed (27):
  - spc_alpha-d-glucopyranose | α-D-Glucopyranose | OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O
  - spc_beta-d-glucopyranose | β-D-Glucopyranose | OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O
  - spc_butane-2-3-diol | Butane-2,3-diol (racemic) | CC(O)C(O)C
  - spc_d-fructose | D-Fructose (open chain) | C([C@H]([C@H]([C@@H](C(=O)CO)O)O)O)O
  - spc_d-galactose | D-Galactose | C([C@H]([C@@H]([C@@H]([C@H](C=O)O)O)O)O)O
  - spc_d-glucose | D-Glucose (open chain) | C([C@H]([C@H]([C@@H]([C@H](C=O)O)O)O)O)O
  - spc_d-glyceraldehyde | (R)-2,3-Dihydroxypropanal | OC[C@@H](O)C=O
  - spc_d-mannose | D-Mannose | C([C@H]([C@H]([C@@H]([C@@H](C=O)O)O)O)O)O
  - spc_d-ribose | D-Ribose | OC[C@H]1O[C@@H](O)[C@H](O)[C@@H]1O
  - spc_d-tartaric-acid | (2S,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@H](O)C(=O)O
  - spc_gluconic-acid | Gluconic acid | C([C@H]([C@H]([C@@H]([C@H](C(=O)O)O)O)O)O)O
  - spc_glucosazone | Glucosazone | OCC(O)C(O)C(O)C(=NNc1ccccc1)C=NNc1ccccc1
  - spc_glucose-cyanohydrin | Glucose cyanohydrin | N#CC(O)C(O)C(O)C(O)C(O)CO
  - spc_glucose-oxime | Glucose oxime | ON=CC(O)C(O)C(O)C(O)CO
  - spc_glucose-phenylhydrazone | Glucose phenylhydrazone | OCC(O)C(O)C(O)C(O)C=NNc1ccccc1
  - spc_glucosone-phenylhydrazone | Glucosone phenylhydrazone | OCC(O)C(O)C(O)C(=O)C=NNc1ccccc1
  - spc_l-glyceraldehyde | (S)-2,3-Dihydroxypropanal | OC[C@H](O)C=O
  - spc_l-tartaric-acid | (2R,3R)-2,3-Dihydroxybutanedioic acid | O[C@@H](C(=O)O)[C@@H](O)C(=O)O
  - spc_lactose | Lactose | C([C@@H]1[C@@H]([C@@H]([C@H]([C@@H](O1)O[C@@H]2[C@H](O[C@H]([C@@H]([C@H]2O)O)O)CO)O)O)O)O
  - spc_maltose | Maltose | C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O[C@@H]2[C@H](O[C@@H]([C@@H]([C@H]2O)O)O)CO)O)O)O)O
  - spc_meso-butane-2-3-diol | meso-Butane-2,3-diol | O[C@H](C)[C@@H](O)C
  - spc_meso-tartaric-acid | (2R,3S)-2,3-Dihydroxybutanedioic acid | O[C@H](C(=O)O)[C@@H](O)C(=O)O
  - spc_methyl-alpha-d-glucopyranoside | Methyl α-D-glucopyranoside | OC[C@H]1O[C@H](OC)[C@H](O)[C@@H](O)[C@@H]1O
  - spc_methyl-beta-d-glucopyranoside | Methyl β-D-glucopyranoside | OC[C@H]1O[C@@H](OC)[C@H](O)[C@@H](O)[C@@H]1O
  - spc_saccharic-acid | Saccharic acid | OC(=O)C(O)C(O)C(O)C(O)C(=O)O
  - spc_sorbitol | Hexane-1,2,3,4,5,6-hexol | OCC(O)C(O)C(O)C(O)CO
  - spc_sucrose | Sucrose | C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O[C@]2([C@H]([C@@H]([C@H](O2)CO)O)O)CO)O)O)O)O
