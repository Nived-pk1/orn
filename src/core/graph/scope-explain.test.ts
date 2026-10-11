/**
 * Why a record has its scope (step 5.6b, item h): the scope is `createScopeOf`'s answer and the reason is read from the data. For every
 * record and every exam version of the demo and of the maximal fixture: the same scope as `createScopeOf`; an `override` has an
 * override record, a `mapped` reason has mappings and a topic list, an `unmapped` scope has neither; deterministic.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deserializeDocument, documentToState } from '@/core/dataset';
import { indexEngine } from '@/core/indexes';
import { RECORD_KINDS, type AnyRecord, type CanonicalState, type ExamVersion, type RecordRef } from '@/core/schema';
import { createScopeOf, explainScope } from '@/core/graph';

function load(path: string): CanonicalState {
  const parsed = deserializeDocument(readFileSync(path, 'utf8'));
  if (!parsed.ok) throw new Error(`cannot load ${path}`);
  const loaded = documentToState(parsed.document);
  if (!loaded.ok) throw new Error(`duplicate IDs in ${path}`);
  return loaded.state;
}

describe.each([
  ['the demo', 'data/seed/demo.orn.json'],
  ['the maximal fixture', 'data/fixtures/schema/v2/maximal-valid.orn.json'],
])('explainScope over %s', (_name, path) => {
  const state = load(path);
  const indexes = indexEngine.build(state);
  const versions = Object.values(state.records.exam_version) as ExamVersion[];
  const refs: RecordRef[] = RECORD_KINDS.flatMap((kind) => Object.values(state.records[kind] as Record<string, AnyRecord>).map((r) => ({ kind, id: r.id }) as RecordRef));

  it('has exam versions to explain', () => {
    expect(versions.length).toBeGreaterThan(0);
  });

  it('agrees with createScopeOf and gives a reason that the data backs, for every record and version', () => {
    const seen = new Set<string>();
    for (const version of versions) {
      const scopeOf = createScopeOf(indexes, version.examId, version.id);
      for (const ref of refs) {
        const why = explainScope(indexes, ref, version);
        expect(why.scope).toBe(scopeOf(ref));
        seen.add(why.reason);
        if (why.reason === 'override') expect(why.overrideIds.length).toBeGreaterThan(0);
        if (why.reason === 'mapped') {
          expect(why.mappingIds.length).toBeGreaterThan(0);
          expect(why.topics.some((t) => t.mapped)).toBe(true);
        }
        if (why.reason === 'unmapped') {
          expect(why.scope).toBe('unmapped');
          expect(why.mappingIds).toEqual([]);
        }
        expect(explainScope(indexes, ref, version)).toEqual(why);
      }
    }
    expect(seen.has('unmapped')).toBe(true);
  });
});
