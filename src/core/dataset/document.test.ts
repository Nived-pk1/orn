/**
 * Document ↔ state and deterministic serialisation (INV-01, INV-19; P-02 in its in-memory form).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, RECORD_KINDS, type CanonicalState, type DatasetDocument, type RecordKind } from '../schema';
import { documentToState, stateToDocument, type ExportOptions } from './document';
import { deserializeDocument, serializeDocument } from './serialize';

const FIXTURES = ['minimal-valid', 'maximal-valid'] as const;
const read = (name: string): string =>
  readFileSync(new URL(`../../../data/fixtures/schema/v2/${name}.orn.json`, import.meta.url), 'utf8');

function load(name: string): DatasetDocument {
  const result = deserializeDocument(read(name));
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.document;
}

function toState(doc: DatasetDocument): CanonicalState {
  const result = documentToState(doc);
  if (!result.ok) throw new Error('duplicate IDs');
  return result.state;
}

/** Options that reproduce the document's envelope, including embedded assets carried beside the state. */
const exportOptions = (doc: DatasetDocument): ExportOptions => ({
  exportedAt: doc.exportedAt,
  exportScope: doc.exportScope,
  generator: doc.generator,
  ...(doc.embeddedAssets !== undefined ? { embeddedAssets: doc.embeddedAssets } : {}),
});

function text(doc: DatasetDocument): string {
  const result = serializeDocument(doc);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.text;
}

