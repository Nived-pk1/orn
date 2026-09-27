/**
 * Reaction builder for the demo dataset. Participants, stages, variants and outcomes are given by
 * position; nested IDs are derived from the reaction slug so routes and schemes can name them.
 */
import type {
  ConditionParameters,
  Participant,
  Reaction,
  Review,
  SpeciesOrClassRef,
  SubstanceRef,
} from './types';
import { cptId, ident, meta, conditions, type CurationOptions } from './kit';

type Flags = NonNullable<Participant['flags']>;

export interface P {
  readonly ref: SubstanceRef;
  readonly role: Participant['role'];
  readonly coef?: number;
  readonly phase?: NonNullable<Participant['phase']>;
  readonly strength?: NonNullable<Participant['strength']>;
  readonly dry?: boolean;
  readonly qty?: NonNullable<Participant['quantity']>;
  /** Profile ID body of the reagent (a nested ID, e.g. `rpf_baeyers`). */
  readonly profile?: string;
  readonly flags?: Flags;
  readonly primary?: boolean;
  readonly text?: string;
  readonly note?: string;
}

export interface Prod {
  readonly ref: SpeciesOrClassRef;
  readonly role?: 'main' | 'coproduct' | 'byproduct';
  readonly coef?: number;
  readonly phase?: NonNullable<Participant['phase']>;
  readonly note?: string;
}

type Outcome = Reaction['outcomes'][number];

export interface O {
  readonly label?: string;
  /** Positions in `variants`. */
  readonly variants?: readonly number[];
  readonly sel: Outcome['selectivity'];
  readonly products: readonly Prod[];
  readonly group?: string;
  readonly regio?: string;
  readonly stereo?: { readonly outcome: NonNullable<Outcome['stereochemistry']>['outcome']; readonly descriptors?: readonly string[]; readonly note?: string };
  readonly yieldText?: string;
  readonly mechanism?: { readonly id: string; readonly variant?: string };
  readonly rationale?: string;
  readonly concepts?: readonly string[];
  readonly note?: string;
}

export interface StageSpec {
  readonly kind: Reaction['stages'][number]['kind'];
  readonly label?: string;
  /** Positions in `participants`. */
  readonly members: readonly number[];
  readonly params?: Partial<ConditionParameters>;
  readonly text?: string;
}

export interface VariantSpec {
  readonly label: string;
  readonly stage?: number;
  readonly params?: Partial<ConditionParameters>;
  readonly members?: readonly number[];
  readonly note?: string;
}

type Intermediate = Reaction['intermediates'][number];

export interface IntermediateSpec {
  readonly intKind: Intermediate['intermediateKind'];
  readonly ref?: SpeciesOrClassRef;
  readonly label?: string;
  /** Position in `stages`. */
  readonly stage?: number;
}

export interface RxSpec extends CurationOptions {
  readonly slug: string;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly scope: Reaction['scope'];
  readonly instanceOf?: string;
  readonly purposes?: Reaction['purposes'];
  readonly named?: readonly string[];
  readonly transformations?: readonly string[];
  readonly types?: readonly string[];
  readonly mechClasses?: readonly string[];
  readonly participants: readonly P[];
  readonly stages?: readonly StageSpec[];
  readonly variants?: readonly VariantSpec[];
  readonly outcomes: readonly O[];
  readonly intermediates?: readonly IntermediateSpec[];
  readonly mechanisms?: readonly string[];
  readonly reversibility?: readonly [Reaction['reversibility']['kind'], string?];
  readonly selectivityNotes?: Reaction['selectivityNotes'];
  readonly general?: string;
  readonly concepts?: readonly string[];
  readonly prerequisites?: readonly string[];
  readonly limitations?: string;
  readonly difficulty?: number;
  readonly studyNotes?: string;
  readonly notes?: string;
}

const n = (i: number): number => i + 1;
export const rxnId = (slug: string) => ident<Reaction['id']>('rxn', slug);
export const partId = (slug: string, i: number) => ident<Participant['id']>('prt', `${slug}-${n(i)}`);
export const stgId = (slug: string, i: number) => ident<Reaction['stages'][number]['id']>('stg', `${slug}-${n(i)}`);
export const cvrId = (slug: string, i: number) => ident<Reaction['conditionVariants'][number]['id']>('cvr', `${slug}-${n(i)}`);
export const outId = (slug: string, i: number) => ident<Outcome['id']>('out', `${slug}-${n(i)}`);
export const pdtId = (slug: string, i: number, j: number) => ident<Outcome['products'][number]['id']>('pdt', `${slug}-${n(i)}-${n(j)}`);
export const intId = (slug: string, i: number) => ident<Intermediate['id']>('int', `${slug}-${n(i)}`);

const classification = (body: string) => ({ conceptId: cptId(body), certainty: 'definite' as const });

