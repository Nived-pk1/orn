/**
 * Derived formulas in search (step 5.1b, Phase 5 contract decisions Q9, SEARCH §3 "entered or derived"): the builder takes the
 * formula the chem worker derived from the port, for species only; the engine indexes it like the entered formula (boost 3, exact,
 * folded: "C2H6O" and "C₂H₆O" are one term) and reports a `formula` hit with the text that matched; an index serialised under the
 * previous configuration is refused (`BAD_INDEX`) so the app loads once instead.
 */
import { describe, expect, it } from 'vitest';
import { indexEngine } from '@/core/indexes/full';
import type { AnyRecord, CanonicalState, RecordRef } from '@/core/schema';
import { doc } from '@/test-support/search-docs';
import { searchStateOf } from '@/test-support/search-state';
import { createSearchEngine } from '../engine';
import { buildDocument, documentPortsOf } from './index';

const STATE: CanonicalState = searchStateOf({ species: 12, classes: 3, reagents: 3, reactions: 8, relationshipsPerReaction: 0.5, topics: 3, shape: 'dense', seed: 5 });
const ids = (kind: 'species' | 'class' | 'reagent'): string[] => Object.keys(STATE.records[kind]).sort();
const portsWith = (derived: (ref: RecordRef) => string | undefined) => documentPortsOf(STATE, indexEngine.build(STATE, 0), derived);
const build = (kind: 'species' | 'class' | 'reagent', id: string, derived: (ref: RecordRef) => string | undefined) =>
  buildDocument((STATE.records[kind] as Record<string, AnyRecord>)[id] as AnyRecord, portsWith(derived));

describe('the document builder', () => {
  it('a species document carries the derived formula, trimmed; a blank one or none is absent', () => {
    const id = ids('species')[0] as string;
    expect(build('species', id, () => '  C2H6O ')?.derivedFormula).toBe('C2H6O');
    expect(build('species', id, () => '   ')).not.toHaveProperty('derivedFormula');
    expect(build('species', id, () => undefined)).not.toHaveProperty('derivedFormula');
    expect(buildDocument((STATE.records.species as Record<string, AnyRecord>)[id] as AnyRecord, documentPortsOf(STATE, indexEngine.build(STATE, 0)))).not.toHaveProperty('derivedFormula');
  });

  it('only species ask the port; the entered formula is untouched beside the derived one', () => {
    const asked: string[] = [];
    for (const kind of ['class', 'reagent'] as const) build(kind, ids(kind)[0] as string, (ref) => (asked.push(ref.kind), 'X1'));
    expect(asked).toEqual([]);
    const id = ids('species')[0] as string;
    const withEntered = { ...(STATE.records.species as Record<string, AnyRecord>)[id], formula: 'CH3CH2OH' } as AnyRecord;
    const built = buildDocument(withEntered, portsWith(() => 'C2H6O'));
    expect(built).toMatchObject({ formula: 'CH3CH2OH', derivedFormula: 'C2H6O' });
  });
});

describe('the engine', () => {
  const engine = createSearchEngine();
  engine.load(
    [
      doc('spc_derived', { name: 'Unnamed one', derivedFormula: 'C2H6O' }),
      doc('spc_entered', { name: 'Entered one', formula: 'C₂H₆O' }),
      doc('spc_both', { name: 'Both', formula: 'CH3CH2OH', derivedFormula: 'C2H6O' }),
      doc('spc_other', { name: 'Other', derivedFormula: 'CH4' }),
    ],
    3,
  );

  it('finds a species by its derived formula, folded like an entered one, and says which text matched', () => {
    const hits = engine.search({ text: 'C₂H₆O', limit: 10 });
    expect(hits.map((h) => h.ref.id).sort()).toEqual(['spc_both', 'spc_derived', 'spc_entered']);
    expect(hits.every((h) => h.matchedField === 'formula')).toBe(true);
    expect(hits.find((h) => h.ref.id === 'spc_derived')?.matchedText).toBe('C2H6O');
    expect(hits.find((h) => h.ref.id === 'spc_entered')?.matchedText).toBe('C₂H₆O');
    expect(hits.find((h) => h.ref.id === 'spc_both')?.matchedText).toBe('C2H6O');
    expect(engine.search({ text: 'CH3CH2OH', limit: 10 }).map((h) => h.ref.id)).toEqual(['spc_both']);
  });

  it('is exact: no prefix and no fuzzy on a derived formula', () => {
    expect(engine.search({ text: 'C2H6', limit: 10 })).toEqual([]);
    expect(engine.search({ text: 'C2H6OO', limit: 10 })).toEqual([]);
  });

  it('survives the serialised form, and an index of the previous configuration is BAD_INDEX', () => {
    const copy = createSearchEngine();
    expect(copy.loadSerialized(engine.serialize())).toMatchObject({ ok: true, documents: 4 });
    expect(copy.search({ text: 'CH4', limit: 5 }).map((h) => h.ref.id)).toEqual(['spc_other']);
    const old = JSON.parse(engine.serialize().json) as { config: string };
    old.config = 'orn-search-config-1';
    expect(createSearchEngine().loadSerialized({ revision: 3, json: JSON.stringify(old) })).toMatchObject({ ok: false, code: 'BAD_INDEX' });
  });

  it('a document with a derivedFormula that is not a string is refused as a value', () => {
    const bad = createSearchEngine();
    expect(() => bad.load([{ ...doc('spc_bad'), derivedFormula: 5 as never }], 1)).toThrow(/derivedFormula must be a string/);
  });
});
