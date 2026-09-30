/**
 * Step 3.10, INV-23: every leaf of `compounds[]` is consumed by a mapping (the trace), counted as consumed by default (§4.8, empty
 * values v6 replaced), or present in some record's `provenance.legacy.unmapped`. Checked over both real fixtures, the quirk workbook
 * and a hostile document of wrong-typed values.
 *
 * The leaves are enumerated HERE, from the legacy JSON, with a walker of this file: the mapper's trace only answers "was this leaf
 * consumed", it never says what exists. A second check reads consumed leaves back out of the output records for the fields that
 * are copied verbatim, so a trace that claims a leaf the record does not hold is caught too. A third proves every RAW leaf of the
 * input is either a leaf of the v5 data or a dropped leaf (so the two buckets together are the whole input).
 */
import { describe, expect, it } from 'vitest';
import type { AnyRecord } from '@/core/schema';
import { allRecords, mapLegacy, type MappedFixture } from '@/test-support/legacy-map-kit';
import { legacyFixture, legacyTestFixture } from '@/test-support/legacy-kit';

type Scalar = string | number | boolean | null;
interface Leaf {
  readonly path: string;
  readonly index: number;
  readonly key: string;
  readonly sub: readonly (string | number)[];
  readonly value: Scalar;
}

/** Every scalar leaf under `compounds[i]`, spelled like the mapper spells paths (`a.b[0]`), enumerated independently. */
function compoundLeaves(compounds: unknown): Leaf[] {
  const out: Leaf[] = [];
  const walk = (value: unknown, sub: (string | number)[], index: number): void => {
    if (Array.isArray(value)) value.forEach((item, i) => walk(item, [...sub, i], index));
    else if (typeof value === 'object' && value !== null) for (const [k, v] of Object.entries(value)) walk(v, [...sub, k], index);
    else {
      const text = sub.reduce<string>((acc, part) => (typeof part === 'number' ? `${acc}[${part}]` : /^[A-Za-z_$][\w$]*$/.test(part) ? `${acc}.${part}` : `${acc}[${JSON.stringify(part)}]`), `compounds[${index}]`);
      out.push({ path: text, index, key: String(sub[0]), sub, value: value as Scalar });
    }
  };
  (Array.isArray(compounds) ? compounds : []).forEach((compound, index) => {
    if (typeof compound === 'object' && compound !== null && !Array.isArray(compound)) for (const [k, v] of Object.entries(compound)) walk(v, [k], index);
  });
  return out;
}

function scalarsOf(value: unknown, into: Scalar[] = []): Scalar[] {
  if (value === undefined) return into;
  if (Array.isArray(value)) value.forEach((item) => scalarsOf(item, into));
  else if (typeof value === 'object' && value !== null) Object.values(value).forEach((item) => scalarsOf(item, into));
  else into.push(value as Scalar);
  return into;
}

/** The record of compounds[index]: the n-th record (in output order) carrying its legacy ID, n = how many earlier compounds have that ID. */
function recordAt(run: MappedFixture, records: readonly AnyRecord[], index: number): AnyRecord | undefined {
  const id = (run.data.compounds[index] as { id?: unknown }).id;
  const earlier = run.data.compounds.slice(0, index).filter((c) => (c as { id?: unknown }).id === id).length;
  return records.filter((record) => (record.kind === 'species' || record.kind === 'class') && record.provenance.legacy?.legacyId === id)[earlier];
}

const isEmptyScalar = (value: Scalar): boolean => value === '' || value === null;

/**
 * Leaves that are none of: consumed, counted by default, or found in the record's unmapped. `consumed` is passed in so the checker
 * can be tested against a trace with a hole.
 */
function unaccounted(run: MappedFixture, consumed: ReadonlySet<string>): string[] {
  const records = allRecords(run.mapped);
  const missing: string[] = [];
  const unmappedPool = new Map<number, Scalar[]>();
  const poolOf = (index: number): Scalar[] => {
    let pool = unmappedPool.get(index);
    if (pool === undefined) {
      const record = recordAt(run, records, index);
      const unmapped = record !== undefined && (record.kind === 'species' || record.kind === 'class') ? record.provenance.legacy?.unmapped : undefined;
      pool = scalarsOf(unmapped);
      unmappedPool.set(index, pool);
    }
    return pool;
  };
  const takeFrom = (index: number, value: Scalar): boolean => {
    const pool = poolOf(index);
    const at = pool.findIndex((candidate) => candidate === value);
    if (at < 0) return false;
    pool.splice(at, 1);
    return true;
  };
  // 1. the leaves of the v5 data the mapper received
  for (const leaf of compoundLeaves(run.data.compounds)) {
    if (!consumed.has(leaf.path) && !takeFrom(leaf.index, leaf.value)) missing.push(`data ${leaf.path} = ${JSON.stringify(leaf.value)}`);
  }
  // 2. the leaves the v4 → v5 port dropped (§4.8)
  const byDefault = new Map<string, number>();
  for (const dropped of run.normalized.dropped) {
    const match = /^compounds\[(\d+)\]/.exec(dropped.path);
    if (match === null) continue;
    if (isEmptyScalar(dropped.value)) {
      const key = dropped.path.replace(/\[\d+\]/g, '[*]');
      byDefault.set(key, (byDefault.get(key) ?? 0) + 1);
    } else if (!takeFrom(Number(match[1]), dropped.value)) missing.push(`dropped ${dropped.path} = ${JSON.stringify(dropped.value)}`);
  }
  for (const [key, count] of byDefault) if (run.mapped.report.consumedByDefault[key] !== count) missing.push(`consumedByDefault ${key}: report ${String(run.mapped.report.consumedByDefault[key])}, expected ${count}`);
  for (const key of Object.keys(run.mapped.report.consumedByDefault)) if (!byDefault.has(key)) missing.push(`consumedByDefault ${key} counted for nothing`);
  return missing;
}

