/**
 * The first draft of a NEW record (ADR-040 addendum, step 6.2a decision D3, extended in 6.2b decision D5): every required field has its
 * empty value, so the editor can show every field from the start. Species, classes, reagents, reactions, mechanisms (step 6.5a), sources (step 6.6a), concepts, named reactions, transformations, relationships and caveats (step 6.6b), topics, topic mappings, exam relevance and map families (step 6.6c); any other kind starts as the smallest draft
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
  if (kind === 'concept') {
    // a concept: the kind of concept has no empty value (ABSENT until chosen, L1 refuses Save); the name starts empty
    return { kind: 'concept', id: ctx.newId(RECORD_ID_PREFIX.concept), name: '', aliases: [], parentIds: [], ...startMeta(ctx.now()) };
  }
  if (kind === 'caveat') {
    // a caveat: the kind has no empty value (ABSENT until chosen, L1 refuses Save); the title and statement start empty, no targets
    return { kind: 'caveat', id: ctx.newId(RECORD_ID_PREFIX.caveat), title: '', statement: '', targets: [], conceptIds: [], ...startMeta(ctx.now()) };
  }
  if (kind === 'relationship') {
    // a relationship: the type and both ends have no empty value (ABSENT until chosen, L1 refuses Save)
    return { kind: 'relationship', id: ctx.newId(RECORD_ID_PREFIX.relationship), ...startMeta(ctx.now()) };
  }
  if (kind === 'topic') {
    // a topic: the kind of topic and the order have no empty value (ABSENT until given, L1 refuses Save); no parent is a top-level topic
    return { kind: 'topic', id: ctx.newId(RECORD_ID_PREFIX.topic), name: '', aliases: [], ...startMeta(ctx.now()) };
  }
  if (kind === 'topic_mapping') {
    // topic, target and role have no empty value (ABSENT until chosen)
    return { kind: 'topic_mapping', id: ctx.newId(RECORD_ID_PREFIX.topic_mapping), ...startMeta(ctx.now()) };
  }
  if (kind === 'exam_relevance') {
    // target, exam and scope have no empty value; no versions means every version of the exam
    return { kind: 'exam_relevance', id: ctx.newId(RECORD_ID_PREFIX.exam_relevance), examVersionIds: [], ...startMeta(ctx.now()) };
  }
  if (kind === 'navigator_anchor') {
    // a map family: the target and the order have no empty value; presentation records carry provenance only
    return { kind: 'navigator_anchor', id: ctx.newId(RECORD_ID_PREFIX.navigator_anchor), provenance: startMeta(ctx.now()).provenance };
  }
  if (kind === 'named_reaction') {
    return { kind: 'named_reaction', id: ctx.newId(RECORD_ID_PREFIX.named_reaction), name: '', aliases: [], parentIds: [], conceptIds: [], prerequisiteConceptIds: [], ...startMeta(ctx.now()) };
  }
  if (kind === 'transformation') {
    return { kind: 'transformation', id: ctx.newId(RECORD_ID_PREFIX.transformation), name: '', aliases: [], fromClassIds: [], toClassIds: [], conceptIds: [], ...startMeta(ctx.now()) };
  }
  return undefined;
}
