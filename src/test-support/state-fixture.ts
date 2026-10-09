/**
 * Canonical states from the schema fixtures, and a `commit` helper that produces the same
 * (state, ChangeSet) pair the store will (step 1.9). Test-only.
 */
import { readFileSync } from 'node:fs';
import { enablePatches, produceWithPatches } from 'immer';
import { assembleChangeSet, documentToState, type ChangeSet } from '@/core/dataset';
import type { CanonicalState, DatasetDocument, RecordKind } from '@/core/schema';

enablePatches();

export function loadFixtureState(name: 'minimal-valid' | 'maximal-valid'): CanonicalState {
  const url = new URL(`../../data/fixtures/schema/v2/${name}.orn.json`, import.meta.url);
  const result = documentToState(JSON.parse(readFileSync(url, 'utf8')) as DatasetDocument);
  if (!result.ok) throw new Error(`fixture ${name} has duplicate IDs`);
  return result.state;
}

/** Mutable view of the record tables inside an Immer recipe. */
export type Tables = Record<RecordKind, Record<string, unknown>>;

export function commit(
  before: CanonicalState,
  revision: number,
  recipe: (tables: Tables) => void,
  cause: ChangeSet['cause'] = 'command',
): { readonly after: CanonicalState; readonly changes: ChangeSet } {
  const [after, patches, inversePatches] = produceWithPatches(before, (draft) => {
    recipe((draft as unknown as { records: Tables }).records);
  });
  const changes = assembleChangeSet({ revision, label: 'test', cause, before, after, patches, inversePatches });
  return { after, changes };
}

export function must<T>(value: T | undefined, what = 'fixture record'): T {
  if (value === undefined) throw new Error(`missing ${what}`);
  return value;
}

/** Deletes a record inside an Immer recipe. */
export function remove(tables: Tables, kind: RecordKind, id: string): void {
  Reflect.deleteProperty(tables[kind], id);
}
