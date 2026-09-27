/**
 * The demo dataset (docs/TEST_STRATEGY.md §3): real JEE chemistry chosen to exercise every feature.
 * `buildDemoDocument` is deterministic; `data/seed/demo.orn.json` is its serialised output and a test
 * fails when the committed file drifts (regenerate with `npm run build:demo`).
 */
import { documentToState, serializeDocument, stateToDocument } from '@/core/dataset';
import { CURRENT_SCHEMA_VERSION, DATASET_FORMAT, type DatasetDocument } from '@/core/schema';
import { demoClasses } from './classes';
import { demoExamRelevance, demoExamVersions, demoExams, demoTopicMappings, demoTopics } from './curriculum';
import { DATASET_ID, STAMP } from './kit';
import { demoCaveats, demoRelationships, demoRoutes } from './links';
import { demoConcepts, demoNamedReactions, demoTransformations } from './knowledge';
import { demoMechanisms } from './mechanisms';
import { demoAnchors, demoEntityDisplays, demoSchemes, demoViewPresets } from './presentation';
import { demoReagents } from './reagents';
import { reactionsA } from './reactions-a';
import { reactionsB } from './reactions-b';
import { reactionsC } from './reactions-c';
import { demoSpecies } from './species';

export const DEMO_EXPORT = {
  exportedAt: STAMP,
  exportScope: 'full',
  generator: { app: 'orn-demo-builder', version: '1' },
} as const;

/** Records in any order; ordering and key order are fixed by serialisation. */
export function buildDemoDocument(): DatasetDocument {
  const draft: DatasetDocument = {
    format: DATASET_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ...DEMO_EXPORT,
    meta: {
      datasetId: DATASET_ID,
      title: 'ORN demo dataset',
      description: 'Real JEE organic chemistry chosen to exercise every feature. Unverified: no record is marked verified.',
      createdAt: STAMP,
      updatedAt: STAMP,
    },
    records: {
      reference: [],
      concept: demoConcepts(),
      species: demoSpecies(),
      class: demoClasses(),
      reagent: demoReagents(),
      transformation: demoTransformations(),
      named_reaction: demoNamedReactions(),
      mechanism: demoMechanisms(),
      reaction: [...reactionsA(), ...reactionsB(), ...reactionsC()],
      caveat: demoCaveats(),
      route: demoRoutes(),
      relationship: demoRelationships(),
      exam: demoExams(),
      exam_version: demoExamVersions(),
      topic: demoTopics(),
      topic_mapping: demoTopicMappings(),
      exam_relevance: demoExamRelevance(),
      asset: [],
      navigator_anchor: demoAnchors(),
      reaction_scheme: demoSchemes(),
      view_preset: demoViewPresets(),
      entity_display: demoEntityDisplays(),
    },
  };
  const state = documentToState(draft);
  if (!state.ok) throw new Error(`demo dataset has duplicate IDs: ${JSON.stringify(state.duplicates)}`);
  return stateToDocument(state.state, DEMO_EXPORT);
}

export function demoText(document: DatasetDocument = buildDemoDocument()): string {
  const out = serializeDocument(document);
  if (!out.ok) throw new Error(`demo dataset fails the schema: ${JSON.stringify(out.issues.slice(0, 5))}`);
  return out.text;
}
