/**
 * Migrations framework evidence and P-03 in its framework form (docs/IMPLEMENTATION_PLAN.md Phase 3 note 1, docs/
 * TEST_STRATEGY.md §4): no schema bump exists yet, so synthetic steps (test-support) over a frozen synthetic v0
 * fixture in tests/fixtures/migrations/ must produce output byte-equal to a committed expected file, the same on
 * every run and for every input key order, dropping nothing. The real form (frozen v1 fixtures → v2 expected)
 * starts with the first real bump. The flows that call an injected runner (boot, restore, import) are tested where
 * they live: persistence-boot*.test.ts, persistence-restore.test.ts and, from 3.6, the import tests.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MigratableDocument } from '@/core/migrations/contracts';
import { DatasetDocumentSchema } from '@/core/schema';
import { canonicalJson, reverseKeys, SYNTHETIC_STEPS, SYNTHETIC_SYSTEM } from '@/test-support/synthetic-migration';
import { withVersionOffset, withVersionOffsetToCurrent } from '@/test-support/version-offset';

const read = (path: string): string => readFileSync(new URL(`../fixtures/migrations/${path}`, import.meta.url), 'utf8');
const v0 = JSON.parse(read('synthetic-v0.orn.json')) as MigratableDocument;
const minimal = JSON.parse(readFileSync(new URL('../../data/fixtures/schema/v2/minimal-valid.orn.json', import.meta.url), 'utf8')) as MigratableDocument;
const runner = withVersionOffset(SYNTHETIC_STEPS);

function migrate(doc: MigratableDocument): MigratableDocument {
  const result = runner.run(doc);
  if (!result.ok) throw new Error(result.message);
  return result.doc;
}

/** Every leaf of a JSON value as `path = value`, for accounting that nothing was dropped. */
function leaves(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([k, v]) => leaves(v, path === '' ? k : `${path}.${k}`));
  return [`${path} = ${JSON.stringify(value)}`];
}

describe('P-03 (framework form): synthetic migration over a frozen synthetic fixture', () => {
  it('the frozen input is a version 0 document the real runner alone refuses', async () => {
    const { createMigrationRunner } = await import('@/core/migrations');
    expect(v0.schemaVersion).toBe(0);
    expect(createMigrationRunner().run(v0)).toMatchObject({ ok: false, code: 'INVALID_VERSION' });
  });

  it('produces output byte-equal to the committed expected file', () => {
    expect(canonicalJson(migrate(v0))).toBe(read('expected/synthetic-v1.canonical.json'));
  });

  it('is deterministic: the same bytes on every run and for a different input key order', () => {
    const first = canonicalJson(migrate(v0));
    expect(canonicalJson(migrate(v0))).toBe(first);
    expect(canonicalJson(migrate(reverseKeys(v0) as MigratableDocument))).toBe(first);
  });

  it('never mutates its input', () => {
    const before = canonicalJson(v0);
    migrate(v0);
    expect(canonicalJson(v0)).toBe(before);
  });

  it('drops nothing (INV-23): every input value is in the output or in provenance.legacy.unmapped, and the report says so', () => {
    const result = runner.run(v0);
    if (!result.ok) throw new Error(result.message);
    const out = new Set(leaves(result.doc));
    const missing = leaves(v0).filter((leaf) => !out.has(leaf));
    // The only input leaves without an identical output leaf are the version, the renamed meta field and the moved one.
    expect(missing.sort()).toEqual(
      ['schemaVersion = 0', `meta.name = ${JSON.stringify((v0['meta'] as { name: string }).name)}`, 'records.species[0].legacyColor = "blue"'].sort(),
    );
    expect(out).toContain('meta.title = ' + JSON.stringify((v0['meta'] as { name: string }).name));
    expect([...out].some((leaf) => leaf.endsWith(`provenance.legacy.unmapped.legacyColor = "blue"`))).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ from: 0, to: 1, changedRecordIds: [expect.stringMatching(/^spc_/)], notes: expect.arrayContaining(['meta.name renamed to meta.title']) });
  });

  it('the result passes the strict schema and equals the current minimal fixture apart from the moved field', () => {
    // v0 -> v1 (synthetic) -> v2 (the real step): a current document, and the strict schema accepts it
    const result = withVersionOffsetToCurrent(SYNTHETIC_STEPS).run(v0);
    if (!result.ok) throw new Error(result.message);
    const migrated = result.doc;
    expect(result.steps.map((s) => [s.from, s.to])).toEqual([[0, 1], [1, 2]]);
    expect(DatasetDocumentSchema.safeParse(migrated).success).toBe(true);
    const species = (migrated.records['species'] as { provenance: { legacy?: { system: string } } }[])[0];
    expect(species?.provenance.legacy?.system).toBe(SYNTHETIC_SYSTEM);
    const withoutTrace = structuredClone(migrated) as MigratableDocument & { records: { species: { provenance: { legacy?: unknown } }[] } };
    delete (withoutTrace.records.species[0] as { provenance: { legacy?: unknown } }).provenance.legacy;
    expect(canonicalJson(withoutTrace)).toBe(canonicalJson(minimal));
  });
});

describe('P-03 (real form, first bump 1 to 2, step 5.5c): the frozen v1 fixtures migrate to the committed v2 outputs', () => {
  const fixture = (path: string): string => readFileSync(new URL(`../../data/fixtures/schema/${path}.orn.json`, import.meta.url), 'utf8');
  const CASES = [['minimal', 'minimal-valid'], ['maximal', 'maximal-valid']] as const;

  it.each(CASES)('%s: the output is byte-equal to the committed expected file, and passes the strict schema', async (short, name) => {
    const { migrationRunner } = await import('@/core/migrations');
    const input = JSON.parse(fixture(`v1/${name}`)) as MigratableDocument;
    const result = migrationRunner.run(input);
    if (!result.ok) throw new Error(result.message);
    expect(canonicalJson(result.doc)).toBe(canonicalJson(JSON.parse(fixture(`v2/expected/${short}-from-v1`))));
    expect(DatasetDocumentSchema.safeParse(result.doc).success).toBe(true);
  });

  it.each(CASES)('%s: the same bytes for a different input key order, the input is never mutated, and nothing is dropped (INV-23)', async (_short, name) => {
    const { migrationRunner } = await import('@/core/migrations');
    const input = JSON.parse(fixture(`v1/${name}`)) as MigratableDocument;
    const before = canonicalJson(input);
    const first = migrationRunner.run(input);
    const second = migrationRunner.run(reverseKeys(input) as MigratableDocument);
    if (!first.ok || !second.ok) throw new Error('migration failed');
    expect(canonicalJson(second.doc)).toBe(canonicalJson(first.doc));
    expect(canonicalJson(input)).toBe(before);
    const lost = leaves(input).filter((leaf) => !leaf.startsWith('schemaVersion = ') && !new Set(leaves(first.doc)).has(leaf));
    expect(lost).toEqual([]);
    expect(first.steps).toEqual([expect.objectContaining({ from: 1, to: 2, changedRecordIds: [] })]);
  });

  it('a version 2 file written by this app is not migrated again (the chain starts at the file\'s own version)', async () => {
    const { migrationRunner } = await import('@/core/migrations');
    const v2 = JSON.parse(fixture('v2/maximal-valid')) as MigratableDocument;
    expect(migrationRunner.run(v2)).toMatchObject({ ok: true, steps: [] });
  });
});
