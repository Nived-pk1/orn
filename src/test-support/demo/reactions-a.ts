/** Demo reactions 1–6 (docs/TEST_STRATEGY.md §3): oxidations, esterification, dehydration and hydration. */
import type { Reaction } from './types';
import { cl, kelvin, rg, sp } from './kit';
import { reaction, type StageSpec } from './reaction-kit';

export const GENERIC_PCC = 'alcohol1-to-aldehyde-pcc';

export function reactionsA(): Reaction[] {
  const pccStage: StageSpec[] = [{ kind: 'reaction', label: 'PCC, CH₂Cl₂', members: [0, 1, 2], params: { anhydrous: true, solventCharacter: ['polar_aprotic'] } }];
  return [
    // 1. generic and specific
    reaction({
      slug: GENERIC_PCC, name: '1° alcohol → aldehyde (PCC)', scope: 'generic', general: 'R–CH2OH → R–CHO',
      transformations: ['alcohol1-to-aldehyde'], types: ['oxidation'], concepts: ['oxidation'],
      participants: [
        { ref: cl('alcohols-primary'), role: 'reactant', primary: true },
        { ref: rg('pcc'), role: 'reagent' },
        { ref: sp('dichloromethane'), role: 'solvent', dry: true },
      ],
      stages: pccStage,
      outcomes: [{ sel: 'exclusive', products: [{ ref: cl('aldehydes') }] }],
      reversibility: ['irreversible'],
      studyNotes: 'PCC in anhydrous CH₂Cl₂ stops at the aldehyde; there is no water to form the hydrate that would be oxidised further.',
      difficulty: 2,
    }),
    reaction({
      slug: 'ethanol-to-ethanal-pcc', name: 'Ethanol → ethanal (PCC)', scope: 'specific', instanceOf: GENERIC_PCC,
      transformations: ['alcohol1-to-aldehyde'], types: ['oxidation'],
      participants: [
        { ref: sp('ethanol'), role: 'reactant', primary: true },
        { ref: rg('pcc'), role: 'reagent' },
        { ref: sp('dichloromethane'), role: 'solvent', dry: true },
      ],
      stages: pccStage,
      outcomes: [{ sel: 'exclusive', products: [{ ref: sp('ethanal') }] }],
      reversibility: ['irreversible'],
    }),
    // 2. branch and merge: A → B, B → C and A → C
    reaction({
      slug: 'ethanal-to-ethanoic-acid', name: 'Ethanal → ethanoic acid (acidified K₂Cr₂O₇)', scope: 'specific',
      transformations: ['aldehyde-to-acid'], types: ['oxidation'], concepts: ['oxidation'],
      participants: [
        { ref: sp('ethanal'), role: 'reactant', primary: true },
        { ref: rg('dichromate-acid'), role: 'reagent', profile: 'dichromate-reflux', text: 'acidified K₂Cr₂O₇' },
      ],
      stages: [{ kind: 'reaction', members: [0, 1], params: { medium: 'acidic', solventCharacter: ['aqueous'] } }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('ethanoic-acid') }] }],
      reversibility: ['irreversible'],
    }),
    reaction({
      slug: 'ethanol-to-ethanoic-acid', name: 'Ethanol → ethanoic acid (excess K₂Cr₂O₇/H⁺, reflux)', scope: 'specific',
      transformations: ['alcohol1-to-acid'], types: ['oxidation'],
      participants: [
        { ref: sp('ethanol'), role: 'reactant', primary: true },
        { ref: rg('dichromate-acid'), role: 'reagent', profile: 'dichromate-reflux', qty: { qualifier: 'excess' } },
      ],
      stages: [{ kind: 'reaction', members: [0, 1], params: { temperature: { kind: 'qualitative', value: 'reflux' }, medium: 'acidic' } }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('ethanoic-acid') }] }],
      reversibility: ['irreversible'],
    }),
    // 3. alternative to the PCC route (parallel A → B)
    reaction({
      slug: 'ethanol-to-ethanal-dichromate', name: 'Ethanol → ethanal (K₂Cr₂O₇/H⁺, distillation)', scope: 'specific',
      transformations: ['alcohol1-to-aldehyde'], types: ['oxidation'],
      participants: [
        { ref: sp('ethanol'), role: 'reactant', primary: true, qty: { qualifier: 'excess' } },
        { ref: rg('dichromate-acid'), role: 'reagent', profile: 'dichromate-distil', qty: { qualifier: 'limiting' } },
      ],
      stages: [{ kind: 'reaction', members: [0, 1], params: { temperature: { kind: 'qualitative', value: 'warm' }, medium: 'acidic' }, text: 'Distil the ethanal off as it forms' }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('ethanal') }] }],
      reversibility: ['irreversible'],
      limitations: 'The aldehyde is oxidised further unless it is distilled out of the mixture at once.',
    }),
    // 4. equilibrium pair
    reaction({
      slug: 'fischer-esterification', name: 'Fischer esterification: ethanoic acid + ethanol', scope: 'specific',
      named: ['fischer-esterification'], transformations: ['acid-alcohol-to-ester'], types: ['esterification'], concepts: ['equilibrium'],
      participants: [
        { ref: sp('ethanoic-acid'), role: 'reactant', primary: true },
        { ref: sp('ethanol'), role: 'reactant' },
        { ref: rg('sulfuric-acid'), role: 'catalyst', strength: 'concentrated', qty: { qualifier: 'catalytic' } },
      ],
      stages: [{ kind: 'reaction', members: [0, 1, 2], params: { temperature: { kind: 'qualitative', value: 'heat' }, medium: 'acidic' } }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('ethyl-ethanoate') }, { ref: sp('water'), role: 'byproduct' }] }],
      reversibility: ['equilibrium', 'Driven to the ester by excess alcohol or by removing water.'],
      studyNotes: 'The reverse reaction is acid-catalysed ester hydrolysis.',
    }),
    reaction({
      slug: 'ethyl-ethanoate-hydrolysis', name: 'Ester hydrolysis: ethyl ethanoate + water', scope: 'specific',
      transformations: ['ester-to-acid-alcohol'], types: ['hydrolysis'], concepts: ['equilibrium'],
      participants: [
        { ref: sp('ethyl-ethanoate'), role: 'reactant', primary: true },
        { ref: sp('water'), role: 'reactant', qty: { qualifier: 'excess' } },
        { ref: rg('hydronium'), role: 'catalyst', qty: { qualifier: 'catalytic' } },
      ],
      stages: [{ kind: 'reaction', members: [0, 1, 2], params: { temperature: { kind: 'qualitative', value: 'heat' }, medium: 'acidic', solventCharacter: ['aqueous'] } }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('ethanoic-acid') }, { ref: sp('ethanol') }] }],
      reversibility: ['equilibrium', 'Excess water pushes the equilibrium towards the acid and alcohol.'],
    }),
    // 5. condition variants: the same reagents, different temperature, different product
    reaction({
      slug: 'ethanol-conc-h2so4', name: 'Ethanol + conc. H₂SO₄', scope: 'specific',
      transformations: ['alcohol-to-ether', 'alcohol-to-alkene'], types: ['dehydration'], concepts: ['dehydration'],
      participants: [
        { ref: sp('ethanol'), role: 'reactant', primary: true },
        { ref: rg('sulfuric-acid'), role: 'reagent', strength: 'concentrated' },
      ],
      stages: [{ kind: 'reaction', members: [0, 1] }],
      variants: [
        { label: '413 K, excess ethanol', params: { temperature: kelvin(413) }, note: 'Two ethanol molecules lose one water.' },
        { label: '443 K, excess acid', params: { temperature: kelvin(443) }, note: 'Each ethanol loses one water.' },
      ],
      outcomes: [
        { label: 'Ether formation', variants: [0], sel: 'major', products: [{ ref: sp('diethyl-ether') }, { ref: sp('water'), role: 'byproduct' }] },
        { label: 'Alkene formation', variants: [1], sel: 'major', products: [{ ref: sp('ethene') }, { ref: sp('water'), role: 'byproduct' }] },
      ],
      reversibility: ['reversible_under_other_conditions', 'Ethene can be hydrated back to ethanol under other conditions.'],
    }),
    // 6. hydration of ethene
    reaction({
      slug: 'ethene-hydration', name: 'Acid-catalysed hydration of ethene', scope: 'specific', purposes: ['synthesis', 'industrial_process'],
      transformations: ['alkene-to-alcohol'], types: ['hydration'], mechClasses: ['ade'], concepts: ['hydration'],
      participants: [
        { ref: sp('ethene'), role: 'reactant', primary: true },
        { ref: sp('water'), role: 'reactant', phase: 'g' },
        { ref: rg('hydronium'), role: 'catalyst', text: 'H₃PO₄ catalyst', qty: { qualifier: 'catalytic' } },
      ],
      stages: [{ kind: 'reaction', members: [0, 1, 2], params: { temperature: kelvin(573), pressure: { kind: 'range', min: 60, max: 70, unit: 'atm' }, medium: 'acidic' } }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('ethanol') }] }],
      reversibility: ['equilibrium', 'The reverse is acid-catalysed dehydration of ethanol.'],
      limitations: 'Industrial conditions; in the laboratory the alkene is absorbed in cold conc. H₂SO₄ and the mixture is then diluted and warmed.',
    }),
  ];
}
