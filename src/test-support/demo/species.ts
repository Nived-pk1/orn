/**
 * Species of the demo dataset: organic substances first, then inorganic and reagent species, then the
 * deliberate edge records (docs/TEST_STRATEGY.md §3 "Edge records"). SMILES are entered by hand and are
 * unverified until a human reviews them; nothing here is marked `verified`.
 */
import type { Species } from './types';
import { species } from './kit';

const prop = (key: 'boiling_point' | 'physical_state' | 'acidity' | 'solubility', value: string) => ({
  key,
  value,
  citations: [],
});

function organic(): Species[] {
  return [
    species('methane', 'Methane', { smiles: 'C', formula: 'CH4', classes: ['alkanes'] }),
    species('ethane', 'Ethane', { smiles: 'CC', formula: 'C2H6', classes: ['alkanes'] }),
    species('ethene', 'Ethene', { smiles: 'C=C', formula: 'C2H4', classes: ['alkenes'], common: ['Ethylene'], properties: [prop('physical_state', 'Gas')] }),
    species('propene', 'Propene', { smiles: 'C=CC', formula: 'C3H6', classes: ['alkenes'], common: ['Propylene'] }),
    species('but-1-ene', 'But-1-ene', { smiles: 'C=CCC', formula: 'C4H8', classes: ['alkenes'] }),
    species('but-2-ene', 'But-2-ene', { smiles: 'CC=CC', formula: 'C4H8', classes: ['alkenes'], notes: 'Configuration unspecified: a mixture or unstated geometry.' }),
    species('cis-but-2-ene', '(Z)-But-2-ene', {
      smiles: 'C/C=C\\C', formula: 'C4H8', classes: ['alkenes'], common: ['cis-But-2-ene'],
      stereo: { kind: 'single_stereoisomer', descriptors: ['Z'] },
    }),
    species('but-2-yne', 'But-2-yne', { smiles: 'CC#CC', formula: 'C4H6', classes: ['alkynes'] }),
    species('benzene', 'Benzene', { smiles: 'c1ccccc1', formula: 'C6H6', classes: ['arenes'], aromaticity: 'aromatic', properties: [prop('boiling_point', '80 °C')] }),
    species('chlorobenzene', 'Chlorobenzene', { smiles: 'Clc1ccccc1', formula: 'C6H5Cl', classes: ['haloarenes'], aromaticity: 'aromatic' }),
    species('1-bromopropane', '1-Bromopropane', { smiles: 'CCCBr', formula: 'C3H7Br', classes: ['haloalkanes'] }),
    species('2-bromopropane', '2-Bromopropane', { smiles: 'CC(C)Br', formula: 'C3H7Br', classes: ['haloalkanes'], common: ['Isopropyl bromide'] }),
    species('r-2-bromobutane', '(R)-2-Bromobutane', {
      smiles: 'C[C@@H](Br)CC', formula: 'C4H9Br', classes: ['haloalkanes'],
      stereo: { kind: 'single_stereoisomer', descriptors: ['2R'] },
    }),
    species('iodoform', 'Iodoform', { smiles: 'IC(I)I', formula: 'CHI3', classes: ['haloalkanes'], common: ['Triiodomethane'], properties: [prop('physical_state', 'Yellow solid')] }),
    species('ethanol', 'Ethanol', {
      smiles: 'CCO', formula: 'C2H5OH', classes: ['alcohols-primary'], common: ['Ethyl alcohol'],
      properties: [prop('boiling_point', '78 °C'), prop('solubility', 'Miscible with water')],
    }),
    species('propan-2-ol', 'Propan-2-ol', { smiles: 'CC(C)O', formula: 'C3H8O', classes: ['alcohols-secondary'], common: ['Isopropyl alcohol'] }),
    species('methylpropan-2-ol', '2-Methylpropan-2-ol', { smiles: 'CC(C)(C)O', formula: 'C4H10O', classes: ['alcohols-tertiary'], common: ['tert-Butyl alcohol'] }),
    species('butan-2-ol-s', '(S)-Butan-2-ol', {
      smiles: 'CC[C@H](C)O', formula: 'C4H10O', classes: ['alcohols-secondary'],
      stereo: { kind: 'single_stereoisomer', descriptors: ['2S'] },
    }),
    species('ethane-1-2-diol', 'Ethane-1,2-diol', { smiles: 'OCCO', formula: 'C2H6O2', classes: ['alcohols-primary'], common: ['Ethylene glycol'] }),
    species('benzyl-alcohol', 'Benzyl alcohol', { smiles: 'OCc1ccccc1', formula: 'C7H8O', classes: ['alcohols-primary'], iupac: 'Phenylmethanol' }),
    species('phenol', 'Phenol', { smiles: 'Oc1ccccc1', formula: 'C6H5OH', classes: ['phenols'], aromaticity: 'aromatic', properties: [prop('acidity', 'Weakly acidic; more acidic than alcohols')] }),
    species('diethyl-ether', 'Diethyl ether', { smiles: 'CCOCC', formula: 'C4H10O', classes: ['ethers'], iupac: 'Ethoxyethane', properties: [prop('boiling_point', '35 °C')] }),
    species('ethanal', 'Ethanal', { smiles: 'CC=O', formula: 'CH3CHO', classes: ['aldehydes'], common: ['Acetaldehyde'], properties: [prop('boiling_point', '20 °C')] }),
    species('benzaldehyde', 'Benzaldehyde', { smiles: 'O=Cc1ccccc1', formula: 'C6H5CHO', classes: ['aldehydes'], aromaticity: 'aromatic' }),
    species('3-hydroxybutanal', '3-Hydroxybutanal', {
      smiles: 'CC(O)CC=O', formula: 'C4H8O2', classes: ['aldehydes'], common: ['Aldol'],
      stereo: { kind: 'racemic', descriptors: [] },
    }),
    species('propanone', 'Propanone', { smiles: 'CC(C)=O', formula: 'C3H6O', classes: ['ketones'], common: ['Acetone'], properties: [prop('boiling_point', '56 °C')] }),
    species('acetophenone', 'Acetophenone', { smiles: 'CC(=O)c1ccccc1', formula: 'C8H8O', classes: ['ketones'], iupac: '1-Phenylethan-1-one' }),
    species('ethanoic-acid', 'Ethanoic acid', { smiles: 'CC(=O)O', formula: 'CH3COOH', classes: ['carboxylic-acids'], common: ['Acetic acid'], aliases: ['AcOH', 'CH₃COOH'] }),
    species('lactic-acid', '2-Hydroxypropanoic acid', {
      smiles: 'CC(O)C(=O)O', formula: 'C3H6O3', classes: ['carboxylic-acids'], common: ['Lactic acid'],
      aliases: ['α-Hydroxypropanoic acid', 'C₃H₆O₃'], stereo: { kind: 'racemic', descriptors: [] },
    }),
    species('ethyl-ethanoate', 'Ethyl ethanoate', { smiles: 'CCOC(=O)C', formula: 'CH3COOC2H5', classes: ['esters'], common: ['Ethyl acetate'] }),
    species('aniline', 'Aniline', { smiles: 'Nc1ccccc1', formula: 'C6H5NH2', classes: ['amines'], iupac: 'Benzenamine', aromaticity: 'aromatic' }),
    species('benzenediazonium-chloride', 'Benzenediazonium chloride', {
      kind: 'salt', smiles: '[Cl-].N#[N+]c1ccccc1', formula: 'C6H5N2Cl', classes: ['diazonium-salts'],
      notes: 'Unstable above about 5 °C in solution; used as prepared.',
    }),
    species('acetyl-chloride', 'Acetyl chloride', { smiles: 'CC(=O)Cl', formula: 'CH3COCl', classes: ['acyl-halides'], iupac: 'Ethanoyl chloride' }),
    species('methylmagnesium-bromide', 'Methylmagnesium bromide', { smiles: 'C[Mg]Br', formula: 'CH3MgBr', classes: ['grignard-reagents'] }),
    species('sodium-benzoate', 'Sodium benzoate', { kind: 'salt', smiles: '[Na+].[O-]C(=O)c1ccccc1', formula: 'C6H5COONa' }),
    species('sodium-ethanoate', 'Sodium ethanoate', { kind: 'salt', smiles: '[Na+].CC(=O)[O-]', formula: 'CH3COONa', common: ['Sodium acetate'] }),
    species('sodium-methanoate', 'Sodium methanoate', { kind: 'salt', smiles: '[Na+].[O-]C=O', formula: 'HCOONa', common: ['Sodium formate'] }),
    species('quinoline', 'Quinoline', { smiles: 'c1ccc2ncccc2c1', formula: 'C9H7N', aromaticity: 'aromatic' }),
    species('dichloromethane', 'Dichloromethane', { smiles: 'ClCCl', formula: 'CH2Cl2', common: ['DCM'] }),
    species('cyclohexanone-oxime', 'Cyclohexanone oxime', { smiles: 'ON=C1CCCCC1', formula: 'C6H11NO' }),
    species('caprolactam', 'ε-Caprolactam', { smiles: 'O=C1CCCCCN1', formula: 'C6H11NO', iupac: 'Azepan-2-one', aliases: ['epsilon-Caprolactam'] }),
  ];
}