/** Fields copied verbatim: where a consumed leaf's value must be found in the record. */
const VERBATIM: Readonly<Record<string, (record: AnyRecord, value: string) => boolean>> = {
  id: (r, v) => (r.kind === 'species' || r.kind === 'class') && r.provenance.legacy?.legacyId === v,
  name: (r, v) => (r.kind === 'species' || r.kind === 'class') && r.names.canonical === v,
  smiles: (r, v) => r.kind === 'species' && r.structure?.value === v,
  formula: (r, v) => (r.kind === 'species' && r.formula === v) || (r.kind === 'class' && r.generic?.generalFormula === v),
  properties: (r, v) => (r.kind === 'species' && r.notes === v) || (r.kind === 'class' && r.description === v),
  acidBase: (r, v) => r.kind === 'species' && r.acidBaseNotes === v,
  genericFormula: (r, v) => r.kind === 'class' && r.generic?.formulaText === v,
  tags: (r, v) => (r.kind === 'species' || r.kind === 'class') && r.tags.includes(v),
};

function readBack(run: MappedFixture): string[] {
  const records = allRecords(run.mapped);
  const wrong: string[] = [];
  for (const leaf of compoundLeaves(run.data.compounds)) {
    if (!run.mapped.consumed.has(leaf.path) || typeof leaf.value !== 'string' || leaf.value === '') continue;
    const record = recordAt(run, records, leaf.index);
    const check = leaf.sub.length === 1 || leaf.key === 'tags' ? VERBATIM[leaf.key] : undefined;
    if (record === undefined) wrong.push(`no record for ${leaf.path}`);
    else if (check !== undefined && !check(record, leaf.value)) wrong.push(`${leaf.path} = ${JSON.stringify(leaf.value)} is claimed as consumed but the record does not hold it`);
    else if (leaf.key === 'jee' && leaf.sub[1] === 'notes' && !((record.kind === 'species' || record.kind === 'class') && record.studyNotes === leaf.value)) wrong.push(`${leaf.path} not in studyNotes`);
  }
  return wrong;
}

const hostile = {
  schemaVersion: 5,
  reactions: [],
  compounds: [
    { id: 'c1', name: 5, smiles: { a: 1 }, formula: ['x'], properties: 'x'.repeat(50_001), tags: ['ok', 7, 'y'.repeat(70), ''], jee: 'text', functionalGroups: 'alkene, mystery', fgId: 12, compoundClass: ['a'], image: 3, node: 0, aromaticity: 4, stereo: 'S', acidBase: 'bad\u0001text', genericFormula: 'R–H' },
    { id: 'c2', name: 'Hub', nodeType: 'major', smiles: 'CC', formula: 'CnH2n', properties: 'p', acidBase: 'a', aromaticity: 'aromatic', stereo: 's', genericFormula: 'R–X', fgId: 'alkene', functionalGroups: ['alkene', 'x'], compoundClass: 'cc', jee: { level: 'L', notes: 'n', extra: [1, { z: null }] }, tags: ['t'], image: '' },
    { id: 'c3', name: 'Other', jee: { level: '', notes: '' }, unknownScalar: 1, unknownList: ['a', ['b']], unknownObject: { k: { l: false } } },
    { id: 'c4' },
    { name: 'no id' },
    { id: 'c1', name: 'duplicate id' },
  ],
};

const INPUTS: readonly (readonly [string, () => unknown])[] = [
  ['v6-demo-export.json (21 compounds)', () => legacyFixture('v6-demo-export.json')],
  ['v4-sample.json (6 compounds)', () => legacyFixture('v4-sample.json')],
  ['the quirk workbook', () => legacyTestFixture('quirks.json')],
  ['a hostile document of wrong-typed values', () => hostile],
];

