/** Helpers for tests and scripts of the legacy import through the real pipeline (step 3.11c): the fixture files as bytes, the demo dataset as a live state, a session over a real store. Not test-only in one respect: `scripts/legacy-expected.mjs` runs it through tsx. */
import { readFileSync } from 'node:fs';
import type { StoreHandle } from '@/core/commands';
import { documentToState } from '@/core/dataset';
import { emptyRecordTables, type CanonicalState, type DatasetDocument } from '@/core/schema';
import type { ImportPlanRequest, ImportPreviewOutcome } from '@/io';
import { makeStore } from './command-kit';
import { parseBytes, testSession, type TestSession } from './import-kit';

export const LEGACY_FIXTURES = ['v6-demo-export.json', 'v4-sample.json'] as const;
export type LegacyFixtureName = (typeof LEGACY_FIXTURES)[number];
export type StoreKind = 'empty' | 'demo';

export const legacyBytes = (name: LegacyFixtureName): Uint8Array => new Uint8Array(readFileSync(new URL(`../../data/fixtures/legacy/${name}`, import.meta.url)));

export function demoState(): CanonicalState {
  const doc = JSON.parse(readFileSync(new URL('../../data/seed/demo.orn.json', import.meta.url), 'utf8')) as DatasetDocument;
  const result = documentToState(doc);
  if (!result.ok) throw new Error('the demo dataset has duplicate IDs');
  return result.state;
}

export function emptyState(): CanonicalState {
  return { meta: demoState().meta, records: emptyRecordTables() };
}

export const stateOfKind = (kind: StoreKind): CanonicalState => (kind === 'demo' ? demoState() : emptyState());

export interface LegacyRun extends TestSession {
  readonly store: StoreHandle;
  readonly outcome: ImportPreviewOutcome;
}

/** Bytes → the real parser → a session over a real store of `kind` → preview. The clock and the ID source are fixed unless `nowMs` / `seed` say otherwise. */
export async function legacyPreview(
  bytes: Uint8Array,
  kind: StoreKind,
  options: { readonly request?: ImportPlanRequest; readonly nowMs?: number; readonly seed?: number; readonly store?: StoreHandle; readonly fileName?: string } = {},
): Promise<LegacyRun> {
  const store = options.store ?? makeStore(stateOfKind(kind), { revision: 1 });
  const testRun = testSession(store, { ...(options.nowMs === undefined ? {} : { nowMs: options.nowMs }), ...(options.seed === undefined ? {} : { seed: options.seed }) });
  const fileName = options.fileName ?? 'export.json';
  const parsed = await parseBytes(bytes, fileName);
  const outcome = await testRun.session.preview({ parsed, fileName, ...(options.request === undefined ? {} : { request: options.request }) });
  return { ...testRun, store, outcome };
}
