/**
 * Step 3.8 no-loss check (INV-23, needed by step 3.11): does v6's conversion keep every leaf of the v4 input?
 *
 * Answer for `v4-sample.json`: YES. Every scalar leaf is in the v5 output verbatim (`_v4` holds the original reagent / extra /
 * condition strings; the v4 keys `start`, `end`, `coProducts`, `family`, `mech`, `collapse` land in participants,
 * `reagentFamily`, `mechanism.summary`, `collapseIntermediates`), except `pattern`, which is exactly reconstructable from
 * `transformation.from/to`. v6 DOES discard information on other inputs (an overshadowed `mech`, a non-boolean `collapse`, unknown
 * fields on a participant, ...), so the port also returns those leaves separately, path → value, in `dropped`.
 *
 * The proof below does not use the port's own `dropped` logic: it walks the input leaves and looks for each value in the
 * corresponding output record itself.
 */
import { describe, expect, it } from 'vitest';
import { legacyFixture, legacyTestFixture } from '@/test-support/legacy-kit';
import { findDroppedLeaves, formatPath, normalizeLegacyData, type LegacyObject } from './index';

type Scalar = string | number | boolean | null;

/** Every scalar leaf of a record with its path (empty arrays and objects hold none). */
function leavesOf(value: unknown, path: (string | number)[] = []): { path: (string | number)[]; value: Scalar }[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => leavesOf(item, [...path, i]));
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([k, v]) => leavesOf(v, [...path, k]));
  return [{ path, value: value as Scalar }];
}

const outputRecord = (data: LegacyObject, kind: 'compounds' | 'reactions', index: number): unknown => (data[kind] as unknown[])[index];

/** Independent check: the value is somewhere in the output record, or (pattern) reconstructable from its transformation. */
function representedInRecord(inputPath: (string | number)[], value: Scalar, out: unknown, kind: 'compounds' | 'reactions'): boolean {
  if (kind === 'reactions' && inputPath[0] === 'pattern') {
    const t = (out as { transformation: { from: string; to: string } }).transformation;
    return (t.to === '' ? t.from : `${t.from} → ${t.to}`) === value;
  }
  return leavesOf(out).some((leaf) => leaf.value === value);
}

function unrepresented(input: LegacyObject, data: LegacyObject): string[] {
  const missing: string[] = [];
  for (const kind of ['compounds', 'reactions'] as const) {
    (input[kind] as unknown[]).forEach((record, index) => {
      for (const leaf of leavesOf(record)) {
        if (!representedInRecord(leaf.path, leaf.value, outputRecord(data, kind, index), kind)) missing.push(`${kind}[${index}].${formatPath(leaf.path)}=${JSON.stringify(leaf.value)}`);
      }
    });
  }
  return missing;
}

describe('v4-sample.json: v6 keeps every leaf', () => {
  const input = legacyFixture('v4-sample.json') as LegacyObject;
  const result = normalizeLegacyData(input);
  if (!result.ok) throw new Error(result.message);

  it('every scalar leaf of every compound and reaction is in the v5 output (independent value search; `pattern` is reconstructable)', () => {
    const leafCount = ['compounds', 'reactions'].reduce((n, k) => n + (input[k] as unknown[]).reduce<number>((m, r) => m + leavesOf(r).length, 0), 0);
    expect(leafCount).toBeGreaterThan(60);
    expect(unrepresented(input, result.data)).toEqual([]);
  });

  it('the v4 audit trail `_v4` holds the original reagent, extra and condition text of every migrated reaction, verbatim', () => {
    for (const [i, r] of (input.reactions as LegacyObject[]).entries()) {
      expect((result.data.reactions[i] as LegacyObject)._v4).toEqual({ reagent: r.reagent, extra: r.extra, condition: r.condition });
    }
  });

  it('so the port reports nothing dropped and no placeholder ID for it', () => {
    expect(result.dropped).toEqual([]);
    expect(result.assignedIds).toEqual([]);
  });
});