describe('INV-23: every leaf of compounds[] is consumed, consumed by default, or in some record\'s legacy.unmapped', () => {
  it.each(INPUTS)('%s', async (_name, input) => {
    const run = await mapLegacy(structuredClone(input()));
    expect(run.data.compounds.length).toBeGreaterThan(0);
    expect(unaccounted(run, run.mapped.consumed)).toEqual([]);
  });

  it.each(INPUTS)('%s: every consumed leaf that is copied verbatim is in the record', async (_name, input) => {
    expect(readBack(await mapLegacy(structuredClone(input())))).toEqual([]);
  });

  it.each(INPUTS)('%s: every RAW leaf is a leaf of the v5 data or a dropped leaf (the two buckets are the whole input)', async (_name, input) => {
    const raw = structuredClone(input());
    const run = await mapLegacy(structuredClone(raw));
    const rawCompounds = (raw as { compounds?: unknown }).compounds;
    const kept = new Map<number, Scalar[]>();
    for (const leaf of compoundLeaves(run.data.compounds)) kept.set(leaf.index, [...(kept.get(leaf.index) ?? []), leaf.value]);
    const droppedOf = (index: number): Scalar[] => run.normalized.dropped.filter((d) => d.path.startsWith(`compounds[${index}]`)).map((d) => d.value);
    const lost: string[] = [];
    for (const leaf of compoundLeaves(rawCompounds)) {
      const pool = [...(kept.get(leaf.index) ?? []), ...droppedOf(leaf.index)];
      // a missing id is replaced by a placeholder, so records without one have no raw `id` leaf to check
      if (!pool.includes(leaf.value)) lost.push(`${leaf.path} = ${JSON.stringify(leaf.value)}`);
    }
    expect(lost).toEqual([]);
  });

  it.each(INPUTS)('%s: every mapped record passes strict L1 (both hub decisions)', async (_name, input) => {
    const { AnyRecordSchema } = await import('@/core/schema');
    const first = await mapLegacy(structuredClone(input()));
    const species = await mapLegacy(structuredClone(input()), {}, new Map(first.mapped.hubs.map((hub) => [hub.key, 'species'] as const)));
    for (const run of [first, species]) for (const record of allRecords(run.mapped)) expect(AnyRecordSchema.safeParse(record), record.id).toMatchObject({ success: true });
  });

  it.each(INPUTS)('%s: the mapped records alone have no L2/L3 ERROR (both hub decisions)', async (_name, input) => {
    const { validator } = await import('@/core/validation');
    const { coreIndexEngine } = await import('@/core/indexes/engine');
    const { stateOfRecords } = await import('@/test-support/legacy-map-kit');
    const first = await mapLegacy(structuredClone(input()));
    const species = await mapLegacy(structuredClone(input()), {}, new Map(first.mapped.hubs.map((hub) => [hub.key, 'species'] as const)));
    for (const run of [first, species]) {
      const state = stateOfRecords(allRecords(run.mapped));
      const errors = validator.validateAll(state, coreIndexEngine.build(state, 1)).filter((finding) => finding.severity === 'error');
      expect(errors.map((finding) => `${finding.ruleId} ${JSON.stringify(finding.subject)}`)).toEqual([]);
    }
  });

  it('the checker itself notices a leaf that is neither consumed nor kept (a trace with a hole)', async () => {
    const run = await mapLegacy(structuredClone(legacyFixture('v6-demo-export.json')));
    const holed = new Set(run.mapped.consumed);
    holed.delete('compounds[3].name');
    expect(unaccounted(run, holed)).toEqual([expect.stringContaining('compounds[3].name')]);
    const forged = new Set(run.mapped.consumed);
    forged.add('compounds[0].smiles'); // hub SMILES is in unmapped, not consumed: claiming it is harmless to accounting...
    expect(unaccounted(run, forged)).toEqual([]);
    expect(readBack({ ...run, mapped: { ...run.mapped, consumed: forged } })).toEqual([expect.stringContaining('compounds[0].smiles')]); // ...but the read-back catches the false claim
  });

  it('nothing the mapper keeps is invented: every unmapped scalar is a leaf of the legacy input', async () => {
    for (const [, input] of INPUTS) {
      const run = await mapLegacy(structuredClone(input()));
      const inputLeaves = new Set<Scalar>([...compoundLeaves(run.data.compounds).map((l) => l.value), ...run.normalized.dropped.map((d) => d.value)]);
      for (const record of allRecords(run.mapped)) {
        if (record.kind !== 'species' && record.kind !== 'class') continue;
        // created classes carry no legacy value at all; mapped compounds carry nothing but input values
        for (const value of scalarsOf(record.provenance.legacy?.unmapped)) expect(inputLeaves.has(value), `${record.id}: ${JSON.stringify(value)}`).toBe(true);
      }
    }
  });
});