/** Reverses schema object keys everywhere except free-form JSON (`unmapped`), whose order is user data. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([k, v]) => [k, k === 'unmapped' ? v : reverseKeys(v)]),
  );
}

describe.each(FIXTURES)('fixture %s', (name) => {
  it('serialises byte-identically to the committed file (LF, 2-space, trailing newline)', () => {
    expect(text(load(name))).toBe(read(name));
  });

  it('export → import → export is byte-identical through state (INV-19, P-02)', () => {
    const doc = load(name);
    const state = toState(doc);
    const first = text(stateToDocument(state, exportOptions(doc)));
    const second = text(stateToDocument(toState(load2(first)), exportOptions(doc)));
    expect(first).toBe(second);
    expect(first).toBe(read(name));
  });

  it('keeps every record: state counts equal document counts and each is the same object', () => {
    const doc = load(name);
    const state = toState(doc);
    for (const kind of RECORD_KINDS) {
      const table = state.records[kind] as Record<string, unknown>;
      expect(Object.keys(table)).toHaveLength(doc.records[kind].length);
      for (const record of doc.records[kind] as { id: string }[]) expect(table[record.id]).toBe(record);
    }
    expect(state.meta).toBe(doc.meta);
  });

  it('is independent of state insertion order and of document key order', () => {
    const doc = load(name);
    const state = toState(doc);
    const reversedTables = {} as Record<RecordKind, Record<string, unknown>>;
    for (const kind of RECORD_KINDS) {
      const table = state.records[kind] as Record<string, unknown>;
      reversedTables[kind] = Object.fromEntries(Object.entries(table).reverse());
    }
    const reversed = { meta: state.meta, records: reversedTables } as unknown as CanonicalState;
    expect(text(stateToDocument(reversed, exportOptions(doc)))).toBe(read(name));

    const shuffled = reverseKeys(JSON.parse(read(name))) as DatasetDocument;
    expect(text(shuffled)).toBe(read(name));
  });

  it('hands embedded assets back beside the state instead of dropping them (INV-23)', () => {
    const doc = load(name);
    const result = documentToState(doc);
    expect(result.ok && result.embeddedAssets).toEqual(doc.embeddedAssets ?? []);
  });

  it('returns deep-frozen state', () => {
    const state = toState(load(name));
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.records)).toBe(true);
    for (const kind of RECORD_KINDS) expect(Object.isFrozen(state.records[kind])).toBe(true);
  });
});

function first<T>(items: readonly T[]): T {
  const [head] = items;
  if (head === undefined) throw new Error('fixture is missing an expected record');
  return head;
}

function load2(content: string): DatasetDocument {
  const result = deserializeDocument(content);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.document;
}

describe('stateToDocument', () => {
  it('sorts records by ID (code-unit order) and includes every kind, empty or not', () => {
    const doc = load('minimal-valid');
    const state = toState(doc);
    const species = state.records.species as Record<string, unknown>;
    const reordered = { ...state, records: { ...state.records, species: Object.fromEntries(Object.entries(species).reverse()) } };
    const out = stateToDocument(reordered as CanonicalState, exportOptions(doc));
    expect(Object.keys(out.records)).toEqual([...RECORD_KINDS]);
    const ids = out.records.species.map((r) => r.id);
    expect(ids).toEqual([...ids].sort());
    expect(out.records.route).toEqual([]);
  });

  it('omits embeddedAssets when none are supplied, and when the list is empty', () => {
    const doc = load('minimal-valid');
    const base = { exportedAt: doc.exportedAt, exportScope: doc.exportScope, generator: doc.generator };
    expect('embeddedAssets' in stateToDocument(toState(doc), base)).toBe(false);
    expect('embeddedAssets' in stateToDocument(toState(doc), { ...base, embeddedAssets: [] })).toBe(false);
  });

  it('uses the supplied export options and the current schema version', () => {
    const doc = load('minimal-valid');
    const out = stateToDocument(toState(doc), { exportedAt: '2030-01-02T03:04:05.006Z', exportScope: 'chemistry', generator: { app: 'x', version: '9' } });
    expect(out).toMatchObject({ exportedAt: '2030-01-02T03:04:05.006Z', exportScope: 'chemistry', schemaVersion: CURRENT_SCHEMA_VERSION, format: 'orn.dataset' });
    expect(out.generator).toEqual({ app: 'x', version: '9' });
  });
});

describe('documentToState', () => {
  it('reports a duplicate ID within a kind, without dropping or merging silently', () => {
    const doc = load('minimal-valid');
    const dup = first(doc.records.species);
    const bad = { ...doc, records: { ...doc.records, species: [...doc.records.species, dup] } } as DatasetDocument;
    const result = documentToState(bad);
    expect(result).toEqual({ ok: false, duplicates: [{ kind: 'species', id: dup.id }] });
  });

  it('reports an ID repeated across kinds (INV-01 is global)', () => {
    const doc = load('minimal-valid');
    const species = first(doc.records.species);
    const clash = { ...first(doc.records.class), id: species.id } as unknown as DatasetDocument['records']['class'][number];
    const bad = { ...doc, records: { ...doc.records, class: [...doc.records.class, clash] } } as DatasetDocument;
    const result = documentToState(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.duplicates).toEqual([{ kind: 'class', id: species.id }]);
  });

  it('gives an empty document an empty, frozen state', () => {
    const doc = load('minimal-valid');
    const empty = { ...doc, records: Object.fromEntries(RECORD_KINDS.map((k) => [k, []])) } as unknown as DatasetDocument;
    const state = toState(empty);
    for (const kind of RECORD_KINDS) expect(Object.keys(state.records[kind])).toEqual([]);
  });
});

describe('serializeDocument / deserializeDocument', () => {
  it('refuses to serialise an invalid document and names the path (no silent repair)', () => {
    const doc = load('minimal-valid');
    const bad = { ...doc, meta: { ...doc.meta, datasetId: 'NOT VALID' } } as DatasetDocument;
    const result = serializeDocument(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.path === 'meta.datasetId')).toBe(true);
  });

  it('refuses unknown keys in a document (strict, INV-10)', () => {
    const raw = JSON.parse(read('minimal-valid')) as Record<string, unknown>;
    raw['uiState'] = { open: true };
    expect(deserializeDocument(JSON.stringify(raw)).ok).toBe(false);
  });

  it('reports invalid JSON and non-object roots as values, not exceptions', () => {
    for (const bad of ['', '{', 'null', '[]', '"x"', '{"format":"orn.dataset"}']) {
      const result = deserializeDocument(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it('keeps a hostile __proto__ key inert and rejects it as an unknown key', () => {
    const raw = read('minimal-valid').replace('"format"', '"__proto__": {"polluted": true}, "format"');
    expect(deserializeDocument(raw).ok).toBe(false);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('emits LF only, ends with a single newline and has no trailing spaces', () => {
    const out = text(load('maximal-valid'));
    expect(out).not.toMatch(/\r/);
    expect(out.endsWith('}\n')).toBe(true);
    expect(out).not.toMatch(/ +\n/);
  });
});
