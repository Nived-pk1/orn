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
import { withVersionOffset } from '@/test-support/version-offset';

const read = (path: string): string => readFileSync(new URL(`../fixtures/migrations/${path}`, import.meta.url), 'utf8');
const v0 = JSON.parse(read('synthetic-v0.orn.json')) as MigratableDocument;
const minimal = JSON.parse(readFileSync(new URL('../../data/fixtures/schema/v1/minimal-valid.orn.json', import.meta.url), 'utf8')) as MigratableDocument;
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
    const migrated = migrate(v0);
    expect(DatasetDocumentSchema.safeParse(migrated).success).toBe(true);
    const species = (migrated.records['species'] as { provenance: { legacy?: { system: string } } }[])[0];
    expect(species?.provenance.legacy?.system).toBe(SYNTHETIC_SYSTEM);
    const withoutTrace = structuredClone(migrated) as MigratableDocument & { records: { species: { provenance: { legacy?: unknown } }[] } };
    delete (withoutTrace.records.species[0] as { provenance: { legacy?: unknown } }).provenance.legacy;
    expect(canonicalJson(withoutTrace)).toBe(canonicalJson(minimal));
  });
});
