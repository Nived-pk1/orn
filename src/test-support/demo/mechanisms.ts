/**
 * Mechanisms of the demo dataset: SN2, E2 (two variants) and the aldol reaction (base- and acid-catalysed
 * variants). Structures carry atom maps so bonds and curved arrows can be expressed precisely; atom maps
 * are unique within one step.
 */
import type { Mechanism, MechanismStep, MechanismVariant } from './types';
import { cptId, ident, meta, smiles } from './kit';

type Site = { kind: 'atom' | 'lone_pair' | 'radical'; atom: number } | { kind: 'bond'; atoms: [number, number] };
const lp = (atom: number): Site => ({ kind: 'lone_pair', atom });
const bond = (a: number, b: number): Site => ({ kind: 'bond', atoms: [a, b] });
const move = (from: Site, to: Site) => ({ from, to, electrons: 2 as const });
const change = (a: number, b: number, order?: 1 | 2 | 3) => ({ atoms: [a, b] as [number, number], ...(order === undefined ? {} : { order }) });

type Species = MechanismStep['species'][number];
const struct = (role: Species['role'], value: string, label?: string): Species => ({ role, structure: smiles(value), ...(label === undefined ? {} : { label }) });
const named = (role: Species['role'], label: string): Species => ({ role, label });

interface StepSpec {
  readonly body: string;
  readonly title: string;
  readonly kinds: MechanismStep['stepKinds'];
  readonly description?: string;
  readonly species: readonly Species[];
  readonly formed?: readonly ReturnType<typeof change>[];
  readonly broken?: readonly ReturnType<typeof change>[];
  readonly moves?: readonly ReturnType<typeof move>[];
  readonly rds?: boolean;
  readonly reversible?: boolean;
  readonly event?: string;
}

const step = (s: StepSpec): MechanismStep => ({
  id: ident<MechanismStep['id']>('mst', s.body),
  title: s.title,
  stepKinds: [...s.kinds],
  ...(s.description === undefined ? {} : { description: s.description }),
  species: [...s.species],
  bondsFormed: [...(s.formed ?? [])],
  bondsBroken: [...(s.broken ?? [])],
  electronMovements: [...(s.moves ?? [])],
  ...(s.rds === undefined ? {} : { isRateDetermining: s.rds }),
  ...(s.reversible === undefined ? {} : { reversible: s.reversible }),
  ...(s.event === undefined ? {} : { stereochemicalEvent: s.event }),
});

const variant = (body: string, label: string, steps: MechanismStep[], o: { applicability?: string; rateLaw?: string } = {}): MechanismVariant => ({
  id: ident<MechanismVariant['id']>('mvr', body),
  label,
  ...(o.applicability === undefined ? {} : { applicability: o.applicability }),
  steps,
  ...(o.rateLaw === undefined ? {} : { rateLaw: o.rateLaw }),
});

const mechanism = (
  body: string,
  name: string,
  classes: readonly string[],
  variants: MechanismVariant[],
  o: { summary?: string; concepts?: readonly string[] } = {},
): Mechanism => ({
  id: ident<Mechanism['id']>('mec', body),
  kind: 'mechanism',
  name,
  aliases: [],
  mechanismClasses: classes.map((c) => ({ conceptId: cptId(c), certainty: 'definite' as const })),
  ...(o.summary === undefined ? {} : { summary: o.summary }),
  variants,
  conceptIds: (o.concepts ?? []).map(cptId),
  ...meta({ status: 'review_required', reasons: ['Mechanism steps and atom maps were entered by hand; verify before marking verified.'] }),
});

function sn2(): Mechanism {
  return mechanism('sn2-haloalkane', 'SN2 substitution of a haloalkane', ['sn2'], [
    variant('sn2-concerted', 'Concerted backside attack', [
      step({
        body: 'sn2-concerted-1', title: 'Hydroxide attacks the carbon opposite the leaving group',
        kinds: ['nucleophilic_attack', 'leaving_group_departure'], rds: true, reversible: false, event: 'Inversion of configuration',
        species: [
          struct('reagent', '[OH-:1]', 'Hydroxide'),
          struct('reactant', 'C[C@@H:2]([Br:3])CC', '(R)-2-Bromobutane'),
          struct('product', 'CC[C@H:2](C)[OH:1]', '(S)-Butan-2-ol'),
          struct('leaving_group', '[Br-:3]', 'Bromide'),
        ],
        formed: [change(1, 2, 1)], broken: [change(2, 3, 1)],
        moves: [move(lp(1), bond(1, 2)), move(bond(2, 3), lp(3))],
      }),
    ], { applicability: 'Primary and secondary haloalkanes with a good nucleophile in a polar protic or aprotic solvent.', rateLaw: 'rate = k[RX][Nu⁻]' }),
  ], { summary: 'One concerted step: the nucleophile enters from the side opposite the leaving group.', concepts: ['inversion'] });
}