export function reaction(s: RxSpec): Reaction {
  const slug = s.slug;
  const participants = s.participants.map((p, i): Participant => ({
    id: partId(slug, i),
    ref: p.ref,
    role: p.role,
    ...(p.coef === undefined ? {} : { coefficient: p.coef }),
    ...(p.phase === undefined ? {} : { phase: p.phase }),
    ...(p.strength === undefined ? {} : { strength: p.strength }),
    ...(p.dry === undefined ? {} : { dry: p.dry }),
    ...(p.qty === undefined ? {} : { quantity: p.qty }),
    ...(p.profile === undefined ? {} : { profileId: ident<NonNullable<Participant['profileId']>>('rpf', p.profile) }),
    ...(p.flags === undefined ? {} : { flags: p.flags }),
    ...(p.primary === undefined ? {} : { isPrimarySubstrate: p.primary }),
    ...(p.text === undefined ? {} : { originalText: p.text }),
    ...(p.note === undefined ? {} : { note: p.note }),
  }));
  const stages = (s.stages ?? []).map((st, i) => ({
    id: stgId(slug, i),
    kind: st.kind,
    ...(st.label === undefined ? {} : { label: st.label }),
    participantIds: st.members.map((m) => partId(slug, m)),
    parameters: conditions(st.params),
    ...(st.text === undefined ? {} : { originalText: st.text }),
  }));
  const conditionVariants = (s.variants ?? []).map((v, i) => ({
    id: cvrId(slug, i),
    label: v.label,
    ...(v.stage === undefined ? {} : { stageId: stgId(slug, v.stage) }),
    parameters: conditions(v.params),
    participantIds: (v.members ?? []).map((m) => partId(slug, m)),
    ...(v.note === undefined ? {} : { note: v.note }),
  }));
  const outcomes = s.outcomes.map((o, i): Outcome => ({
    id: outId(slug, i),
    ...(o.label === undefined ? {} : { label: o.label }),
    conditionVariantIds: (o.variants ?? []).map((v) => cvrId(slug, v)),
    selectivity: o.sel,
    products: o.products.map((p, j) => ({
      id: pdtId(slug, i, j),
      ref: p.ref,
      role: p.role ?? 'main',
      ...(p.coef === undefined ? {} : { coefficient: p.coef }),
      ...(p.phase === undefined ? {} : { phase: p.phase }),
      ...(p.note === undefined ? {} : { note: p.note }),
    })),
    ...(o.group === undefined ? {} : { isomerGroup: o.group }),
    ...(o.regio === undefined ? {} : { regiochemistry: o.regio }),
    ...(o.stereo === undefined
      ? {}
      : { stereochemistry: { outcome: o.stereo.outcome, descriptors: [...(o.stereo.descriptors ?? [])], ...(o.stereo.note === undefined ? {} : { note: o.stereo.note }) } }),
    ...(o.yieldText === undefined ? {} : { yieldText: o.yieldText }),
    ...(o.mechanism === undefined
      ? {}
      : {
          mechanism: {
            mechanismId: ident<NonNullable<Outcome['mechanism']>['mechanismId']>('mec', o.mechanism.id),
            ...(o.mechanism.variant === undefined ? {} : { variantId: ident<NonNullable<NonNullable<Outcome['mechanism']>['variantId']>>('mvr', o.mechanism.variant) }),
          },
        }),
    ...(o.rationale === undefined ? {} : { rationale: o.rationale }),
    conceptIds: (o.concepts ?? []).map(cptId),
    ...(o.note === undefined ? {} : { note: o.note }),
  }));
  const intermediates = (s.intermediates ?? []).map((im, i): Intermediate => ({
    id: intId(slug, i),
    intermediateKind: im.intKind,
    ...(im.ref === undefined ? {} : { ref: im.ref }),
    ...(im.label === undefined ? {} : { label: im.label }),
    ...(im.stage === undefined ? {} : { stageId: stgId(slug, im.stage) }),
  }));
  const [revKind, revNote] = s.reversibility ?? ['irreversible'];
  return {
    id: rxnId(slug),
    kind: 'reaction',
    name: s.name,
    aliases: [...(s.aliases ?? [])],
    scope: s.scope,
    ...(s.instanceOf === undefined ? {} : { instanceOfId: rxnId(s.instanceOf) }),
    purposes: [...(s.purposes ?? ['synthesis'])],
    namedReactionIds: (s.named ?? []).map((b) => ident<Reaction['namedReactionIds'][number]>('nrx', b)),
    transformationIds: (s.transformations ?? []).map((b) => ident<Reaction['transformationIds'][number]>('trf', b)),
    reactionTypes: (s.types ?? []).map(classification),
    mechanismClasses: (s.mechClasses ?? []).map(classification),
    participants,
    stages,
    conditionVariants,
    outcomes,
    intermediates,
    mechanismIds: (s.mechanisms ?? []).map((b) => ident<Reaction['mechanismIds'][number]>('mec', b)),
    reversibility: { kind: revKind, ...(revNote === undefined ? {} : { note: revNote }) },
    ...(s.selectivityNotes === undefined ? {} : { selectivityNotes: s.selectivityNotes }),
    ...(s.general === undefined ? {} : { generalizedEquation: s.general }),
    conceptIds: (s.concepts ?? []).map(cptId),
    prerequisiteConceptIds: (s.prerequisites ?? []).map(cptId),
    ...(s.limitations === undefined ? {} : { limitations: s.limitations }),
    ...(s.difficulty === undefined ? {} : { difficulty: s.difficulty }),
    ...(s.studyNotes === undefined ? {} : { studyNotes: s.studyNotes }),
    ...(s.notes === undefined ? {} : { notes: s.notes }),
    ...meta(s),
  };
}

export type { Review };