function inorganic(): Species[] {
  return [
    species('water', 'Water', { smiles: 'O', formula: 'H2O', properties: [prop('physical_state', 'Liquid')] }),
    species('hydrogen', 'Hydrogen', { kind: 'element', smiles: '[H][H]', formula: 'H2' }),
    species('nitrogen', 'Nitrogen', { kind: 'element', smiles: 'N#N', formula: 'N2' }),
    species('iodine', 'Iodine', { kind: 'element', smiles: 'II', formula: 'I2' }),
    species('palladium', 'Palladium', { kind: 'element', smiles: '[Pd]', formula: 'Pd' }),
    species('hydrogen-chloride', 'Hydrogen chloride', { smiles: 'Cl', formula: 'HCl' }),
    species('hydrogen-bromide', 'Hydrogen bromide', { smiles: 'Br', formula: 'HBr' }),
    species('hydronium', 'Hydronium ion', { kind: 'ion', smiles: '[OH3+]', formula: 'H3O+', charge: 1, aliases: ['H₃O⁺'] }),
    species('sulfuric-acid', 'Sulfuric acid', { smiles: 'OS(=O)(=O)O', formula: 'H2SO4' }),
    species('nitric-acid', 'Nitric acid', { smiles: 'O[N+](=O)[O-]', formula: 'HNO3' }),
    species('sodium-hydroxide', 'Sodium hydroxide', { kind: 'salt', smiles: '[Na+].[OH-]', formula: 'NaOH' }),
    species('potassium-hydroxide', 'Potassium hydroxide', { kind: 'salt', smiles: '[K+].[OH-]', formula: 'KOH' }),
    species('sodium-iodide', 'Sodium iodide', { kind: 'salt', smiles: '[Na+].[I-]', formula: 'NaI' }),
    species('sodium-nitrite', 'Sodium nitrite', { kind: 'salt', smiles: '[Na+].[O-]N=O', formula: 'NaNO2' }),
    species('copper-i-chloride', 'Copper(I) chloride', { kind: 'salt', smiles: 'Cl[Cu]', formula: 'CuCl' }),
    species('calcium-carbonate', 'Calcium carbonate', { kind: 'salt', smiles: '[Ca+2].[O-]C([O-])=O', formula: 'CaCO3' }),
    species('potassium-dichromate', 'Potassium dichromate', {
      kind: 'salt', smiles: '[K+].[K+].[O-][Cr](=O)(=O)O[Cr](=O)(=O)[O-]', formula: 'K2Cr2O7',
    }),
    species('potassium-permanganate', 'Potassium permanganate', { kind: 'salt', smiles: '[K+].[O-][Mn](=O)(=O)=O', formula: 'KMnO4' }),
    species('manganese-dioxide', 'Manganese dioxide', { kind: 'unspecified', smiles: 'O=[Mn]=O', formula: 'MnO2' }),
    species('aluminium-chloride', 'Aluminium chloride', { smiles: 'Cl[Al](Cl)Cl', formula: 'AlCl3', properties: [prop('physical_state', 'Solid; moisture sensitive')] }),
    species('pcc', 'Pyridinium chlorochromate', {
      kind: 'salt', smiles: 'O=[Cr](=O)(Cl)[O-].c1cc[nH+]cc1', formula: 'C5H6NCrO3Cl', aliases: ['PCC'],
    }),
    species('benzoyl-peroxide', 'Benzoyl peroxide', { smiles: 'O=C(OOC(=O)c1ccccc1)c1ccccc1', formula: 'C14H10O4' }),
  ];
}

