/** Demo reactions 12–17: diazonium chemistry, Grignard, Lindlar, Friedel–Crafts, Baeyer, Beckmann, and a draft. */
import type { Reaction } from './types';
import { celsiusRange, rg, sp } from './kit';
import { reaction, type StageSpec } from './reaction-kit';

function diazoniumChemistry(): Reaction[] {
  return [
    reaction({
      slug: 'aniline-diazotisation', name: 'Diazotisation of aniline', scope: 'specific',
      named: ['diazotisation'], transformations: ['amine-to-diazonium'], types: ['diazotisation'], concepts: ['diazotisation'],
      participants: [
        { ref: sp('aniline'), role: 'reactant', primary: true },
        { ref: rg('sodium-nitrite'), role: 'reagent' },
        { ref: rg('hydrogen-chloride'), role: 'reagent', qty: { qualifier: 'excess' } },
      ],
      stages: [{ kind: 'reaction', members: [0, 1, 2], params: { temperature: celsiusRange(0, 5), medium: 'acidic', solventCharacter: ['aqueous'] } }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('benzenediazonium-chloride') }, { ref: sp('water'), role: 'byproduct', coef: 2 }] }],
      reversibility: ['irreversible'],
      limitations: 'Above about 5 °C the diazonium salt decomposes; use it at once.',
      difficulty: 3,
    }),
    reaction({
      slug: 'benzenediazonium-sandmeyer', name: 'Sandmeyer reaction: benzenediazonium chloride → chlorobenzene', scope: 'specific',
      named: ['sandmeyer'], transformations: ['diazonium-to-haloarene'], types: ['substitution'],
      participants: [
        { ref: sp('benzenediazonium-chloride'), role: 'reactant', primary: true },
        { ref: rg('copper-i-chloride'), role: 'catalyst', qty: { qualifier: 'catalytic' } },
        { ref: rg('hydrogen-chloride'), role: 'reagent' },
      ],
      outcomes: [{ sel: 'major', products: [{ ref: sp('chlorobenzene') }, { ref: sp('nitrogen'), role: 'byproduct', phase: 'g' }] }],
      reversibility: ['irreversible'],
      difficulty: 3,
    }),
    reaction({
      slug: 'benzenediazonium-to-phenol', name: 'Benzenediazonium chloride → phenol', scope: 'specific',
      transformations: ['diazonium-to-phenol'], types: ['substitution', 'hydrolysis'],
      participants: [
        { ref: sp('benzenediazonium-chloride'), role: 'reactant', primary: true },
        { ref: sp('water'), role: 'reactant', phase: 'l' },
      ],
      stages: [{ kind: 'reaction', members: [0, 1], params: { temperature: { kind: 'qualitative', value: 'warm' }, solventCharacter: ['aqueous'] } }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('phenol') }, { ref: sp('nitrogen'), role: 'byproduct', phase: 'g' }, { ref: sp('hydrogen-chloride'), role: 'coproduct' }] }],
      reversibility: ['irreversible'],
      studyNotes: 'Taught in both the amines and the phenols chapters.',
    }),
  ];
}

const grignardStages = (): StageSpec[] => [
  { kind: 'reaction', label: '1. CH₃MgBr, dry ether', members: [0, 1, 2], params: { anhydrous: true, solventCharacter: ['ethereal'] } },
  { kind: 'workup', label: '2. H₃O⁺ work-up', members: [3], params: { medium: 'acidic', solventCharacter: ['aqueous'] } },
];

function grignard(): Reaction[] {
  const participants = (carbonyl: string) => [
    { ref: sp('methylmagnesium-bromide'), role: 'reactant', coef: 1 },
    { ref: sp(carbonyl), role: 'reactant', primary: true },
    { ref: sp('diethyl-ether'), role: 'solvent', dry: true },
    { ref: rg('hydronium'), role: 'workup_reagent' },
  ] as const;
  return [
    reaction({
      slug: 'methylmgbr-propanone', name: 'CH₃MgBr + propanone, then H₃O⁺', scope: 'specific',
      named: ['grignard'], transformations: ['carbonyl-to-alcohol3'], types: ['nucleophilic-addition'], mechClasses: ['adn'],
      participants: [...participants('propanone')], stages: grignardStages(),
      outcomes: [{ sel: 'exclusive', products: [{ ref: sp('methylpropan-2-ol') }] }],
      reversibility: ['irreversible'], difficulty: 3,
    }),
    reaction({
      slug: 'methylmgbr-ethanal', name: 'CH₃MgBr + ethanal, then H₃O⁺', scope: 'specific',
      named: ['grignard'], transformations: ['aldehyde-to-alcohol2'], types: ['nucleophilic-addition'], mechClasses: ['adn'],
      participants: [...participants('ethanal')], stages: grignardStages(),
      outcomes: [{ sel: 'exclusive', products: [{ ref: sp('propan-2-ol') }] }],
      reversibility: ['irreversible'], difficulty: 3,
    }),
  ];
}

