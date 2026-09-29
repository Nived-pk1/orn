/**
 * Step 3.8: what the port does where the oracles cannot go (they are v6 output, and v6 throws or randomises there): refusals as
 * values, deterministic placeholder IDs, purity, hostile keys, plus a few v6 quirks pinned by name for readability (the oracle
 * tests prove them against v6 itself).
 */
import { describe, expect, it } from 'vitest';
import { legacyFixture } from '@/test-support/legacy-kit';
import { migrateLegacyReaction, normalizeLegacyData, splitLegacyReagent, type LegacyObject, type LegacyV5Data } from './index';

function ok(input: unknown): { data: LegacyV5Data; assignedIds: readonly { path: string; id: string }[] } {
  const result = normalizeLegacyData(input);
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result;
}

describe('refusals are values, never exceptions, and never a partial conversion', () => {
  it.each([null, 'text', 5, [], [{ compounds: [] }], undefined])('a document that is not an object (%j) is refused', (value) => {
    expect(normalizeLegacyData(value)).toMatchObject({ ok: false, code: 'NOT_AN_OBJECT', path: '' });
  });

  it.each([null, 'c1', 7, ['c1']])('a compound that is not an object (%j) is refused with its path (v6 would throw or build garbage)', (bad) => {
    expect(normalizeLegacyData({ compounds: [{ id: 'c1', name: 'A' }, bad], reactions: [] })).toMatchObject({ ok: false, code: 'INVALID_RECORD', path: 'compounds[1]' });
  });

  it('a reaction that is not an object, or a participant that is not, is refused with its path', () => {
    expect(normalizeLegacyData({ compounds: [], reactions: [null] })).toMatchObject({ ok: false, code: 'INVALID_RECORD', path: 'reactions[0]' });
    expect(normalizeLegacyData({ compounds: [], reactions: [{ id: 'r1', participants: [{ role: 'product' }, 'oops'] }] })).toMatchObject({
      ok: false,
      code: 'INVALID_RECORD',
      path: 'reactions[0].participants[1]',
    });
  });

  it('a compound with no text name is refused only where v6 would throw: when a reagent name is searched past it', () => {
    const compounds = [{ id: 'c1', name: 'Ethanol' }, { id: 'c2' }];
    const reaction = (reagent: string) => ({ id: 'r1', start: 'c1', end: 'c1', reagent });
    // "Ethanol" matches c1 before the nameless c2 is reached: v6 does not throw, so neither does the port.
    expect(ok({ compounds, reactions: [reaction('Ethanol')] }).data.reactions[0]?.participants).toEqual([
      { ref: 'c1', label: '', role: 'substrate', major: false, note: '' },
      { ref: 'c1', label: '', role: 'product', major: true, note: '' },
    ]);
    // "Water" matches nothing, so the search reaches c2 and v6 throws a TypeError.
    expect(normalizeLegacyData({ compounds, reactions: [reaction('Water')] })).toMatchObject({ ok: false, code: 'INVALID_COMPOUND_NAME', path: 'compounds[1].name' });
    // No reagent names to match at all: nothing to throw on.
    expect(normalizeLegacyData({ compounds, reactions: [{ id: 'r1', start: 'c1', end: 'c2' }] }).ok).toBe(true);
    // A nameless compound BEFORE the match is hit first.
    expect(normalizeLegacyData({ compounds: [{ id: 'c0' }, { id: 'c1', name: 'Ethanol' }], reactions: [reaction('Ethanol')] })).toMatchObject({ ok: false, code: 'INVALID_COMPOUND_NAME', path: 'compounds[0].name' });
  });

  it('never throws on hostile shapes', () => {
    for (const doc of [{}, { compounds: 1, reactions: 'x' }, { compounds: [{}], reactions: [{}] }, { compounds: [{ name: null }], reactions: [{ reagent: 'A' }] }]) {
      expect(() => normalizeLegacyData(doc)).not.toThrow();
    }
  });
});

describe('records without an id (v6 used Math.random)', () => {
  const input = { compounds: [{ name: 'A' }, { id: 'c-missing-2', name: 'B' }, { id: '', name: 'C' }], reactions: [{ name: 'R' }, { id: 'r1' }, { id: 0 }] };

  it('get deterministic placeholders that avoid ids already in use, listed in assignedIds', () => {
    const { data, assignedIds } = ok(input);
    expect(data.compounds.map((c) => c.id)).toEqual(['c-missing-1', 'c-missing-2', 'c-missing-3']);
    expect(data.reactions.map((r) => r.id)).toEqual(['r-missing-1', 'r1', 'r-missing-3']);
    expect(assignedIds).toEqual([
      { path: 'compounds[0].id', id: 'c-missing-1' },
      { path: 'compounds[2].id', id: 'c-missing-3' },
      { path: 'reactions[0].id', id: 'r-missing-1' },
      { path: 'reactions[2].id', id: 'r-missing-3' },
    ]);
  });

  it('are stable: the same input gives the same ids every time', () => {
    expect(JSON.stringify(ok(input).data)).toBe(JSON.stringify(ok(input).data));
  });

  it('a placeholder skips an id that is taken by a later record', () => {
    const { data } = ok({ compounds: [{ name: 'A' }, { id: 'c-missing-1', name: 'B' }], reactions: [] });
    expect(data.compounds.map((c) => c.id)).toEqual(['c-missing-2', 'c-missing-1']);
  });
});

