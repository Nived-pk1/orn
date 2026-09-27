/** Demo reactions 7–11: HBr addition, SN2 vs E2, Cannizzaro, aldol and the haloform test. */
import type { Reaction } from './types';
import { rg, sp } from './kit';
import { reaction } from './reaction-kit';

const REGIO_GROUP = 'HBr addition regioisomers';

function hbrAddition(): Reaction[] {
  return [
    reaction({
      slug: 'propene-hbr', name: 'Propene + HBr', scope: 'specific',
      transformations: ['alkene-to-haloalkane'], types: ['electrophilic-addition'], mechClasses: ['ade'],
      concepts: ['markovnikov', 'carbocation-stability'], prerequisites: ['inductive-effect', 'hyperconjugation'],
      participants: [
        { ref: sp('propene'), role: 'reactant', primary: true },
        { ref: rg('hydrogen-bromide'), role: 'reagent' },
      ],
      outcomes: [
        { label: 'Markovnikov product', sel: 'major', group: REGIO_GROUP, regio: 'Markovnikov', products: [{ ref: sp('2-bromopropane') }], rationale: 'H adds to the carbon with more hydrogens; the more stable secondary carbocation forms.', concepts: ['markovnikov'] },
        { label: 'Anti-Markovnikov product', sel: 'minor', group: REGIO_GROUP, regio: 'anti-Markovnikov', products: [{ ref: sp('1-bromopropane') }] },
      ],
      reversibility: ['irreversible'],
    }),
    reaction({
      slug: 'propene-hbr-peroxide', name: 'Propene + HBr (peroxide)', scope: 'specific',
      named: ['kharasch'], transformations: ['alkene-to-haloalkane'], types: ['addition'], mechClasses: ['radical-addition'],
      concepts: ['anti-markovnikov'],
      participants: [
        { ref: sp('propene'), role: 'reactant', primary: true },
        { ref: rg('hydrogen-bromide'), role: 'reagent' },
        { ref: rg('benzoyl-peroxide'), role: 'initiator', qty: { qualifier: 'catalytic' } },
      ],
      stages: [{ kind: 'reaction', members: [0, 1, 2], params: { light: 'hv', other: ['peroxide present'] } }],
      outcomes: [
        { label: 'Anti-Markovnikov product', sel: 'major', group: REGIO_GROUP, regio: 'anti-Markovnikov', products: [{ ref: sp('1-bromopropane') }], rationale: 'A bromine radical adds first, giving the more stable secondary radical.' },
        { label: 'Markovnikov product', sel: 'minor', group: REGIO_GROUP, regio: 'Markovnikov', products: [{ ref: sp('2-bromopropane') }] },
      ],
      reversibility: ['irreversible'],
      limitations: 'Only HBr shows the peroxide effect; HCl and HI do not.',
    }),
  ];
}

function substitutionVsElimination(): Reaction[] {
  const haloalkane = { ref: sp('r-2-bromobutane'), role: 'reactant', primary: true, text: '(R)-2-bromobutane' } as const;
  return [
    reaction({
      slug: 'r-2-bromobutane-aq-koh', name: '(R)-2-Bromobutane + aq. KOH', scope: 'specific',
      transformations: ['haloalkane-to-alcohol'], types: ['nucleophilic-substitution'], mechClasses: ['sn2'], mechanisms: ['sn2-haloalkane'],
      concepts: ['inversion'],
      participants: [
        haloalkane,
        { ref: rg('koh'), role: 'reagent', profile: 'koh-aqueous', phase: 'aq', text: 'aq. KOH' },
      ],
      stages: [{ kind: 'reaction', members: [0, 1], params: { solventCharacter: ['aqueous'], medium: 'basic' } }],
      outcomes: [{
        sel: 'major', regio: 'substitution', products: [{ ref: sp('butan-2-ol-s') }],
        stereo: { outcome: 'inversion', descriptors: ['2S'], note: 'Backside attack inverts the stereocentre: R gives S.' },
        mechanism: { id: 'sn2-haloalkane', variant: 'sn2-concerted' }, concepts: ['inversion'],
      }],
      reversibility: ['irreversible'],
    }),
    reaction({
      slug: 'r-2-bromobutane-alc-koh', name: '(R)-2-Bromobutane + alc. KOH', scope: 'specific',
      transformations: ['haloalkane-to-alkene'], types: ['elimination'], mechClasses: ['e2'], mechanisms: ['e2-haloalkane'],
      concepts: ['saytzeff'],
      participants: [
        haloalkane,
        { ref: rg('koh'), role: 'reagent', profile: 'koh-alcoholic', phase: 'alc', text: 'alc. KOH' },
      ],
      stages: [{ kind: 'reaction', members: [0, 1], params: { solventCharacter: ['alcoholic'], medium: 'basic', temperature: { kind: 'qualitative', value: 'heat' } } }],
      outcomes: [
        { label: 'Saytzeff product', sel: 'major', group: 'Elimination regioisomers', regio: 'Saytzeff', products: [{ ref: sp('but-2-ene') }], mechanism: { id: 'e2-haloalkane', variant: 'e2-saytzeff' }, concepts: ['saytzeff'], rationale: 'The more substituted alkene is more stable.' },
        { label: 'Hofmann product', sel: 'minor', group: 'Elimination regioisomers', regio: 'Hofmann', products: [{ ref: sp('but-1-ene') }], mechanism: { id: 'e2-haloalkane', variant: 'e2-hofmann' } },
      ],
      reversibility: ['irreversible'],
    }),
  ];
}

