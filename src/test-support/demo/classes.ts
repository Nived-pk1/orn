/** Classes and hubs of the demo dataset (docs/TEST_STRATEGY.md §3): generic formulas only, never a structure. */
import type { ChemicalClass } from './types';
import { chemClass } from './kit';

/** Bodies of the classes that are navigator hubs, in display order. */
export const HUB_CLASSES = [
  'alkanes',
  'alkenes',
  'alkynes',
  'arenes',
  'haloalkanes',
  'haloarenes',
  'alcohols',
  'phenols',
  'ethers',
  'aldehydes',
  'ketones',
  'carboxylic-acids',
  'esters',
  'amines',
  'diazonium-salts',
] as const;

export function demoClasses(): ChemicalClass[] {
  return [
    chemClass('alkanes', 'Alkanes', 'homologous_series', {
      generalFormula: 'CnH2n+2', formulaText: 'R–H', examples: ['methane', 'ethane'],
      description: 'Saturated acyclic hydrocarbons.',
    }),
    chemClass('alkenes', 'Alkenes', 'homologous_series', {
      generalFormula: 'CnH2n', formulaText: 'R2C=CR2', examples: ['ethene', 'propene', 'but-1-ene', 'but-2-ene', 'cis-but-2-ene'],
      description: 'Hydrocarbons with a carbon–carbon double bond.',
    }),
    chemClass('alkynes', 'Alkynes', 'homologous_series', {
      generalFormula: 'CnH2n-2', formulaText: 'R–C≡C–R', examples: ['but-2-yne'],
      description: 'Hydrocarbons with a carbon–carbon triple bond.',
    }),
    chemClass('arenes', 'Arenes', 'structural_family', {
      formulaText: 'Ar–H', examples: ['benzene'], aliases: ['Aromatic hydrocarbons'],
      description: 'Hydrocarbons containing an aromatic ring.',
    }),
    chemClass('haloalkanes', 'Haloalkanes', 'compound_class', {
      formulaText: 'R–X', generalFormula: 'CnH2n+1X', aliases: ['Alkyl halides'],
      examples: ['1-bromopropane', '2-bromopropane', 'r-2-bromobutane'],
    }),
    chemClass('haloarenes', 'Haloarenes', 'compound_class', {
      formulaText: 'Ar–X', aliases: ['Aryl halides'], examples: ['chlorobenzene'],
    }),
    chemClass('alcohols', 'Alcohols', 'compound_class', {
      formulaText: 'R–OH', generalFormula: 'CnH2n+1OH', smarts: '[CX4][OX2H]',
      examples: ['ethanol', 'propan-2-ol', 'methylpropan-2-ol'],
      description: 'Compounds with a hydroxyl group on a saturated carbon.',
    }),
    chemClass('alcohols-primary', 'Primary alcohols', 'compound_class', {
      parents: ['alcohols'], formulaText: 'R–CH2OH', aliases: ['1° alcohols'], examples: ['ethanol', 'benzyl-alcohol'],
    }),
    chemClass('alcohols-secondary', 'Secondary alcohols', 'compound_class', {
      parents: ['alcohols'], formulaText: 'R2CH–OH', aliases: ['2° alcohols'], examples: ['propan-2-ol', 'butan-2-ol-s'],
    }),
    chemClass('alcohols-tertiary', 'Tertiary alcohols', 'compound_class', {
      parents: ['alcohols'], formulaText: 'R3C–OH', aliases: ['3° alcohols'], examples: ['methylpropan-2-ol'],
    }),
    chemClass('phenols', 'Phenols', 'compound_class', { formulaText: 'Ar–OH', examples: ['phenol'] }),
    chemClass('ethers', 'Ethers', 'compound_class', { formulaText: 'R–O–R′', examples: ['diethyl-ether'] }),
    chemClass('aldehydes', 'Aldehydes', 'compound_class', {
      formulaText: 'R–CHO', generalFormula: 'CnH2nO', examples: ['ethanal', 'benzaldehyde'],
    }),
    chemClass('ketones', 'Ketones', 'compound_class', {
      formulaText: 'R–CO–R′', examples: ['propanone', 'acetophenone'],
    }),
    chemClass('carboxylic-acids', 'Carboxylic acids', 'compound_class', {
      formulaText: 'R–COOH', examples: ['ethanoic-acid', 'palmitic-acid', 'lactic-acid'],
    }),
    chemClass('esters', 'Esters', 'compound_class', { formulaText: 'R–COOR′', examples: ['ethyl-ethanoate'] }),
    chemClass('amines', 'Amines', 'compound_class', {
      formulaText: 'R–NH2, R2NH, R3N', examples: ['aniline'],
    }),
    chemClass('diazonium-salts', 'Diazonium salts', 'compound_class', {
      formulaText: 'Ar–N2⁺ X⁻', examples: ['benzenediazonium-chloride'],
    }),
    chemClass('acyl-halides', 'Acyl halides', 'compound_class', { formulaText: 'R–COX', examples: ['acetyl-chloride'] }),
    chemClass('grignard-reagents', 'Grignard reagents', 'reagent_family', {
      formulaText: 'R–MgX', aliases: ['Organomagnesium halides'], examples: ['methylmagnesium-bromide'],
    }),
  ];
}