function e2(): Mechanism {
  const elimination = (body: string, label: string, applicability: string, reactant: string, alkene: string, title: string): MechanismVariant =>
    variant(body, label, [
      step({
        body: `${body}-1`, title, kinds: ['proton_transfer', 'elimination', 'leaving_group_departure'], rds: true, reversible: false,
        description: 'Base removes the β-hydrogen while the C=C forms and the halide leaves, all in one step, anti-periplanar.',
        species: [
          struct('reagent', '[OH-:1]', 'Base'),
          struct('reactant', reactant, '2-Bromobutane'),
          struct('product', alkene),
          struct('product', '[H:2][OH:1]', 'Water'),
          struct('leaving_group', '[Br-:5]', 'Bromide'),
        ],
        formed: [change(1, 2, 1), change(3, 4, 2)], broken: [change(2, 3, 1), change(4, 5, 1)],
        moves: [move(lp(1), bond(1, 2)), move(bond(2, 3), bond(3, 4)), move(bond(4, 5), lp(5))],
      }),
    ], { applicability, rateLaw: 'rate = k[RX][base]' });
  return mechanism('e2-haloalkane', 'E2 elimination of a haloalkane', ['e2'], [
    elimination('e2-saytzeff', 'Saytzeff elimination (small base)', 'Small base such as ethoxide or hydroxide in alcohol: the more substituted alkene is major.', '[H:2][CH:3](C)[CH:4](C)[Br:5]', 'C[CH:3]=[CH:4]C', 'β-Hydrogen removed from the more substituted carbon'),
    elimination('e2-hofmann', 'Hofmann-type elimination (bulky base)', 'Bulky base or poor leaving group: the less substituted alkene can predominate.', '[H:2][CH2:3][CH:4]([Br:5])CC', '[CH2:3]=[CH:4]CC', 'β-Hydrogen removed from the less hindered carbon'),
  ], { summary: 'One concerted step: base removes a β-hydrogen as the halide leaves.', concepts: ['saytzeff'] });
}

function aldol(): Mechanism {
  const base = variant('aldol-base', 'Base-catalysed', [
    step({
      body: 'aldol-base-1', title: 'Hydroxide removes an α-hydrogen to give the enolate', kinds: ['proton_transfer'], reversible: true,
      species: [struct('reagent', '[OH-:1]', 'Hydroxide'), struct('reactant', '[H:2][CH2:3][CH:4]=[O:5]', 'Ethanal'), struct('intermediate', '[CH2:3]=[CH:4][O-:5]', 'Enolate'), struct('product', '[H:2][OH:1]', 'Water')],
      formed: [change(1, 2, 1)], broken: [change(2, 3, 1)],
      moves: [move(lp(1), bond(1, 2)), move(bond(2, 3), bond(3, 4)), move(bond(4, 5), lp(5))],
    }),
    step({
      body: 'aldol-base-2', title: 'Enolate carbon attacks a second ethanal', kinds: ['nucleophilic_attack', 'bond_formation'], rds: true, reversible: true,
      species: [struct('intermediate', '[CH2:3]=[CH:4][O-:5]', 'Enolate'), struct('reactant', '[CH3:6][CH:7]=[O:8]', 'Ethanal'), struct('intermediate', '[O-:8][CH:7]([CH3:6])[CH2:3][CH:4]=[O:5]', 'Alkoxide')],
      formed: [change(3, 7, 1)],
      moves: [move(lp(5), bond(4, 5)), move(bond(3, 4), bond(3, 7)), move(bond(7, 8), lp(8))],
    }),
    step({
      body: 'aldol-base-3', title: 'Alkoxide is protonated by water', kinds: ['proton_transfer'], reversible: true,
      species: [struct('intermediate', '[O-:8][CH:7]([CH3:6])[CH2:3][CH:4]=[O:5]', 'Alkoxide'), struct('reagent', '[H:9][OH:10]', 'Water'), struct('product', '[H:9][O:8][CH:7]([CH3:6])[CH2:3][CH:4]=[O:5]', '3-Hydroxybutanal'), struct('catalyst', '[OH-:10]', 'Hydroxide (regenerated)')],
      formed: [change(8, 9, 1)], broken: [change(9, 10, 1)],
      moves: [move(lp(8), bond(8, 9)), move(bond(9, 10), lp(10))],
    }),
  ], { applicability: 'Dilute alkali, low temperature: the aldol is isolated.' });
  const acid = variant('aldol-acid', 'Acid-catalysed', [
    step({ body: 'aldol-acid-1', title: 'Carbonyl oxygen is protonated', kinds: ['proton_transfer'], reversible: true, species: [named('reagent', 'H₃O⁺'), named('reactant', 'Ethanal'), named('intermediate', 'Protonated ethanal')] }),
    step({ body: 'aldol-acid-2', title: 'Enol forms by loss of an α-hydrogen', kinds: ['tautomerisation'], reversible: true, species: [named('intermediate', 'Protonated ethanal'), named('intermediate', 'Enol (ethenol)')] }),
    step({
      body: 'aldol-acid-3', title: 'Enol attacks a protonated ethanal', kinds: ['nucleophilic_attack', 'bond_formation'], rds: true, reversible: true,
      species: [struct('intermediate', '[CH2:1]=[CH:2][OH:3]', 'Enol'), struct('reactant', '[CH3:4][CH:5]=[OH+:6]', 'Protonated ethanal'), struct('intermediate', '[OH:6][CH:5]([CH3:4])[CH2:1][CH:2]=[OH+:3]', 'Protonated aldol')],
      formed: [change(1, 5, 1)],
      moves: [move(bond(1, 2), bond(1, 5)), move(lp(3), bond(2, 3)), move(bond(5, 6), lp(6))],
    }),
    step({ body: 'aldol-acid-4', title: 'Loss of H⁺ gives the aldol', kinds: ['proton_transfer'], reversible: true, species: [named('intermediate', 'Protonated aldol'), named('product', '3-Hydroxybutanal'), named('catalyst', 'H₃O⁺ (regenerated)')] }),
  ], { applicability: 'Acid catalyst: enol is the nucleophile; condensation to but-2-enal is easy on heating.' });
  return mechanism('aldol-ethanal', 'Aldol addition of ethanal', ['adn'], [base, acid], {
    summary: 'A carbonyl compound with α-hydrogens adds, through its enol or enolate, to a second carbonyl group.',
    concepts: ['alpha-hydrogen-acidity'],
  });
}

export function demoMechanisms(): Mechanism[] {
  return [sn2(), e2(), aldol()];
}