function carbonylChemistry(): Reaction[] {
  return [
    reaction({
      slug: 'benzaldehyde-cannizzaro', name: 'Cannizzaro reaction of benzaldehyde', scope: 'specific',
      named: ['cannizzaro'], transformations: ['aldehyde-disproportionation'], types: ['disproportionation'], mechClasses: ['hydride-transfer'],
      participants: [
        { ref: sp('benzaldehyde'), role: 'reactant', coef: 2, primary: true },
        { ref: rg('naoh'), role: 'reagent', strength: 'concentrated', phase: 'aq' },
      ],
      stages: [{ kind: 'reaction', members: [0, 1], params: { medium: 'basic', solventCharacter: ['aqueous'] } }],
      outcomes: [{ sel: 'exclusive', products: [{ ref: sp('benzyl-alcohol') }, { ref: sp('sodium-benzoate') }] }],
      reversibility: ['irreversible'],
      limitations: 'Only aldehydes with no α-hydrogen; acidification of the sodium salt gives the carboxylic acid.',
      difficulty: 3,
    }),
    reaction({
      slug: 'ethanal-aldol', name: 'Aldol reaction of ethanal', scope: 'specific',
      named: ['aldol'], transformations: ['aldehyde-self-addition'], types: ['nucleophilic-addition'], mechClasses: ['adn'], mechanisms: ['aldol-ethanal'],
      concepts: ['alpha-hydrogen-acidity'],
      participants: [
        { ref: sp('ethanal'), role: 'reactant', coef: 2, primary: true },
        { ref: rg('naoh'), role: 'catalyst', strength: 'dilute', qty: { qualifier: 'catalytic' } },
        { ref: rg('hydronium'), role: 'catalyst', qty: { qualifier: 'catalytic' } },
      ],
      variants: [
        { label: 'Base-catalysed (dilute NaOH, cold)', params: { medium: 'basic', solventCharacter: ['aqueous'], temperature: { kind: 'qualitative', value: 'cold' } }, members: [1] },
        { label: 'Acid-catalysed', params: { medium: 'acidic', solventCharacter: ['aqueous'] }, members: [2] },
      ],
      outcomes: [
        { label: 'Aldol (base)', variants: [0], sel: 'major', products: [{ ref: sp('3-hydroxybutanal') }], mechanism: { id: 'aldol-ethanal', variant: 'aldol-base' } },
        { label: 'Aldol (acid)', variants: [1], sel: 'major', products: [{ ref: sp('3-hydroxybutanal') }], mechanism: { id: 'aldol-ethanal', variant: 'aldol-acid' } },
      ],
      reversibility: ['equilibrium', 'The aldol can revert (retro-aldol); heating leads on to but-2-enal.'],
      difficulty: 3,
    }),
  ];
}

function haloformTests(): Reaction[] {
  const iodine = (coef: number) => ({ ref: rg('iodine'), role: 'reagent', coef, flags: { contributesAtoms: true, consumed: true } }) as const;
  const alkali = (coef: number) => ({ ref: rg('naoh'), role: 'reagent', coef, flags: { contributesAtoms: true, consumed: true } }) as const;
  return [
    reaction({
      slug: 'haloform-ethanol', name: 'Iodoform test: ethanol', scope: 'specific', purposes: ['qualitative_test', 'distinction_test'],
      named: ['haloform'], transformations: ['methyl-carbonyl-to-haloform'], types: ['oxidation'], concepts: ['qualitative-tests'],
      participants: [{ ref: sp('ethanol'), role: 'reactant', coef: 1, primary: true }, iodine(4), alkali(6)],
      stages: [{ kind: 'reaction', members: [0, 1, 2], params: { temperature: { kind: 'qualitative', value: 'warm' }, medium: 'basic' } }],
      outcomes: [{ sel: 'major', products: [
        { ref: sp('iodoform'), coef: 1, phase: 's', note: 'Yellow precipitate with an antiseptic smell.' },
        { ref: sp('sodium-methanoate'), coef: 1 },
        { ref: sp('sodium-iodide'), role: 'coproduct', coef: 5 },
        { ref: sp('water'), role: 'byproduct', coef: 5 },
      ] }],
      reversibility: ['irreversible'],
      limitations: 'Ethanol is the only primary alcohol that responds: it is first oxidised to ethanal, a methyl carbonyl compound.',
    }),
    reaction({
      slug: 'haloform-propanone', name: 'Iodoform test: propanone', scope: 'specific', purposes: ['qualitative_test', 'distinction_test'],
      named: ['haloform'], transformations: ['methyl-carbonyl-to-haloform'], types: ['substitution'], concepts: ['qualitative-tests'],
      participants: [{ ref: sp('propanone'), role: 'reactant', coef: 1, primary: true }, iodine(3), alkali(4)],
      stages: [{ kind: 'reaction', members: [0, 1, 2], params: { temperature: { kind: 'qualitative', value: 'warm' }, medium: 'basic' } }],
      outcomes: [{ sel: 'major', products: [
        { ref: sp('iodoform'), coef: 1, phase: 's' },
        { ref: sp('sodium-ethanoate'), coef: 1 },
        { ref: sp('sodium-iodide'), role: 'coproduct', coef: 3 },
        { ref: sp('water'), role: 'byproduct', coef: 3 },
      ] }],
      reversibility: ['irreversible'],
    }),
  ];
}

export function reactionsB(): Reaction[] {
  return [...hbrAddition(), ...substitutionVsElimination(), ...carbonylChemistry(), ...haloformTests()];
}
