/**
 * The first draft of a NEW record (ADR-040 addendum, step 6.2a decision D3, extended in 6.2b decision D5): every required field has its
 * empty value, so the editor can show every field from the start. Species, classes, reagents, reactions, mechanisms (step 6.5a) and sources (step 6.6a); any other kind starts as the smallest draft
 * (`openSession`). Pure: the ID and both times come from the `CommandContext`. The empty canonical name does not pass L1, which is right:
 * Save is refused until a name is typed. A class has no empty `classKind` (the schema has no "unspecified" kind): the field is left ABSENT,
 * the form shows "Choose a kind" and L1 refuses Save with the schema's words until one is chosen. No kind is invented.
 */
import { RECORD_ID_PREFIX, type RecordKind } from '../schema';
import type { CommandContext } from '../commands/contracts';

const startNames = () => ({ canonical: '', common: [], aliases: [] });
const startMeta = (now: string) => ({
  tags: [],
  citations: [],
  provenance: { origin: 'user', createdAt: now, updatedAt: now },
  review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] },
});

export function blankDraft(kind: RecordKind, ctx: CommandContext): Record<string, unknown> | undefined {
  if (kind === 'species') {
    const now = ctx.now();
    return { kind: 'species', id: ctx.newId(RECORD_ID_PREFIX.species), names: startNames(), speciesKind: 'unspecified', classIds: [], properties: [], ...startMeta(now) };
  }
  if (kind === 'class') {
    const now = ctx.now();
    return { kind: 'class', id: ctx.newId(RECORD_ID_PREFIX.class), names: startNames(), parentIds: [], exampleSpeciesIds: [], ...startMeta(now) };
  }
  if (kind === 'reagent') {
    const now = ctx.now();
    return { kind: 'reagent', id: ctx.newId(RECORD_ID_PREFIX.reagent), names: startNames(), components: [], families: [], classIds: [], profiles: [], ...startMeta(now) };
  }
  if (kind === 'reaction') {
    const now = ctx.now();
    // `scope` has no empty value: ABSENT until chosen (L1 refuses Save); no stage (the schema needs none, RXN-007 is silent with none)
    return {
      kind: 'reaction',
      id: ctx.newId(RECORD_ID_PREFIX.reaction),
      name: '',
      aliases: [],
      purposes: [],
      namedReactionIds: [],
      transformationIds: [],
      reactionTypes: [],
      mechanismClasses: [],
      participants: [],
      stages: [],
      conditionVariants: [],
      outcomes: [],
      intermediates: [],
      mechanismIds: [],
      reversibility: { kind: 'unknown' },
      conceptIds: [],
      prerequisiteConceptIds: [],
      ...startMeta(now),
    };
  }
  if (kind === 'mechanism') {
    const now = ctx.now();
    return { kind: 'mechanism', id: ctx.newId(RECORD_ID_PREFIX.mechanism), name: '', aliases: [], mechanismClasses: [], variants: [], conceptIds: [], ...startMeta(now) };
  }
  if (kind === 'reference') {
    // a source: the kind of source has no empty value (ABSENT until chosen, L1 refuses Save); the title starts empty like a name
    return { kind: 'reference', id: ctx.newId(RECORD_ID_PREFIX.reference), title: '', authors: [], ...startMeta(ctx.now()) };
  }
  return undefined;
}
