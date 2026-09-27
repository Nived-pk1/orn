/** Reagents of the demo dataset, including mixtures with components (Lindlar) and profiles (Baeyer's). */
import type { Reagent } from './types';
import { conditions, ident, reagent, sp } from './kit';

const profile = (body: string, label: string, parameters: ReturnType<typeof conditions>, behaviour?: string, aliases: string[] = []) => ({
  id: ident<Reagent['profiles'][number]['id']>('rpf', body),
  label,
  aliases,
  parameters,
  ...(behaviour === undefined ? {} : { behaviour }),
});

export function demoReagents(): Reagent[] {
  return [
    reagent('pcc', 'PCC', {
      species: 'pcc', families: ['oxidant'], formulaText: 'C₅H₅NH⁺ CrO₃Cl⁻',
      description: 'Pyridinium chlorochromate: a mild, anhydrous oxidant.',
    }),
    reagent('dichromate-acid', 'Acidified potassium dichromate', {
      components: [
        { ref: sp('potassium-dichromate'), role: 'active' },
        { ref: sp('sulfuric-acid'), role: 'active', amountText: 'dilute' },
      ],
      formulaText: 'K₂Cr₂O₇ / H⁺', families: ['oxidant'], aliases: ['K₂Cr₂O₇/H⁺', 'Acidified dichromate'],
      profiles: [
        profile('dichromate-distil', 'Warm, aldehyde distilled off', conditions({ temperature: { kind: 'qualitative', value: 'warm' }, medium: 'acidic', solventCharacter: ['aqueous'] }), 'Limited oxidant with the product removed as it forms.'),
        profile('dichromate-reflux', 'Excess, under reflux', conditions({ temperature: { kind: 'qualitative', value: 'reflux' }, medium: 'acidic', solventCharacter: ['aqueous'] }), 'Oxidises to the carboxylic acid.'),
      ],
    }),
    reagent('sulfuric-acid', 'Sulfuric acid', {
      species: 'sulfuric-acid', families: ['acid', 'dehydrating_agent'], formulaText: 'H₂SO₄',
      description: 'Used concentrated as a dehydrating agent and acid catalyst.',
    }),
    reagent('hydronium', 'Acid (H⁺)', {
      species: 'hydronium', families: ['acid', 'catalyst'], formulaText: 'H⁺ / H₃O⁺', aliases: ['H⁺', 'H₃O⁺', 'Dilute acid'],
    }),
    reagent('hydrogen-chloride', 'Hydrochloric acid', { species: 'hydrogen-chloride', families: ['acid'], formulaText: 'HCl' }),
    reagent('hydrogen-bromide', 'Hydrogen bromide', { species: 'hydrogen-bromide', families: ['acid', 'electrophile'], formulaText: 'HBr' }),
    reagent('benzoyl-peroxide', 'Benzoyl peroxide', { species: 'benzoyl-peroxide', families: ['radical_initiator'], aliases: ['Peroxide'] }),
    reagent('koh', 'Potassium hydroxide', {
      species: 'potassium-hydroxide', families: ['base', 'nucleophile'], formulaText: 'KOH',
      description: 'One reagent, two ways of using it: aqueous KOH substitutes, alcoholic KOH eliminates.',
      profiles: [
        profile('koh-aqueous', 'Aqueous KOH', conditions({ solventCharacter: ['aqueous'], medium: 'basic' }), 'Hydroxide acts mainly as a nucleophile.', ['aq. KOH']),
        profile('koh-alcoholic', 'Alcoholic KOH', conditions({ solventCharacter: ['alcoholic'], medium: 'basic', temperature: { kind: 'qualitative', value: 'heat' } }), 'The alkoxide/hydroxide acts mainly as a base.', ['alc. KOH']),
      ],
    }),
    reagent('naoh', 'Sodium hydroxide', { species: 'sodium-hydroxide', families: ['base'], formulaText: 'NaOH' }),
    reagent('iodine', 'Iodine', { species: 'iodine', families: ['halogenating_agent'], formulaText: 'I₂' }),
    reagent('potassium-permanganate', 'Potassium permanganate', {
      species: 'potassium-permanganate', families: ['oxidant', 'test_reagent'], formulaText: 'KMnO₄',
      profiles: [
        profile('baeyers', "Baeyer's reagent", conditions({ temperature: { kind: 'qualitative', value: 'cold' }, medium: 'basic', solventCharacter: ['aqueous'], text: 'Cold, dilute, alkaline' }), 'Hydroxylates C=C; the purple colour fades and brown MnO₂ forms.', ["Cold dilute alkaline KMnO₄"]),
        profile('permanganate-hot', 'Hot, concentrated', conditions({ temperature: { kind: 'value', value: 80, unit: 'C' }, medium: 'acidic' }), 'Cleaves C=C to carbonyl compounds and acids.'),
      ],
    }),
    reagent('lindlar', "Lindlar's catalyst", {
      components: [
        { ref: sp('palladium'), role: 'active' },
        { ref: sp('calcium-carbonate'), role: 'support' },
        { ref: sp('quinoline'), role: 'poison' },
      ],
      formulaText: 'Pd/CaCO₃, quinoline', families: ['catalyst', 'reductant'],
      description: 'A poisoned palladium catalyst: hydrogenation stops at the alkene.',
    }),
    reagent('aluminium-chloride', 'Aluminium chloride', { species: 'aluminium-chloride', families: ['lewis_acid'], formulaText: 'AlCl₃', aliases: ['Anhydrous AlCl₃'] }),
    reagent('sodium-nitrite', 'Sodium nitrite', { species: 'sodium-nitrite', families: ['diazotising_agent'], formulaText: 'NaNO₂' }),
    reagent('copper-i-chloride', 'Copper(I) chloride', { species: 'copper-i-chloride', families: ['catalyst'], formulaText: 'CuCl' }),
    reagent('nitrating-mixture', 'Nitrating mixture', {
      components: [{ ref: sp('nitric-acid'), role: 'active' }, { ref: sp('sulfuric-acid'), role: 'active' }],
      formulaText: 'conc. HNO₃ + conc. H₂SO₄', families: ['electrophile', 'acid'],
    }),
  ];
}
