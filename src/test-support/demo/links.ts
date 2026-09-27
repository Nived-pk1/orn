/** Curated relationships, caveats and routes of the demo dataset. */
import type { Caveat, RecordRef, Relationship, Route } from './types';
import { cptId, ident, meta, rec, sp } from './kit';
import { outId, rxnId } from './reaction-kit';

const rxn = (slug: string): RecordRef => rec('reaction', slug, 'rxn');
const cpt = (body: string): RecordRef => rec('concept', body, 'cpt');
const rgt = (body: string): RecordRef => rec('reagent', body, 'rgt');
const nrx = (body: string): RecordRef => rec('named_reaction', body, 'nrx');
const mec = (body: string): RecordRef => rec('mechanism', body, 'mec');

const relationship = (
  body: string,
  type: Relationship['type'],
  from: RecordRef,
  to: RecordRef,
  o: { reverseKind?: Relationship['reverseKind']; note?: string } = {},
): Relationship => ({
  id: ident<Relationship['id']>('rel', body),
  kind: 'relationship',
  type,
  from,
  to,
  ...(o.reverseKind === undefined ? {} : { reverseKind: o.reverseKind }),
  ...(o.note === undefined ? {} : { note: o.note }),
  ...meta(),
});

export function demoRelationships(): Relationship[] {
  return [
    relationship('pcc-alt-dichromate', 'alternative_to', rxn('ethanol-to-ethanal-pcc'), rxn('ethanol-to-ethanal-dichromate'), { note: 'Same change, different oxidant: PCC is selective, dichromate needs distillation.' }),
    relationship('fischer-hydrolysis', 'reverse_of', rxn('fischer-esterification'), rxn('ethyl-ethanoate-hydrolysis'), { reverseKind: 'microscopic' }),
    relationship('hydration-dehydration', 'reverse_of', rxn('ethene-hydration'), rxn('ethanol-conc-h2so4'), { reverseKind: 'synthetic', note: 'A different reaction achieving the reverse change.' }),
    relationship('hbr-peroxide-contrast', 'contrasts_with', rxn('propene-hbr'), rxn('propene-hbr-peroxide')),
    relationship('sn2-vs-e2-reactions', 'competing_with', rxn('r-2-bromobutane-aq-koh'), rxn('r-2-bromobutane-alc-koh'), { note: 'Same substrate and base; the solvent tips the balance.' }),
    relationship('sn2-vs-e2-mechanisms', 'competing_with', mec('sn2-haloalkane'), mec('e2-haloalkane')),
    relationship('cannizzaro-aldol-confusion', 'commonly_confused_with', rxn('benzaldehyde-cannizzaro'), rxn('ethanal-aldol'), { note: 'Decided by whether the aldehyde has an α-hydrogen.' }),
    relationship('sandmeyer-follows-diazotisation', 'follows', rxn('benzenediazonium-sandmeyer'), rxn('aniline-diazotisation')),
    relationship('grignard-additions', 'mechanistically_related', rxn('methylmgbr-propanone'), rxn('methylmgbr-ethanal')),
    relationship('inductive-before-carbocation', 'prerequisite_of', cpt('inductive-effect'), cpt('carbocation-stability')),
    relationship('hyperconjugation-before-carbocation', 'prerequisite_of', cpt('hyperconjugation'), cpt('carbocation-stability')),
    relationship('carbocation-before-markovnikov', 'prerequisite_of', cpt('carbocation-stability'), cpt('markovnikov')),
    relationship('saytzeff-markovnikov', 'related_to', cpt('saytzeff'), cpt('markovnikov')),
  ];
}

interface CaveatSpec {
  readonly body: string;
  readonly kind: Caveat['caveatKind'];
  readonly title: string;
  readonly rule?: string;
  readonly statement: string;
  readonly explanation?: string;
  readonly targets: readonly { readonly ref: RecordRef; readonly as: Caveat['targets'][number]['as'] }[];
  readonly concepts?: readonly string[];
  readonly importance?: Caveat['importance'];
}

const caveat = (c: CaveatSpec): Caveat => ({
  id: ident<Caveat['id']>('cav', c.body),
  kind: 'caveat',
  caveatKind: c.kind,
  title: c.title,
  ...(c.rule === undefined ? {} : { rule: c.rule }),
  statement: c.statement,
  ...(c.explanation === undefined ? {} : { explanation: c.explanation }),
  targets: c.targets.map((t) => ({ ref: t.ref, as: t.as })),
  conceptIds: (c.concepts ?? []).map(cptId),
  ...(c.importance === undefined ? {} : { importance: c.importance }),
  ...meta(),
});