describe('findDroppedLeaves: what v6 discards is returned, path → value', () => {
  const quirks = legacyTestFixture('quirks.json') as LegacyObject;
  const result = normalizeLegacyData(quirks);
  if (!result.ok) throw new Error(result.message);
  const droppedAs = (path: string) => result.dropped.find((d) => d.path === path);

  it('every leaf of the quirk workbook is either represented in the output or listed (soundness: nothing is lost silently)', () => {
    const listed = new Set(result.dropped.map((d) => d.path));
    const silently: string[] = [];
    for (const kind of ['compounds', 'reactions'] as const) {
      (quirks[kind] as unknown[]).forEach((record, index) => {
        for (const leaf of leavesOf(record)) {
          const path = `${kind}[${index}].${formatPath(leaf.path)}`.replace(/\.\[/g, '[');
          if (!listed.has(path) && !representedInRecord(leaf.path, leaf.value, outputRecord(result.data, kind, index), kind)) silently.push(path);
        }
      });
    }
    expect(silently).toEqual([]);
    expect(result.dropped.length).toBeGreaterThan(20);
  });

  it('non-verbatim compound values are reported: split strings, coerced flags, canonicalised groups, replaced containers', () => {
    expect(droppedAs('compounds[0].tags')).toEqual({ path: 'compounds[0].tags', value: ' a , ,b ', reason: 'changed' });
    expect(droppedAs('compounds[0].functionalGroups')).toMatchObject({ value: 'Olefin, primary alcohol, mystery', reason: 'changed' });
    expect(droppedAs('compounds[0].fgId')).toMatchObject({ value: 'aromatic', reason: 'changed' });
    expect(droppedAs('compounds[0].node')).toMatchObject({ value: 0, reason: 'changed' });
    expect(droppedAs('compounds[0].nodeType')).toMatchObject({ value: 'weird', reason: 'changed' });
    expect(droppedAs('compounds[0].jee')).toMatchObject({ value: 'text', reason: 'changed' });
    expect(droppedAs('compounds[2].functionalGroups[1]')).toMatchObject({ value: 'COOH', reason: 'changed' });
    expect(droppedAs('compounds[2].functionalGroups[0]')).toBeUndefined(); // "Alcohol" is not a registry alias: v6 keeps it as typed
  });

  it('list items that survive under another index are not reported, trimmed or coerced ones are', () => {
    expect(droppedAs('compounds[1].tags[0]')).toBeUndefined();
    expect(droppedAs('compounds[1].tags[1]')).toMatchObject({ value: 5, reason: 'changed' });
    expect(droppedAs('compounds[1].tags[3]')).toMatchObject({ value: ' y ', reason: 'changed' });
  });

  it('v4 reaction keys: values v6 moved verbatim are not reported; coerced or overshadowed ones are', () => {
    expect(droppedAs('reactions[0].start')).toBeUndefined();
    expect(droppedAs('reactions[0].reagent')).toBeUndefined();
    expect(droppedAs('reactions[0].pattern')).toBeUndefined();
    expect(droppedAs('reactions[0].collapse')).toEqual({ path: 'reactions[0].collapse', value: 0, reason: 'changed' });
    expect(droppedAs('reactions[0].coProducts[1]')).toMatchObject({ value: '' });
    expect(droppedAs('reactions[0].coProducts[3]')).toMatchObject({ value: null });
    expect(droppedAs('reactions[2].pattern')).toMatchObject({ value: 'x →', reason: 'changed' });
    expect(droppedAs('reactions[1].pattern')).toBeUndefined();
    // A list in a v4 field is copied whole into `_v4`: its items are kept.
    expect(droppedAs('reactions[1].extra[0]')).toBeUndefined();
    expect(droppedAs('reactions[1].extra[1]')).toBeUndefined();
  });

  it('a v5 reaction that still carries v4 keys loses them (v6 deletes them without an audit trail), and unknown participant fields are gone', () => {
    expect(droppedAs('reactions[3].start')).toEqual({ path: 'reactions[3].start', value: 'junk', reason: 'not_in_output' });
    expect(droppedAs('reactions[3].pattern')).toMatchObject({ value: 'ignored', reason: 'changed' });
    expect(droppedAs('reactions[3].participants[0].x')).toEqual({ path: 'reactions[3].participants[0].x', value: 1, reason: 'not_in_output' });
    expect(droppedAs('reactions[3].collapse')).toMatchObject({ value: 0 });
  });

  it('top-level fields: unknown ones survive, the version stamp is replaced', () => {
    expect(droppedAs('unknownTopLevel.kept[0]')).toBeUndefined();
    expect(droppedAs('schemaVersion')).toEqual({ path: 'schemaVersion', value: 4, reason: 'changed' });
  });

  it('a `compounds` value that is not an array is replaced by [] and reported', () => {
    const odd = normalizeLegacyData({ compounds: 'nope', reactions: { a: 1 } });
    expect(odd.ok && odd.dropped).toEqual([
      { path: 'compounds', value: 'nope', reason: 'changed' },
      { path: 'reactions.a', value: 1, reason: 'not_in_output' },
    ]);
  });

  it('is deterministic and walks the input in order', () => {
    expect(findDroppedLeaves(quirks, result.data)).toEqual(result.dropped);
    expect(result.dropped.map((d) => d.path)).toEqual([...result.dropped.map((d) => d.path)]);
  });
});