function otherReactions(): Reaction[] {
  return [
    reaction({
      slug: 'but-2-yne-lindlar', name: 'But-2-yne + H₂ (Lindlar)', scope: 'specific',
      named: ['lindlar'], transformations: ['alkyne-to-alkene'], types: ['reduction'], concepts: ['syn-addition'],
      participants: [
        { ref: sp('but-2-yne'), role: 'reactant', primary: true },
        { ref: sp('hydrogen'), role: 'reactant', coef: 1, phase: 'g' },
        { ref: rg('lindlar'), role: 'catalyst', qty: { qualifier: 'catalytic' } },
      ],
      stages: [{ kind: 'reaction', members: [0, 1, 2], params: { atmosphere: 'hydrogen' } }],
      outcomes: [{ sel: 'exclusive', products: [{ ref: sp('cis-but-2-ene') }], stereo: { outcome: 'syn_addition', descriptors: ['Z'], note: 'Both hydrogens add to the same face of the triple bond.' } }],
      reversibility: ['irreversible'],
      limitations: 'The poisoned catalyst stops at the alkene; ordinary Pd/C goes on to the alkane.',
    }),
    reaction({
      slug: 'benzene-friedel-crafts-acylation', name: 'Friedel–Crafts acylation of benzene', scope: 'specific',
      named: ['friedel-crafts-acylation'], transformations: ['arene-to-ketone'], types: ['electrophilic-aromatic-substitution'], mechClasses: ['sear-mechanism'],
      participants: [
        { ref: sp('benzene'), role: 'reactant', primary: true },
        { ref: sp('acetyl-chloride'), role: 'reactant' },
        { ref: rg('aluminium-chloride'), role: 'reagent', dry: true, qty: { qualifier: 'stoichiometric' }, flags: { consumed: true }, note: 'Used up: it binds to the ketone product, so it is not a catalyst here.' },
      ],
      stages: [{ kind: 'reaction', members: [0, 1, 2], params: { anhydrous: true } }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('acetophenone') }, { ref: sp('hydrogen-chloride'), role: 'coproduct' }] }],
      reversibility: ['irreversible'],
    }),
    reaction({
      slug: 'ethene-baeyers', name: "Ethene + Baeyer's reagent", scope: 'specific', purposes: ['synthesis', 'qualitative_test'],
      named: ['baeyers-test'], transformations: ['alkene-to-diol'], types: ['hydroxylation', 'oxidation'], concepts: ['syn-addition', 'qualitative-tests'],
      participants: [
        { ref: sp('ethene'), role: 'reactant', primary: true },
        { ref: rg('potassium-permanganate'), role: 'reagent', profile: 'baeyers', strength: 'dilute', text: "cold, dilute, alkaline KMnO₄" },
      ],
      stages: [{ kind: 'reaction', members: [0, 1], params: { temperature: { kind: 'qualitative', value: 'cold' }, medium: 'basic', solventCharacter: ['aqueous'] } }],
      outcomes: [{ sel: 'major', products: [{ ref: sp('ethane-1-2-diol') }, { ref: sp('manganese-dioxide'), role: 'byproduct', note: 'Brown precipitate; the purple colour fades.' }], stereo: { outcome: 'no_new_stereocentre', descriptors: [] } }],
      reversibility: ['irreversible'],
    }),
    reaction({
      slug: 'cyclohexanone-oxime-beckmann', name: 'Beckmann rearrangement of cyclohexanone oxime', scope: 'specific',
      named: ['beckmann'], types: ['rearrangement'],
      participants: [
        { ref: sp('cyclohexanone-oxime'), role: 'reactant', primary: true },
        { ref: rg('sulfuric-acid'), role: 'reagent', strength: 'concentrated' },
      ],
      outcomes: [{ sel: 'major', products: [{ ref: sp('caprolactam') }] }],
      reversibility: ['irreversible'],
      difficulty: 4,
      status: 'review_required',
      reasons: ['Deliberately unanchored (no class on its species) and mapped outside JEE Main scope; scope is unverified.'],
    }),
    reaction({
      slug: 'benzene-nitration-draft', name: 'Nitration of benzene (draft)', scope: 'specific', lifecycle: 'draft',
      types: ['electrophilic-aromatic-substitution'],
      participants: [
        { ref: sp('benzene'), role: 'reactant', primary: true },
        { ref: rg('nitrating-mixture'), role: 'reagent' },
      ],
      outcomes: [],
      reversibility: ['unknown'],
      notes: 'Draft with no product yet: exercises RXN-002 at draft severity.',
    }),
  ];
}

export function reactionsC(): Reaction[] {
  return [...diazoniumChemistry(), ...grignard(), ...otherReactions()];
}