export function demoCaveats(): Caveat[] {
  return [
    caveat({
      body: 'pcc-stops-at-aldehyde', kind: 'trap', title: 'PCC stops at the aldehyde', importance: 'high',
      rule: 'Primary alcohols are oxidised to carboxylic acids by strong oxidants.',
      statement: 'PCC in anhydrous CH₂Cl₂ stops at the aldehyde stage.',
      explanation: 'Without water no aldehyde hydrate forms, so nothing is oxidised further. Acidified dichromate under reflux goes on to the acid.',
      targets: [{ ref: rxn('alcohol1-to-aldehyde-pcc'), as: 'affected_reaction' }, { ref: rgt('pcc'), as: 'affected_reagent' }],
      concepts: ['oxidation'],
    }),
    caveat({
      body: 'anti-markovnikov-peroxide', kind: 'exception', title: 'HBr with a peroxide adds anti-Markovnikov', importance: 'high',
      rule: "HX adds to an unsymmetrical alkene by Markovnikov's rule.",
      statement: 'In the presence of a peroxide, HBr (and only HBr) adds against Markovnikov’s rule.',
      targets: [{ ref: rxn('propene-hbr-peroxide'), as: 'affected_reaction' }, { ref: rgt('hydrogen-bromide'), as: 'affected_reagent' }, { ref: cpt('markovnikov'), as: 'context' }],
      concepts: ['markovnikov', 'anti-markovnikov'],
    }),
    caveat({
      body: 'alcl3-not-catalytic', kind: 'trap', title: 'AlCl₃ is needed in stoichiometric amount in acylation',
      statement: 'In Friedel–Crafts acylation AlCl₃ complexes with the ketone product, so at least one equivalent is used; it is not a true catalyst.',
      targets: [{ ref: rxn('benzene-friedel-crafts-acylation'), as: 'affected_reaction' }, { ref: rgt('aluminium-chloride'), as: 'affected_reagent' }],
    }),
    caveat({
      body: 'saytzeff-major', kind: 'special_case', title: 'Saytzeff product is major with a small base',
      rule: 'Elimination from a haloalkane can give more than one alkene.',
      statement: 'With alcoholic KOH the more substituted alkene (but-2-ene) is the major product.',
      targets: [{ ref: rxn('r-2-bromobutane-alc-koh'), as: 'affected_reaction' }, { ref: cpt('saytzeff'), as: 'context' }],
      concepts: ['saytzeff'],
    }),
    caveat({
      body: 'cannizzaro-no-alpha-h', kind: 'limitation', title: 'Cannizzaro needs an aldehyde with no α-hydrogen',
      statement: 'Aldehydes with an α-hydrogen (such as ethanal) undergo the aldol reaction instead.',
      targets: [{ ref: rxn('benzaldehyde-cannizzaro'), as: 'affected_reaction' }, { ref: nrx('cannizzaro'), as: 'context' }],
      concepts: ['alpha-hydrogen-acidity'],
    }),
    caveat({
      body: 'haloform-methyl-carbonyl', kind: 'limitation', title: 'Only CH₃–CO– and CH₃–CH(OH)– groups respond',
      statement: 'The iodoform test is positive for methyl ketones, ethanal, ethanol and secondary alcohols of the type CH₃–CH(OH)–R.',
      targets: [{ ref: rxn('haloform-ethanol'), as: 'affected_reaction' }, { ref: rxn('haloform-propanone'), as: 'affected_reaction' }, { ref: nrx('haloform'), as: 'context' }],
    }),
  ];
}

interface RouteSpec {
  readonly body: string;
  readonly name: string;
  readonly target: string;
  readonly steps: readonly { readonly reaction: string; readonly from?: readonly number[] }[];
  readonly description: string;
}

const route = (r: RouteSpec): Route => ({
  id: ident<Route['id']>('rte', r.body),
  kind: 'route',
  name: r.name,
  target: sp(r.target),
  purpose: 'curated',
  steps: r.steps.map((s, i) => ({
    id: ident<Route['steps'][number]['id']>('rst', `${r.body}-${i + 1}`),
    reactionId: rxnId(s.reaction),
    outcomeId: outId(s.reaction, 0),
    inputFromStepIds: (s.from ?? []).map((k) => ident<Route['steps'][number]['id']>('rst', `${r.body}-${k + 1}`)),
  })),
  description: r.description,
  conceptIds: [],
  ...meta(),
});

export function demoRoutes(): Route[] {
  return [
    route({
      body: 'ethanol-to-propan-2-ol', name: 'Ethanol → propan-2-ol', target: 'propan-2-ol',
      description: 'Oxidise to ethanal with PCC, then add a methyl Grignard reagent and work up.',
      steps: [{ reaction: 'ethanol-to-ethanal-pcc' }, { reaction: 'methylmgbr-ethanal', from: [0] }],
    }),
    route({
      body: 'aniline-to-phenol', name: 'Aniline → phenol', target: 'phenol',
      description: 'Diazotise at 0–5 °C, then warm the diazonium salt with water.',
      steps: [{ reaction: 'aniline-diazotisation' }, { reaction: 'benzenediazonium-to-phenol', from: [0] }],
    }),
  ];
}
