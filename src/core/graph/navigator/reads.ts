/**
 * The record kinds the navigator projection reads (step 5.4c, decision Q3; `ProjectionDefinition.readsKinds`).
 * Proved by tests/property/navigator-reads-kinds.test.ts: random commands that touch only other kinds leave
 * the projection identical. Be generous: a kind listed too much costs a rebuild, a kind missing is a stale view.
 *  - reaction, species, class, reagent: arrows, hub resolution through `classIds` and `parentIds`, node flags;
 *  - concept, named_reaction: anchor targets (a hub can be one) and their flags;
 *  - navigator_anchor, entity_display: which records are hubs and which are never drawn as nodes;
 *  - caveat: the `has_caveat` node flag;
 *  - topic, topic_mapping: the topic filter;
 *  - exam, exam_version, exam_relevance, relationship: `scopeOf` (filter and `outside_scope` flag; prerequisites).
 */
import type { RecordKind } from '../../schema';

export const READS_KINDS: readonly RecordKind[] = [
  'caveat',
  'class',
  'concept',
  'entity_display',
  'exam',
  'exam_relevance',
  'exam_version',
  'named_reaction',
  'navigator_anchor',
  'reaction',
  'reagent',
  'relationship',
  'species',
  'topic',
  'topic_mapping',
];
