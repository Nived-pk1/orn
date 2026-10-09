/**
 * Registry coverage (docs/TEST_STRATEGY.md §2): every ID-shaped value in the maximal fixture is
 * accounted for by the reference registry, every registry entry is exercised by the fixture, and
 * everything the engine extracts resolves. Together these pin the registry to the schema.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  NESTED_ID_PREFIX,
  NESTED_ID_SPECS,
  RECORD_ID_PREFIX,
  RECORD_KINDS,
  RECORD_SCHEMAS,
  REFERENCE_SPECS,
  idPattern,
  type AnyRecord,
  type RecordKind,
  type ReferenceSpec,
} from '../schema';
import { createReferenceEngine } from './engine';
import { formatPath, matchPath, parsePath, type PathToken } from './paths';

const fixture = JSON.parse(
  readFileSync(new URL('../../../data/fixtures/schema/v2/maximal-valid.orn.json', import.meta.url), 'utf8'),
) as { records: Record<RecordKind, AnyRecord[]> };

const engine = createReferenceEngine();
const allRecords: readonly AnyRecord[] = RECORD_KINDS.flatMap((kind) => fixture.records[kind] ?? []);
const ID_SHAPES = [...Object.values(RECORD_ID_PREFIX), ...Object.values(NESTED_ID_PREFIX)].map(idPattern);
const isIdShaped = (value: string): boolean => ID_SHAPES.some((shape) => shape.test(value));

/** `participants[3].ref.id` → `participants[].ref.id` */
const generic = (tokens: readonly PathToken[]): string =>
  tokens.reduce<string>(
    (text, token) => (typeof token === 'number' ? `${text}[]` : text === '' ? token : `${text}.${token}`),
    '',
  );

/**
 * Foreign identifiers, not references: the legacy system's own ID and its free-form leftovers
 * (LegacyTraceSchema, MIGRATION.md). They are opaque text and are never resolved or remapped.
 */
const FOREIGN_ID_PATHS: readonly string[] = ['provenance.legacy.legacyId', 'provenance.legacy.unmapped'];

function idLeaves(value: unknown, tokens: readonly PathToken[], out: { path: string; id: string }[]): void {
  if (FOREIGN_ID_PATHS.includes(generic(tokens))) return;
  if (typeof value === 'string') {
    if (isIdShaped(value)) out.push({ path: generic(tokens), id: value });
  } else if (Array.isArray(value)) {
    value.forEach((element: unknown, i) => idLeaves(element, [...tokens, i], out));
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) idLeaves(child, [...tokens, key], out);
  }
}

/** Locations a registry declares as ID-carrying, per owner kind, in the generic path form. */
function coveredLocations(specs: readonly ReferenceSpec[], nested = NESTED_ID_SPECS): Set<string> {
  const covered = new Set<string>();
  for (const kind of RECORD_KINDS) covered.add(`${kind}:id`);
  for (const spec of specs) covered.add(`${spec.owner}:${spec.path}${spec.target.type === 'ref' ? '.id' : ''}`);
  for (const spec of nested) covered.add(`${spec.owner}:${spec.path}`);
  return covered;
}

function uncoveredIdValues(specs: readonly ReferenceSpec[]): string[] {
  const covered = coveredLocations(specs);
  const missing = new Set<string>();
  for (const record of allRecords) {
    const leaves: { path: string; id: string }[] = [];
    idLeaves(record, [], leaves);
    for (const leaf of leaves) if (!covered.has(`${record.kind}:${leaf.path}`)) missing.add(`${record.kind}:${leaf.path}`);
  }
  return [...missing].sort();
}

describe('reference registry coverage', () => {
  it('covers every ID-shaped value in the maximal fixture', () => {
    expect(uncoveredIdValues(REFERENCE_SPECS)).toEqual([]);
  });

  it('is not vacuous: the check reports a reference that is missing from the registry', () => {
    const without = REFERENCE_SPECS.filter((s) => !(s.owner === 'reaction' && s.path === 'outcomes[].products[].ref'));
    expect(uncoveredIdValues(without)).toEqual(['reaction:outcomes[].products[].ref.id']);
  });

  it('exercises every registry entry: each spec matches something in the fixture', () => {
    const dead = REFERENCE_SPECS.filter(
      (spec) => !allRecords.some((r) => r.kind === spec.owner && matchPath(r, parsePath(spec.path)).length > 0),
    ).map((spec) => `${spec.owner}:${spec.path}`);
    const deadNested = NESTED_ID_SPECS.filter(
      (spec) => !allRecords.some((r) => r.kind === spec.owner && matchPath(r, parsePath(spec.path)).length > 0),
    ).map((spec) => `${spec.owner}:${spec.path}`);
    expect([...dead, ...deadNested]).toEqual([]);
  });

  it('keeps nested ID prefixes consistent with the schema ID prefixes', () => {
    for (const spec of NESTED_ID_SPECS) {
      const shape = idPattern(spec.prefix);
      const ids = allRecords.filter((r) => r.kind === spec.owner).flatMap((r) => engine.nestedIds(r).filter((n) => n.path.replace(/\[\d+\]/g, '[]') === spec.path));
      expect(ids.length, spec.path).toBeGreaterThan(0);
      for (const { id } of ids) expect(shape.test(id), `${spec.path}: ${id}`).toBe(true);
    }
  });
});

