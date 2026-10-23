/**
 * The authoring data set (step 6.9, Part 2): the committed demo (never changed) WITHOUT its reactions, without every record that points at one
 * (caveats, relationships, topic mappings, exam relevance, routes, schemes) and without the records the plan creates "from scratch" through the
 * nested editor (species `spc_3-hydroxybutanal` and `spc_caprolactam`, reagent `rgt_lindlar`). It is built here from `data/seed/demo.orn.json`
 * and uploaded through the import screen; the demo records come back as the targets to compare with. Test-side only.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { documentToState, serializeDocument, stateToDocument } from '@/core/dataset';
import type { UploadFile } from './kit';

/** Records the nested editor makes while a reaction is authored (the plan: PROGRESS, Step 6.9 part 1). */
export const MADE_FROM_SCRATCH = ['spc_3-hydroxybutanal', 'spc_caprolactam', 'rgt_lindlar'] as const;

type Bag = Record<string, unknown>;
export type DemoRecords = Readonly<Record<string, Readonly<Record<string, Bag>>>>;

const DEMO_PATH = resolve(process.cwd(), 'data/seed/demo.orn.json');

/** The demo's records by kind and id, as committed. */
export function demoRecords(): DemoRecords {
  const state = documentToState(JSON.parse(readFileSync(DEMO_PATH, 'utf8')));
  if (!state.ok) throw new Error('the demo has duplicate IDs');
  return state.state.records as unknown as DemoRecords;
}

const mentions = (record: Bag, ids: ReadonlySet<string>): boolean => {
  const text = JSON.stringify(record);
  for (const id of ids) if (text.includes(`"${id}"`)) return true;
  return false;
};

export interface AuthoringData {
  readonly file: UploadFile;
  /** Every id left out, by kind, for the report. */
  readonly removed: Readonly<Record<string, readonly string[]>>;
}

/** The demo without its reactions (and what points at them) and without the records made from scratch; the demo file itself is never written. */
export function authoringData(): AuthoringData {
  const doc = JSON.parse(readFileSync(DEMO_PATH, 'utf8'));
  const parsed = documentToState(doc);
  if (!parsed.ok) throw new Error('the demo has duplicate IDs');
  const records = parsed.state.records as unknown as Record<string, Record<string, Bag>>;
  const gone = new Set<string>([...Object.keys(records['reaction'] ?? {}), ...MADE_FROM_SCRATCH]);
  const removed: Record<string, string[]> = {};
  const kept: Record<string, Record<string, Bag>> = {};
  for (const [kind, set] of Object.entries(records)) {
    kept[kind] = {};
    for (const [id, record] of Object.entries(set)) {
      if (gone.has(id) || (kind !== 'reaction' && mentions(record, new Set([...gone].filter((one) => one.startsWith('rxn_'))))) ) (removed[kind] ??= []).push(id);
      else (kept[kind] as Record<string, Bag>)[id] = record;
    }
  }
  // a record that mentioned a removed species / reagent (none does today) must not leave a dangling reference behind
  const madeIds = new Set<string>(MADE_FROM_SCRATCH);
  const clean: Record<string, Record<string, Bag>> = {};
  for (const [kind, set] of Object.entries(kept)) {
    clean[kind] = {};
    for (const [id, record] of Object.entries(set)) {
      if (mentions(record, madeIds)) (removed[kind] ??= []).push(id);
      else (clean[kind] as Record<string, Bag>)[id] = record;
    }
  }
  const next = { ...parsed.state, records: clean } as typeof parsed.state;
  const text = serializeDocument(stateToDocument(next, { exportedAt: doc.exportedAt, exportScope: doc.exportScope, generator: doc.generator }));
  if (!text.ok) throw new Error('the authoring data set does not serialise');
  return { file: { name: 'authoring-data.orn.json', mimeType: 'application/json', buffer: Buffer.from(text.text, 'utf8') }, removed };
}
