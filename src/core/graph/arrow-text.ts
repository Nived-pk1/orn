/**
 * Arrow text — what is written over and under one arrow (DOMAIN_MODEL §6.2; step 5.3 review follow-up a).
 * Pure and structured: parts, never markup. A name is taken as it is (the renderer decides how to draw it).
 *
 * Placement of a participant: the `reaction_scheme` placement when there is one, else the role default
 * (§6.2). The carried substrate (the one this arrow starts from) and spectators are left out; products are
 * not participants. A reactant nobody draws as a node (water, `entity_display`) is written on the arrow
 * (ADV-027). Order: stage order (array order is stage order), then the participant order of the record.
 * Decided by the 5.4a review (2026-10-07): that reactant goes ABOVE the arrow, first within its stage (it is a
 * reagent in the arrow's eyes). Names (step 5.5a review, item e; replaces the 5.4a provisional choice): `originalText` wins; a
 * SOLVENT is written by its name; any other species, and a reagent backed by ONE species, by its formula when it has at most
 * `MAX_FORMULA_CHARS` characters, else by its name; a reagent without a species by its name. A length rule, never a name rule.
 * A stage number ("1.") is a separator part when the scheme says `showStageNumbers`.
 * Conditions (step 5.5a part 3, item l; the 5.4b review, decision 5): on the BELOW side, after the participant parts of the same stage;
 * the stage's own fields, overridden field by field by the arrow's condition variant only when the arrow has exactly ONE variant and it
 * overrides that stage (`condition-text.ts` has the wording). At most `MAX_CONDITION_PARTS` condition parts a side, and each side ends
 * with at most ONE `more` part that counts everything not shown (participants and conditions).
 */
import type { ConditionVariantId, ConditionParameters, ParticipantId, Reaction, ReactionScheme, RecordRef, SubstanceRef } from '../schema';
import { conditionPartsOf, overrideParameters } from './condition-text';

export type ArrowTextPartKind = 'name' | 'formula' | 'condition' | 'separator' | 'more';

export interface ArrowTextPart {
  readonly text: string;
  readonly kind: ArrowTextPartKind;
}

export interface ArrowText {
  readonly above: readonly ArrowTextPart[];
  readonly below: readonly ArrowTextPart[];
}

export interface ArrowTextContext {
  /** The schemes of THIS reaction, any order (the caller looks them up; core does no scan here). */
  readonly schemes: readonly ReactionScheme[];
  /** The condition variants of the arrow's outcome; none: only the participants common to every variant. */
  readonly conditionVariantIds: readonly ConditionVariantId[];
  /** The participant this arrow carries (left out of the text). */
  readonly carriedParticipantId?: ParticipantId;
  /**
   * Display name and formula of a record as plain text; undefined: the record is gone (its ID is written). For a REAGENT the
   * formula is present exactly when the reagent is backed by ONE species (that species' formula); a reagent's own display text is not it.
   */
  readonly describe: (ref: RecordRef) => { readonly name: string; readonly formula?: string } | undefined;
  /** False for a record whose `entity_display` says it is never a node. */
  readonly shownAsNode: (ref: RecordRef) => boolean;
  /** True: a reactant is never written on the arrow (the full equation lists every reactant on the left, water included). */
  readonly omitReactants?: boolean;
}

/** A formula longer than this (in characters) is not written on an arrow: the name is (item e). */
export const MAX_FORMULA_CHARS = 7;

/** At most this many participant parts a side; the rest is counted in the one `more` part of the side. */
export const MAX_ARROW_PARTS = 3;
/** At most this many condition parts a side (the below side); the rest is counted in the one `more` part of the side. */
export const MAX_CONDITION_PARTS = 3;

type Side = 'above' | 'below';
type Position = ReactionScheme['placements'][number]['position'];

const ROLE_POSITION: Readonly<Record<Reaction['participants'][number]['role'], Position>> = {
  reactant: 'reactant_side',
  reagent: 'above_arrow',
  catalyst: 'above_arrow',
  solvent: 'below_arrow',
  initiator: 'above_arrow',
  promoter: 'above_arrow',
  additive: 'below_arrow',
  workup_reagent: 'above_arrow',
  spectator: 'hidden',
};

/** The side a reactant takes when nothing draws it as a node (5.4a review decision 1). */
const UNDRAWN_REACTANT_SIDE: Side = 'above';