describe('extracted references resolve inside the maximal fixture', () => {
  const kindById = new Map<string, RecordKind>(allRecords.map((r) => [r.id, r.kind]));
  const recordById = new Map<string, AnyRecord>(allRecords.map((r) => [r.id, r]));
  const idsIn = (record: AnyRecord, collection: string): Set<string> =>
    new Set(matchPath(record, parsePath(`${collection}[].id`)).map((m) => String(m.value)));

  it('resolves id, ref, local and nested targets with the right kind and layer', () => {
    const problems: string[] = [];
    let checked = 0;
    for (const record of allRecords) {
      for (const ref of engine.extract(record)) {
        checked += 1;
        const where = `${record.id} ${ref.path} -> ${ref.targetId}`;
        const { target } = ref.spec;
        if (target.type === 'id' || target.type === 'ref') {
          const kind = kindById.get(ref.targetId);
          const allowed = target.type === 'id' ? [target.kind] : target.kinds;
          if (kind === undefined) problems.push(`dangling: ${where}`);
          else if (kind !== ref.targetKind || !allowed.includes(kind)) problems.push(`wrong kind ${kind}: ${where}`);
        } else if (target.type === 'local') {
          if (!idsIn(record, target.collection).has(ref.targetId)) problems.push(`unresolved local: ${where}`);
        } else {
          const container = ref.containerRecordId === undefined ? undefined : recordById.get(ref.containerRecordId);
          if (container?.kind !== target.kind) problems.push(`no container: ${where}`);
          else if (!idsIn(container, target.collection).has(ref.targetId)) problems.push(`unresolved nested: ${where}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(checked).toBeGreaterThan(150);
  });
});

describe('engine over the maximal fixture', () => {
  it('nested IDs are globally unique together with record IDs (INV-01)', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const record of allRecords) {
      for (const id of [record.id, ...engine.nestedIds(record).map((n) => n.id)]) {
        if (seen.has(id)) dupes.push(id);
        seen.add(id);
      }
    }
    expect(dupes).toEqual([]);
  });

  it('remaps every ID and reference and changes nothing else', () => {
    const idMap = new Map<string, string>();
    for (const record of allRecords) {
      idMap.set(record.id, `${record.id}-copy`);
      for (const { id } of engine.nestedIds(record)) idMap.set(id, `${id}-copy`);
    }
    const replaceIds = (value: unknown, tokens: readonly PathToken[] = []): unknown =>
      FOREIGN_ID_PATHS.includes(generic(tokens))
        ? value
        : typeof value === 'string'
          ? (idMap.get(value) ?? value)
          : Array.isArray(value)
            ? value.map((element: unknown, i) => replaceIds(element, [...tokens, i]))
            : typeof value === 'object' && value !== null
              ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceIds(v, [...tokens, k])]))
              : value;
    for (const record of allRecords) {
      const remapped = engine.remap(record, idMap);
      expect(remapped, record.id).toEqual(replaceIds(record));
      expect(RECORD_SCHEMAS[record.kind].safeParse(remapped).success, record.id).toBe(true);
      expect(engine.remap(remapped, new Map())).toBe(remapped);
    }
  });

  it('detaching any single referenced target keeps the record schema-valid and removes the reference', () => {
    const problems: string[] = [];
    let detached = 0;
    for (const record of allRecords) {
      const schema = RECORD_SCHEMAS[record.kind] as z.ZodType;
      const before = engine.extract(record);
      const targets = new Set(before.filter((r) => r.spec.onDelete === 'detach').map((r) => r.targetId));
      for (const id of targets) {
        const after = engine.detach(record, new Set([id]));
        detached += 1;
        if (after === record) problems.push(`unchanged: ${record.id} ${id}`);
        const remaining = engine.extract(after).filter((r) => r.targetId === id && r.spec.onDelete === 'detach');
        if (remaining.length > 0) problems.push(`still referenced: ${record.id} ${remaining.map((r) => formatPath([r.path]))}`);
        const parsed = schema.safeParse(after);
        if (!parsed.success) problems.push(`invalid after detach: ${record.id} ${id}: ${parsed.error.issues[0]?.message}`);
      }
    }
    expect(problems).toEqual([]);
    expect(detached).toBeGreaterThan(80);
  });

  it('never detaches restrict or cascade references', () => {
    const problems: string[] = [];
    for (const record of allRecords) {
      const blocked = engine.extract(record).filter((r) => r.spec.onDelete !== 'detach');
      const detachIds = new Set(engine.extract(record).filter((r) => r.spec.onDelete === 'detach').map((r) => r.targetId));
      const ids = new Set(blocked.map((r) => r.targetId).filter((id) => !detachIds.has(id)));
      if (ids.size > 0 && engine.detach(record, ids) !== record) problems.push(record.id);
    }
    expect(problems).toEqual([]);
  });
});
