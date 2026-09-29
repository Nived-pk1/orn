/**
 * Step 3.8: the TypeScript port of the legacy v6 data layer against ORACLES, i.e. what v6's own code produced when it was
 * run in a Node `vm` (docs/PROGRESS.md "Phase 0" and "Step 3.8"; `scripts/legacy-oracle.mjs`). Deep equality AND identical key
 * order (`JSON.stringify`), since the oracles are files.
 *   - `v4-sample.normalized-by-v6.json`   (Phase 0, frozen)  v4 input → v5
 *   - `v6-demo-export.normalized-by-v6.json` (step 3.8)      v5 input → v5 (normalizeData of a v6 export)
 *   - `quirks.normalized-by-v6.json` (step 3.8)               a hand-made workbook of v6 quirks, both formats mixed
 *   - the three `--each` tables for `splitLegacyReagent`, `autofillConditionFlags` and `fgId`.
 */
import { describe, expect, it } from 'vitest';
import { legacyFixture, legacyTestFixture, viaJson } from '@/test-support/legacy-kit';
import { autofillConditionFlags, fgId, normalizeLegacyData, splitLegacyReagent, type LegacyObject } from './index';

interface EachRow {
  readonly input: unknown;
  readonly result: unknown;
}

function converted(input: unknown): unknown {
  const result = normalizeLegacyData(input);
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return viaJson(result.data);
}

describe('normalizeLegacyData equals the oracles v6 itself produced', () => {
  it('v4 sample → v5: deep-equals v4-sample.normalized-by-v6.json, key order included', () => {
    const oracle = legacyFixture('v4-sample.normalized-by-v6.json');
    const out = converted(legacyFixture('v4-sample.json'));
    expect(out).toStrictEqual(oracle);
    expect(JSON.stringify(out)).toBe(JSON.stringify(oracle));
  });

  it('v5 input (v6 demo export) passes through as v6 would: deep-equals v6-demo-export.normalized-by-v6.json', () => {
    const oracle = legacyFixture('v6-demo-export.normalized-by-v6.json');
    const out = converted(legacyFixture('v6-demo-export.json'));
    expect(out).toStrictEqual(oracle);
    expect(JSON.stringify(out)).toBe(JSON.stringify(oracle));
  });

  it('the quirk workbook (unknown fields, coercions, odd containers, both formats) equals the oracle', () => {
    const oracle = legacyTestFixture('quirks.normalized-by-v6.json');
    const out = converted(legacyTestFixture('quirks.json'));
    expect(out).toStrictEqual(oracle);
    expect(JSON.stringify(out)).toBe(JSON.stringify(oracle));
  });

  it('splitLegacyReagent equals v6 for every string of the table (staged, "then", conditions, empties, non-strings)', () => {
    const rows = legacyTestFixture('reagent-strings.split-by-v6.json') as EachRow[];
    expect(rows.length).toBeGreaterThanOrEqual(30);
    for (const row of rows) expect(viaJson(splitLegacyReagent(row.input)), JSON.stringify(row.input)).toStrictEqual(row.result);
  });

  it('autofillConditionFlags equals v6 for every condition text of the table (only empty flags are filled)', () => {
    const rows = legacyTestFixture('condition-texts.autofilled-by-v6.json') as EachRow[];
    expect(rows.length).toBeGreaterThanOrEqual(20);
    for (const row of rows) expect(viaJson(autofillConditionFlags(row.input as LegacyObject)), JSON.stringify(row.input)).toStrictEqual(row.result);
  });

  it('fgId equals v6 for ids, labels, aliases (case-insensitive), unknown text, blanks and non-strings', () => {
    const rows = legacyTestFixture('fg-inputs.mapped-by-v6.json') as EachRow[];
    expect(rows.length).toBeGreaterThanOrEqual(20);
    for (const row of rows) expect(fgId(row.input), JSON.stringify(row.input)).toBe(row.result);
  });
});

describe('v6 idempotence, checked through the vm and reproduced by the port', () => {
  it('normalizing v6 demo output again changes nothing (v6 is idempotent on v5 data, and so is the port)', () => {
    const once = converted(legacyFixture('v6-demo-export.json'));
    expect(converted(once)).toStrictEqual(once);
    expect(converted(legacyFixture('v6-demo-export.normalized-by-v6.json'))).toStrictEqual(legacyFixture('v6-demo-export.normalized-by-v6.json'));
  });

  it('v6 is NOT idempotent on its own v4 output, and the port has the same quirk: the second pass only adds `image: ""` to every migrated participant', () => {
    // Checked through the vm (scripts/legacy-oracle.mjs on the oracle): the only differences are participants[].image (undefined → "").
    // v4 migration builds participants without `image`; only `normPart` adds it, and it runs on the second pass.
    const once = legacyFixture('v4-sample.normalized-by-v6.json') as { reactions: { participants: LegacyObject[] }[] };
    const twice = converted(once) as typeof once;
    expect(twice).not.toStrictEqual(once);
    const withImages = viaJson({ ...once, reactions: once.reactions.map((r) => ({ ...r, participants: r.participants.map((p) => ({ ...p, image: '' })) })) });
    expect(twice).toStrictEqual(withImages);
  });
});
