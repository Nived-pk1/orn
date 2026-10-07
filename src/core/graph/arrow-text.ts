/**
 * Arrow text — what is written over and under one arrow (DOMAIN_MODEL §6.2; step 5.3 review follow-up a).
 * Pure and structured: parts, never markup. A name is taken as it is (the renderer decides how to draw it).
 *
 * Placement of a participant: the `reaction_scheme` placement when there is one, else the role default
 * (§6.2). The carried substrate (the one this arrow starts from) and spectators are left out; products are
 * not participants. A reactant nobody draws as a node (water, `entity_display`) is written on the arrow
 * (ADV-027). Order: stage order (array order is stage order), then the participant order of the record.
 * OPEN CHOICES, decided provisionally and listed for the reviewer in docs/PROGRESS.md: that reactant goes
 * BELOW the arrow; a species is written by its formula, anything else by its name; a stage number
 * ("1.") is a separator part when the scheme says `showStageNumbers`; conditions (temperature, time) are
 * not produced, their placement and format are not in the docs.
 */
import type { ConditionVariantId, ParticipantId, Reaction, ReactionScheme, RecordRef, SubstanceRef } from '../schema';

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
  /** Display name and formula of a record as plain text; undefined: the record is gone (its ID is written). */
  readonly describe: (ref: RecordRef) => { readonly name: string; readonly formula?: string } | undefined;
  /** False for a record whose `entity_display` says it is never a node. */
  readonly shownAsNode: (ref: RecordRef) => boolean;
}

/** At most this many parts a side; the rest is one `more` part with its count. */
export const MAX_ARROW_PARTS = 3;

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

/** The side a reactant takes when nothing draws it as a node. OPEN CHOICE (see the file comment). */
const UNDRAWN_REACTANT_SIDE: Side = 'below';

const byId = (a: { readonly id: string }, b: { readonly id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The scheme for these variants: one named for a variant of the arrow, else the general one; ties by ID. */
function schemeFor(reaction: Reaction, context: ArrowTextContext): ReactionScheme | undefined {
  const own = context.schemes.filter((s) => s.reactionId === reaction.id).sort(byId);
  const variants = new Set<string>(context.conditionVariantIds);
  return own.find((s) => s.conditionVariantId !== undefined && variants.has(s.conditionVariantId)) ?? own.find((s) => s.conditionVariantId === undefined);
}

/** A participant listed in some variant applies only under those variants (§6.3). */
function appliesTo(reaction: Reaction, participantId: string, variantIds: readonly string[]): boolean {
  const listing = reaction.conditionVariants.filter((v) => v.participantIds.includes(participantId as ParticipantId));
  return listing.length === 0 || listing.some((v) => variantIds.includes(v.id));
}

function partOf(ref: SubstanceRef, original: string | undefined, context: ArrowTextContext): ArrowTextPart {
  if (original !== undefined && original !== '') return { text: original, kind: 'name' };
  const described = context.describe(ref);
  if (described === undefined) return { text: ref.id, kind: 'name' };
  if (ref.kind === 'species' && described.formula !== undefined && described.formula !== '') return { text: described.formula, kind: 'formula' };
  return { text: described.name === '' ? ref.id : described.name, kind: 'name' };
}

interface Placed {
  readonly side: Side;
  readonly stage: number;
  readonly part: ArrowTextPart;
}

function cap(parts: readonly ArrowTextPart[]): readonly ArrowTextPart[] {
  const out: ArrowTextPart[] = [];
  let content = 0;
  let pending: ArrowTextPart | undefined;
  let hidden = 0;
  for (const part of parts) {
    if (part.kind === 'separator') {
      pending = part;
      continue;
    }
    if (content < MAX_ARROW_PARTS) {
      if (pending !== undefined) out.push(pending);
      out.push(part);
      content += 1;
    } else hidden += 1;
    pending = undefined;
  }
  if (hidden > 0) out.push({ text: `+${hidden} more`, kind: 'more' });
  return out;
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
    if (!appliesTo(reaction, p.id, context.conditionVariantIds)) continue;
    const position = placementOf.get(p.id) ?? ROLE_POSITION[p.role];
    if (position === 'hidden') continue;
    let side: Side | undefined = position === 'above_arrow' ? 'above' : position === 'below_arrow' ? 'below' : undefined;
    if (side === undefined && !context.shownAsNode(p.ref)) side = UNDRAWN_REACTANT_SIDE;
    if (side === undefined) continue;
    placed.push({ side, stage: stageOf(p.id), part: partOf(p.ref, p.originalText, context) });
  }
  // Stable sort: stage order, then the order of the record.
  const ordered = placed.map((item, index) => ({ item, index })).sort((a, b) => a.item.stage - b.item.stage || a.index - b.index);
  const sides: Record<Side, ArrowTextPart[]> = { above: [], below: [] };
  const lastStage: Record<Side, number> = { above: -1, below: -1 };
  for (const { item } of ordered) {
    if (numbered && item.stage < reaction.stages.length && item.stage !== lastStage[item.side]) {
      sides[item.side].push({ text: `${item.stage + 1}.`, kind: 'separator' });
    }
    lastStage[item.side] = item.stage;
    sides[item.side].push(item.part);
  }
  return { above: cap(sides.above), below: cap(sides.below) };
}