describe('purity and hostile keys', () => {
  it('does not mutate its input, and the result is independent of a second call', () => {
    const input = legacyFixture('v4-sample.json');
    const before = JSON.stringify(input);
    const first = ok(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(ok(input).data).toEqual(first.data);
  });

  it('a `__proto__` key is an ordinary own property of the result, never a prototype', () => {
    const hostile = JSON.parse('{"compounds":[{"id":"c1","name":"A","__proto__":{"polluted":true}}],"reactions":[{"id":"r1","__proto__":{"polluted":true},"jee":{"__proto__":{"polluted":true}}}]}') as unknown;
    const { data } = ok(hostile);
    const compound = data.compounds[0] as LegacyObject;
    expect(Object.getPrototypeOf(compound)).toBe(Object.prototype);
    expect(Object.hasOwn(compound, '__proto__')).toBe(true);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect((compound as { polluted?: boolean }).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(data.reactions[0])).toBe(Object.prototype);
  });

  it('is bounded: 20,000 reactions against 5,000 compounds convert without a per-reaction scan of the compounds (name lookup is a map)', () => {
    const compounds = Array.from({ length: 5_000 }, (_, i) => ({ id: `c${i}`, name: `Compound ${i}` }));
    const reactions = Array.from({ length: 20_000 }, (_, i) => ({ id: `r${i}`, start: `c${i % 5_000}`, end: `c${(i + 1) % 5_000}`, reagent: `Compound ${(i * 7) % 5_000}, KOH, then H3O+`, condition: 'heat' }));
    const started = performance.now();
    const { data } = ok({ compounds, reactions });
    expect(data.reactions).toHaveLength(20_000);
    expect(performance.now() - started).toBeLessThan(20_000);
  });
});

describe('v6 quirks, pinned by name (the oracle tests prove them against v6 itself)', () => {
  it('v4 participants carry no `image`; the first product is made major when none is; a repeated name is added once', () => {
    const { data } = ok({ compounds: [{ id: 'c1', name: 'Ethanol' }], reactions: [{ id: 'r1', start: 'x', end: 'y', coProducts: ['z'], reagent: 'ethanol, ETHANOL', extra: 'Ethanol, foo, Foo' }] });
    const participants = data.reactions[0]?.participants as LegacyObject[];
    expect(participants.map((p) => [p.role, p.ref, p.label, p.major])).toEqual([
      ['substrate', 'x', '', false],
      ['product', 'y', '', true],
      ['product', 'z', '', false],
      ['reagent', 'c1', '', false],
      ['reactant', '', 'foo', false],
    ]);
    expect(participants.every((p) => !('image' in p))).toBe(true);
  });

  it('a v4 temperature in the reagent string becomes a condition when it reads as one, a reagent when it looks like a formula', () => {
    expect(splitLegacyReagent('conc. H2SO4, 443 K')).toEqual({ reagents: ['conc. H2SO4', '443 K'], workup: [], conditions: [] });
    expect(splitLegacyReagent('PCC, heat, reflux')).toEqual({ reagents: ['PCC'], workup: [], conditions: ['heat', 'reflux'] });
  });

  it('unknown fields survive on records and on `conditions`, `transformation`, `mechanism`, `jee`; participants are rebuilt', () => {
    const { data } = ok({
      compounds: [],
      reactions: [{ id: 'r1', participants: [{ role: 'reagent', x: 1 }], customField: { keep: 'me' }, conditions: { text: '', mine: 1 }, transformation: { note: 'n' }, mechanism: { foo: 2 }, jee: { extra: 3 } }],
    });
    const r = data.reactions[0] as LegacyObject;
    expect(r.customField).toEqual({ keep: 'me' });
    expect(r.conditions).toMatchObject({ mine: 1 });
    expect(r.transformation).toMatchObject({ note: 'n' });
    expect(r.mechanism).toMatchObject({ foo: 2 });
    expect(r.jee).toMatchObject({ extra: 3 });
    expect((r.participants as LegacyObject[])[0]).toEqual({ ref: '', label: '', role: 'reagent', major: false, note: '', image: '' });
  });

  it('a role that is an inherited object key (toString) is accepted as a role, as in v6', () => {
    const { data } = ok({ compounds: [], reactions: [{ id: 'r1', participants: [{ role: 'toString' }, { role: 'nonsense' }] }] });
    expect((data.reactions[0]?.participants as LegacyObject[]).map((p) => p.role)).toEqual(['toString', 'reagent']);
  });

  it('migrateLegacyReaction matches reagent names against compounds by trimmed, lower-cased name (first compound wins)', () => {
    const compounds = [{ id: 'a', name: ' Water ' }, { id: 'b', name: 'water' }];
    const { participants, conditionText } = migrateLegacyReaction({ reagent: 'WATER, THF, dry ether', condition: 'cold' }, compounds);
    expect(participants).toEqual([
      { ref: 'a', label: '', role: 'reagent', major: false, note: '' },
      { ref: '', label: 'THF', role: 'reagent', major: false, note: '' },
    ]);
    // "dry ether" reads as a condition (COND_RE `dry\b`), so it joins the condition text, after the reaction's own.
    expect(conditionText).toBe('cold, dry ether');
  });
});