/** Edge records: an unparsable structure, a species with no structure and a very long IUPAC name. */
function edges(): Species[] {
  return [
    species('invalid-smiles-demo', 'Unparsable structure (demo record)', {
      smiles: 'C1CC(', status: 'review_required',
      reasons: ['Structure is deliberately unparsable: exercises CHEM-001 when the chemistry worker exists (phase 4).'],
    }),
    species('cholesterol', 'Cholesterol', {
      formula: 'C27H46O', status: 'review_required',
      iupac:
        '(3S,8S,9S,10R,13R,14S,17R)-10,13-dimethyl-17-[(2R)-6-methylheptan-2-yl]-2,3,4,7,8,9,11,12,14,15,16,17-dodecahydro-1H-cyclopenta[a]phenanthren-3-ol',
      reasons: ['Deliberately has a very long IUPAC name and no structure; the name is entered from memory and needs checking.'],
    }),
    species('palmitic-acid', 'Palmitic acid', {
      smiles: `${'C'.repeat(16)}(=O)O`, formula: 'C16H32O2', classes: ['carboxylic-acids'], iupac: 'Hexadecanoic acid',
      notes: 'Long unbranched chain: exercises structure depiction of long chains.',
    }),
  ];
}

export function demoSpecies(): Species[] {
  return [...organic(), ...inorganic(), ...edges()];
}
