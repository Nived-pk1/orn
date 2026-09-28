/**
 * Wall-clock bounded-work checks of src/core (npm run test:timing, NOT npm run check: TEST_STRATEGY §1, determinism).
 * Each test is the original of a test whose functional part stays in its colocated file under a title without the
 * time claim; titles and assertions here are unchanged from the originals.
 */
import { describe, expect, it } from 'vitest';
import { coreIndexEngine } from '@/core/indexes/engine';
import { Base64Schema, LIMITS, type Names } from '@/core/schema';
import { parseRichText } from '@/core/text/richtext';
import { commit, loadFixtureState, must, type Tables } from '@/test-support/state-fixture';

const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => s.safeParse(v).success;

describe('INV-22 (Phase 1 part) parseRichText: bounded work', () => {
  it.each([
    ['unclosed openers with trailing text', '*a '.repeat(16_000)],
    ['unclosed strong openers', '**a '.repeat(12_000)],
    ['unclosed scripts', '_{a'.repeat(16_000)],
    ['unclosed links', '[[rxn_a'.repeat(7_000)],
    ['deep nesting', '*a '.repeat(2_000) + 'b' + '* '.repeat(2_000)],
  ])('%s parses quickly and losslessly', (_name, source) => {
    const started = performance.now();
    const nodes = parseRichText(source);
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(nodes.length).toBeGreaterThan(0);
  });
});

describe('Base64Schema (timing)', () => {
  it('enforces the cap and stays linear on a maximum-size payload', () => {
    const cap = LIMITS.embeddedAssetBase64;
    const started = Date.now();
    expect(ok(Base64Schema, 'A'.repeat(cap))).toBe(true);
    expect(ok(Base64Schema, 'A'.repeat(cap + 4))).toBe(false);
    expect(ok(Base64Schema, `${'A'.repeat(cap - 4)}!AAA`)).toBe(false);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe('ancestorsOf / descendantsOf (timing)', () => {
  const base = loadFixtureState('maximal-valid');
  const names = (canonical: string): Names => ({ canonical, common: [], aliases: [] });
  function indexesOf(spec: Record<string, string[]>) {
    const template = must(Object.values(base.records.class)[0]);
    const { after } = commit(base, 1, (tables) => {
      for (const [id, parentIds] of Object.entries(spec)) {
        (tables as Tables).class[id] = { ...template, id, names: names(id), parentIds, exampleSpeciesIds: [] };
      }
    });
    return coreIndexEngine.build(after);
  }

  it('INV-22 (Phase 1 part): walks a 5,000-deep chain without recursion and in bounded time', () => {
    const spec: Record<string, string[]> = { cls_n0: [] };
    for (let i = 1; i < 5000; i++) spec[`cls_n${i}`] = [`cls_n${i - 1}`];
    const started = Date.now();
    const ix = indexesOf(spec);
    expect(ix.ancestorsOf('class', 'cls_n4999')).toHaveLength(4999);
    expect(ix.descendantsOf('class', 'cls_n0')).toHaveLength(4999);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
