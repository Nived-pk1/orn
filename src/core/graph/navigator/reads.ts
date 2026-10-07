/**
 * The record kinds the navigator projection reads (step 5.4c, decision Q3; `ProjectionDefinition.readsKinds`).
 * Proved by tests/property/navigator-reads-kinds.test.ts: random commands that touch only other kinds leave
 * the projection identical. Be generous: a kind listed too much costs a rebuild, a kind missing is a stale view.
 *  - reaction, species, class, reagent: arrows, hub resolution through `classIds` and `parentIds`, node flags;
 *  - concept, named_reaction: anchor targets (a hub can be one) and their flags;
 *  - navigator_anchor, entity_display: which records are hubs and which are never drawn as nodes;
 *  - caveat: the `has_caveat` node flag;
 *  - topic, topic_mapping: the topic filter;
 *  - exam_version, exam_relevance: `scopeOf` (the scope filter and the `outside_scope` flag).
 * Every listed kind has a witness in tests/property/navigator-reads-witness.test.ts (an edit that changes the view).
 * Left out on purpose, no witness can be written: `exam` (scopeOf compares its ID, never reads the record) and
 * `relationship` (a `prerequisite_of` moves a concept between `unmapped` and `prerequisite`; the view shows neither).
 */
import type { RecordKind } from '../../schema';

export const READS_KINDS: readonly RecordKind[] = [
  'caveat',
  'class',
  'concept',
  'entity_display',
  'exam_relevance',
  'exam_version',
  'named_reaction',
  'navigator_anchor',
  'reaction',
  'reagent',
  'species',
  'topic',
  'topic_mapping',
];
