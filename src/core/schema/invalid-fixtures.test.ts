/**
 * Invalid fixtures — one dataset per L1/L2 failure class (docs/TEST_STRATEGY.md §2).
 * L1 files must fail the strict document schema, and only at the declared path, so a fixture
 * cannot pass for the wrong reason. L2 files must be structurally valid; step 1.7 asserts that
 * the L2 validator raises exactly the declared rule on the declared record and field.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { upgradeFrozenFixture } from '../../test-support/fixture-upgrade';
import { CURRENT_SCHEMA_VERSION, DatasetDocumentSchema, REFERENCE_SPECS, type RecordKind } from './index';

const DIR = new URL('../../../data/fixtures/schema/v1/invalid/', import.meta.url);

interface ManifestCase {
  readonly file: string;
  readonly level: 'L1' | 'L2';
  readonly rule: string;
  readonly severity: 'ERROR' | 'WARNING';
  readonly covers: readonly string[];
  readonly description: string;
  readonly issuePath?: readonly (string | number)[];
  readonly record?: { readonly kind: RecordKind; readonly id: string };
  readonly field?: string;
  readonly note?: string;
}

const manifest = JSON.parse(readFileSync(new URL('manifest.json', DIR), 'utf8')) as { cases: ManifestCase[] };
/** The frozen version 1 file, brought to the current version by the real migration step (it changes nothing but the number). */
const load = (file: string): unknown => {
  const raw = upgradeFrozenFixture(JSON.parse(readFileSync(new URL(file, DIR), 'utf8'))) as { schemaVersion?: unknown };
  // "newer than this app" is relative to the app: a frozen number cannot stay newer, so this file is always one version ahead
  return file === 'l1-newer-schema-version.json' ? { ...raw, schemaVersion: CURRENT_SCHEMA_VERSION + 1 } : raw;
};
const l1Cases = manifest.cases.filter((c) => c.level === 'L1');
const l2Cases = manifest.cases.filter((c) => c.level === 'L2');

describe('invalid fixture manifest', () => {
  it('lists every fixture file exactly once', () => {
    const files = readdirSync(DIR).filter((name) => name !== 'manifest.json').sort();
    const listed = manifest.cases.map((c) => c.file).sort();
    expect(listed).toEqual(files);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('covers every L2 reference rule (VALIDATION_RULES.md §3)', () => {
    const rules = new Set(l2Cases.map((c) => c.rule));
    for (const rule of ['REF-001', 'REF-002', 'REF-003', 'REF-004', 'REF-005', 'REF-006', 'REF-007', 'REF-008']) {
      expect(rules.has(rule), rule).toBe(true);
    }
  });

  it('covers the L1 adversarial rows of Gate A and E (ADV-029, ADV-033, ADV-034, ADV-037)', () => {
    const covered = new Set(l1Cases.flatMap((c) => c.covers));
    for (const adv of ['ADV-029', 'ADV-033', 'ADV-034', 'ADV-037']) expect(covered.has(adv), adv).toBe(true);
  });
});

describe.each(l1Cases)('L1 fixture $file', (entry) => {
  it(`is rejected only at ${entry.issuePath?.join('.') ?? '?'} — ${entry.description}`, () => {
    const result = DatasetDocumentSchema.safeParse(load(entry.file));
    expect(result.success).toBe(false);
    const issues = result.error?.issues ?? [];
    expect(issues.length).toBeGreaterThan(0);
    const expected = entry.issuePath ?? [];
    for (const issue of issues) expect(issue.path.slice(0, expected.length), issue.message).toEqual(expected);
  });
});

describe.each(l2Cases)('L2 fixture $file', (entry) => {
  it(`is structurally valid (${entry.rule} is referential) — ${entry.description}`, () => {
    const document = load(entry.file);
    const result = DatasetDocumentSchema.safeParse(document);
    expect(result.success, JSON.stringify(result.error?.issues.slice(0, 3))).toBe(true);
    expect(result.data).toEqual(document);
  });

  it('names a record that exists and a field the rule can address', () => {
    const { record, field, rule } = entry;
    expect(record && field).toBeTruthy();
    if (!record || !field) return;
    const records = (load(entry.file) as { records: Record<string, { id: string }[]> }).records[record.kind] ?? [];
    expect(records.some((r) => r.id === record.id)).toBe(true);
    if (['REF-001', 'REF-002', 'REF-003', 'REF-004', 'REF-005', 'REF-007'].includes(rule)) {
      const paths = REFERENCE_SPECS.filter((spec) => spec.owner === record.kind).map((spec) => spec.path);
      expect(paths).toContain(field);
    }
  });
});
