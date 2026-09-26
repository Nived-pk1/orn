/**
 * L1: `parseRecord` accepts every valid record unchanged, and rejects the invalid fixtures' records
 * with a finding at the declared path (ADV-029, ADV-034, ADV-037 at record level).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatPath } from '../references';
import { RECORD_KINDS, type RecordKind } from '../schema';
import { loadFixtureState, must } from '../../test-support/state-fixture';
import { MAX_SCHEMA_FINDINGS, OVERFLOW_PATH, SCHEMA_RULE_ID, parseRecord } from './l1';

const DIR = new URL('../../../data/fixtures/schema/v1/invalid/', import.meta.url);
interface Case {
  readonly file: string;
  readonly level: 'L1' | 'L2';
  readonly issuePath?: readonly (string | number)[];
  readonly covers: readonly string[];
}
const l1Cases = (JSON.parse(readFileSync(new URL('manifest.json', DIR), 'utf8')) as { cases: Case[] }).cases.filter(
  (c) => c.level === 'L1' && c.issuePath?.[0] === 'records' && c.issuePath.length >= 3,
);

const maximal = loadFixtureState('maximal-valid');
const speciesRecord = (): Record<string, unknown> => structuredClone(must(Object.values(maximal.records.species)[0])) as unknown as Record<string, unknown>;

describe('parseRecord: valid records', () => {
  it('accepts every record of the maximal fixture and returns it unchanged (INV-24)', () => {
    let count = 0;
    for (const kind of RECORD_KINDS) {
      for (const record of Object.values(maximal.records[kind])) {
        const result = parseRecord(kind, record);
        expect(result.ok, `${kind} ${record.id}`).toBe(true);
        if (result.ok) expect(result.record).toEqual(record);
        count += 1;
      }
    }
    expect(count).toBeGreaterThan(20);
  });

  it('does not modify its input', () => {
    const input = speciesRecord();
    const copy = structuredClone(input);
    parseRecord('species', { ...input, stray: 1 });
    parseRecord('species', input);
    expect(input).toEqual(copy);
  });
});

describe.each(l1Cases)('L1 fixture $file', (entry) => {
  it('gives a SCHEMA finding at the declared path for the offending record', () => {
    const doc = JSON.parse(readFileSync(new URL(entry.file, DIR), 'utf8')) as { records: Record<string, unknown[]> };
    const [, kind, index, ...rest] = must(entry.issuePath);
    const value = must(doc.records[String(kind)])[Number(index)];
    const result = parseRecord(kind as RecordKind, value);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const path = formatPath(rest);
    const at = (f: { path?: string | undefined }): string => f.path ?? '';
    expect(
      result.findings.some((f) => at(f) === path || at(f).startsWith(`${path}.`) || at(f).startsWith(`${path}[`) || path.startsWith(`${at(f)}.`)),
      `${path} in ${JSON.stringify(result.findings.map((f) => f.path))}`,
    ).toBe(true);
    for (const f of result.findings) {
      expect(f).toMatchObject({ ruleId: SCHEMA_RULE_ID, level: 1, severity: 'error' });
      expect(f.id).toMatch(/^fnd_[0-9a-f]{16}$/);
    }
  });
});

describe('parseRecord: findings', () => {
  it('rejects UI state smuggled into a record with a message naming the key, not its value (ADV-029)', () => {
    const result = parseRecord('species', { ...speciesRecord(), selected: 'SECRET-VALUE' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toContain('"selected"');
    expect(result.findings[0]?.message).not.toContain('SECRET-VALUE');
    expect(result.findings[0]?.subject).toEqual({ kind: 'species', id: must(Object.values(maximal.records.species)[0]).id });
  });

  it('rejects bidi and control characters and non-finite numbers (ADV-034, ADV-037)', () => {
    const bidi = { ...speciesRecord(), notes: 'safe‮text' };
    const control = { ...speciesRecord(), notes: 'a\u0000b' };
    for (const value of [bidi, control]) {
      const result = parseRecord('species', value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.findings.map((f) => f.path)).toContain('notes');
    }
    const record = must(Object.values(maximal.records.reaction).find((r) => r.conditionVariants.length > 0));
    const bad = structuredClone(record) as unknown as { conditionVariants: { conditions?: Record<string, unknown> }[] };
    const variant = must(bad.conditionVariants[0]);
    variant.conditions = { ...(variant.conditions ?? {}), temperature: { kind: 'value', value: Number.NaN, unit: 'K' } };
    expect(parseRecord('reaction', bad).ok).toBe(false);
  });

  it('gives one finding per failing path, joining several problems at one path', () => {
    const result = parseRecord('species', { ...speciesRecord(), notes: 'x\u0000'.repeat(50_000) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const atNotes = result.findings.filter((f) => f.path === 'notes');
    expect(atNotes).toHaveLength(1);
    expect(atNotes[0]?.message).toContain('; ');
  });

  it('has stable finding IDs: same problem, same ID, whatever else changes', () => {
    const a = parseRecord('species', { ...speciesRecord(), stray: 1 });
    const b = parseRecord('species', { ...speciesRecord(), stray: 'other value' });
    expect(a.ok || b.ok).toBe(false);
    if (a.ok || b.ok) return;
    expect(a.findings.map((f) => f.id)).toEqual(b.findings.map((f) => f.id));
  });

  it('caps the findings per record and says how many were left out', () => {
    const many = { ...speciesRecord(), classIds: Array.from({ length: 80 }, (_, i) => i) };
    const result = parseRecord('species', many);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.findings.length).toBeLessThanOrEqual(MAX_SCHEMA_FINDINGS + 1);
    const summary = result.findings.find((f) => f.path === OVERFLOW_PATH);
    expect(summary?.data?.['omitted']).toBeGreaterThan(0);
  });

  it.each([null, undefined, 5, 'text', [], true])('never throws on the non-record %j', (value) => {
    const result = parseRecord('species', value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.findings.length).toBeGreaterThan(0);
  });

  it('never invents a subject ID and cleans a hostile one', () => {
    const noId = parseRecord('species', {});
    if (!noId.ok) expect(noId.findings.every((f) => f.subject.id === '')).toBe(true);
    const hostile = parseRecord('species', { id: `spc_${'x'.repeat(200)}‮`, kind: 'species' });
    if (!hostile.ok) {
      const id = must(hostile.findings[0]).subject.id;
      expect(id.length).toBeLessThanOrEqual(80);
      expect(id).not.toContain('‮');
    }
  });

  it('reports an unknown kind as a finding, not an exception', () => {
    const result = parseRecord('__proto__' as RecordKind, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.findings[0]?.message).toContain('not a record kind');
  });
});