const byId = (a: { readonly id: string }, b: { readonly id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The scheme for these variants: one named for a variant of the arrow, else the general one; ties by ID. */
function schemeFor(reaction: Reaction, context: ArrowTextContext): ReactionScheme | undefined {
  const own = context.schemes.filter((s) => s.reactionId === reaction.id).sort(byId);
  const variants = new Set<string>(context.conditionVariantIds);
  return own.find((s) => s.conditionVariantId !== undefined && variants.has(s.conditionVariantId)) ?? own.find((s) => s.conditionVariantId === undefined);
}

/** A participant listed in some variant applies only under those variants (§6.3). */
export function appliesTo(reaction: Reaction, participantId: string, variantIds: readonly string[]): boolean {
  const listing = reaction.conditionVariants.filter((v) => v.participantIds.includes(participantId as ParticipantId));
  return listing.length === 0 || listing.some((v) => variantIds.includes(v.id));
}

function partOf(ref: SubstanceRef, role: Reaction['participants'][number]['role'], original: string | undefined, context: ArrowTextContext): ArrowTextPart {
  if (original !== undefined && original !== '') return { text: original, kind: 'name' };
  const described = context.describe(ref);
  if (described === undefined) return { text: ref.id, kind: 'name' };
  const formula = described.formula;
  if (role !== 'solvent' && (ref.kind === 'species' || ref.kind === 'reagent') && formula !== undefined && formula !== '' && [...formula].length <= MAX_FORMULA_CHARS) return { text: formula, kind: 'formula' };
  return { text: described.name === '' ? ref.id : described.name, kind: 'name' };
}

interface Placed {
  readonly side: Side;
  readonly stage: number;
  /** 0 for a reactant nobody draws: it goes first within its stage. */
  readonly rank: number;
  readonly part: ArrowTextPart;
}

/** A part of one side with where it came from: a participant, or a condition (a gas of an atmosphere is a formula part but a condition). */
interface Sourced {
  readonly part: ArrowTextPart;
  readonly from: 'participant' | 'condition';
}

function cap(parts: readonly Sourced[]): readonly ArrowTextPart[] {
  const out: ArrowTextPart[] = [];
  const shown = { participant: 0, condition: 0 };
  const limit = { participant: MAX_ARROW_PARTS, condition: MAX_CONDITION_PARTS };
  let pending: ArrowTextPart | undefined;
  let hidden = 0;
  for (const { part, from } of parts) {
    if (part.kind === 'separator') {
      pending = part;
      continue;
    }
    if (shown[from] < limit[from]) {
      if (pending !== undefined) out.push(pending);
      out.push(part);
      shown[from] += 1;
    } else hidden += 1;
    pending = undefined;
  }
  if (hidden > 0) out.push({ text: `+${hidden} more`, kind: 'more' });
  return out;
}

/** The parameters the arrow writes for each stage: the stage's own, with the one variant's fields laid over the stage it overrides. */
function effectiveParameters(reaction: Reaction, variantIds: readonly string[]): readonly ConditionParameters[] {
  const own = reaction.stages.map((stage) => stage.parameters);
  if (variantIds.length !== 1) return own;
  const variant = reaction.conditionVariants.find((v) => v.id === variantIds[0]);
  if (variant === undefined) return own;
  const target = variant.stageId === undefined ? reaction.stages.findIndex((s) => s.kind === 'reaction') : reaction.stages.findIndex((s) => s.id === variant.stageId);
  if (target < 0) return own;
  return own.map((parameters, index) => (index === target ? overrideParameters(parameters, variant.parameters) : parameters));
}

export function arrowTextOf(reaction: Reaction, context: ArrowTextContext): ArrowText {
  const scheme = schemeFor(reaction, context);
  const placementOf = new Map((scheme?.placements ?? []).map((p) => [p.participantId as string, p.position]));
  const stageOf = (id: ParticipantId): number => {
    const at = reaction.stages.findIndex((s) => s.participantIds.includes(id));
    return at < 0 ? reaction.stages.length : at;
  };
  const numbered = scheme?.showStageNumbers === true && reaction.stages.length > 1;
  const placed: Placed[] = [];
  for (const p of reaction.participants) {
    if (p.id === context.carriedParticipantId) continue;
    if (context.omitReactants === true && p.role === 'reactant') continue;
    if (!appliesTo(reaction, p.id, context.conditionVariantIds)) continue;
    const position = placementOf.get(p.id) ?? ROLE_POSITION[p.role];
    if (position === 'hidden') continue;
    let side: Side | undefined = position === 'above_arrow' ? 'above' : position === 'below_arrow' ? 'below' : undefined;
    let rank = 1;
    if (side === undefined && !context.shownAsNode(p.ref)) {
      side = UNDRAWN_REACTANT_SIDE;
      rank = 0;
    }
    if (side === undefined) continue;
    placed.push({ side, stage: stageOf(p.id), rank, part: partOf(p.ref, p.role, p.originalText, context) });
  }
  // Stable sort: stage order, an undrawn reactant first, then the order of the record.
  const ordered = placed.map((item, index) => ({ item, index })).sort((a, b) => a.item.stage - b.item.stage || a.item.rank - b.item.rank || a.index - b.index);
  const sides: Record<Side, Sourced[]> = { above: [], below: [] };
  const lastStage: Record<Side, number> = { above: -1, below: -1 };
  const push = (side: Side, stage: number, entry: Sourced): void => {
    if (numbered && stage < reaction.stages.length && stage !== lastStage[side]) sides[side].push({ part: { text: `${stage + 1}.`, kind: 'separator' }, from: entry.from });
    lastStage[side] = stage;
    sides[side].push(entry);
  };
  // The conditions of a stage come after its participants on the below side: each stage's parts are pushed in turn.
  const conditions = effectiveParameters(reaction, context.conditionVariantIds).map((parameters) => conditionPartsOf(parameters));
  const stageCount = reaction.stages.length;
  for (let stage = 0; stage <= stageCount; stage += 1) {
    for (const { item } of ordered) if (item.stage === stage) push(item.side, stage, { part: item.part, from: 'participant' });
    for (const condition of conditions[stage] ?? []) push('below', stage, { part: { text: condition.text, kind: condition.kind }, from: 'condition' });
  }
  return { above: cap(sides.above), below: cap(sides.below) };
}
