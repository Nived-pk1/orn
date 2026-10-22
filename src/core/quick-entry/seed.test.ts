/**
 * The quick-entry draft seed and scope words (step 6.7b, Q3/Q4): roles come from what a term IS (a species or class on the left is a reactant,
 * a reagent record a reagent), nothing else is set - no primary-substrate flag, product roles absent ("Choose ..."), selectivity unspecified,
 * ONE outcome holding under all conditions. Scope: specific when every term is a species, generic when any is a class, else choose.
 */
import { describe, expect, it } from 'vitest';
import { ReactionSchema } from '../schema';
import { blankDraft } from '../editing/blank';
import { parseQuickEntry, type QuickEntry } from './grammar';
import { quickScope, quickSeed, type TermRef } from './seed';

const entry = (line: string): QuickEntry => {
  const parsed = parseQuickEntry(line);
  if (!parsed.ok) throw new Error('bad line');
  return parsed.entry;
};
const species = (id: string): TermRef => ({ kind: 'species', id });
const reagent = (id: string): TermRef => ({ kind: 'reagent', id });
const cls = (id: string): TermRef => ({ kind: 'class', id });
const ids = () => {
  const counts = new Map<string, number>();
  return (prefix: string): string => {
    const n = (counts.get(prefix) ?? 0) + 1;
    counts.set(prefix, n);
    return `${prefix}_q${n}`;
  };
};

describe('quickScope', () => {
  it('specific when every term is a species', () => {
    expect(quickScope([species('a'), species('b')])).toMatchObject({ scope: 'specific' });
    expect(quickScope([species('a'), species('b')]).words).toMatch(/specific/i);
  });
  it('generic when any term is a class', () => {
    expect(quickScope([species('a'), cls('c')])).toMatchObject({ scope: 'generic' });
    expect(quickScope([cls('c'), reagent('r')]).words).toMatch(/generic/i);
  });
  it('choose when a reagent is mixed with species, and when a term is unresolved or there are none', () => {
    expect(quickScope([species('a'), reagent('r')])).toMatchObject({ scope: 'choose' });
    expect(quickScope([species('a'), reagent('r')]).words).toMatch(/choose/i);
    expect(quickScope([species('a'), undefined])).toMatchObject({ scope: 'choose' });
    expect(quickScope([species('a'), undefined]).words).toMatch(/not resolved/i);
    expect(quickScope([])).toMatchObject({ scope: 'choose' });
  });
});

describe('quickSeed', () => {
  const line = 'ethanol + PCC (aqueous, 0 °C), then H3O+ -> ethanal';
  const refs = { stages: [[species('spc_ethanol'), reagent('rgt_pcc')], [reagent('rgt_hydronium')]], products: [species('spc_ethanal')] };
  const seed = quickSeed({ entry: entry(line), refs, scope: 'choose', newId: ids() }) as Record<string, unknown>;

  it('is undefined while any term is unresolved', () => {
    expect(quickSeed({ entry: entry(line), refs: { stages: [[species('a'), undefined], [reagent('b')]], products: [species('c')] }, scope: 'specific', newId: ids() })).toBeUndefined();
  });
  it('names the reaction as typed with the arrow shown as →', () => {
    expect(seed.name).toBe('ethanol + PCC (aqueous, 0 °C), then H3O+ → ethanal');
  });
  it('scope is as shown; "choose" leaves it absent', () => {
    expect(seed).not.toHaveProperty('scope');
    const specific = quickSeed({ entry: entry('a -> b'), refs: { stages: [[species('a')]], products: [species('b')] }, scope: 'specific', newId: ids() }) as Record<string, unknown>;
    expect(specific.scope).toBe('specific');
  });
  it('participants: roles from the kind, original wording kept, no primary-substrate flag', () => {
    const participants = seed.participants as { id: string; ref: TermRef; role: string; originalText?: string }[];
    expect(participants.map((p) => [p.ref.id, p.role, p.originalText])).toEqual([
      ['spc_ethanol', 'reactant', 'ethanol'],
      ['rgt_pcc', 'reagent', 'PCC'],
      ['rgt_hydronium', 'reagent', 'H3O+'],
    ]);
    for (const p of participants) expect(p).not.toHaveProperty('isPrimarySubstrate');
  });
  it('a class term is a reactant', () => {
    const generic = quickSeed({ entry: entry('a -> b'), refs: { stages: [[cls('cls_x')]], products: [cls('cls_y')] }, scope: 'generic', newId: ids() }) as { participants: { role: string }[] };
    expect(generic.participants[0]?.role).toBe('reactant');
  });
  it('stages: one per ", then", each participant in exactly one, condition text and parsed fields on the stage', () => {
    const stages = seed.stages as { id: string; kind: string; participantIds: string[]; parameters: { text?: string; parsedFields: string[]; solventCharacter: string[] }; originalText?: string }[];
    const participants = seed.participants as { id: string }[];
    expect(stages).toHaveLength(2);
    expect(stages[0]?.participantIds).toEqual([participants[0]?.id, participants[1]?.id]);
    expect(stages[1]?.participantIds).toEqual([participants[2]?.id]);
    expect(stages[0]?.kind).toBe('reaction');
    expect(stages[0]?.parameters.text).toBe('aqueous, 0 °C');
    expect([...(stages[0]?.parameters.parsedFields ?? [])].sort()).toEqual(['solventCharacter', 'temperature']);
    expect(stages[0]?.parameters.solventCharacter).toEqual(['aqueous']);
    expect(stages[1]?.parameters.text).toBeUndefined();
    expect(stages[1]?.parameters.parsedFields).toEqual([]);
  });
  it('ONE outcome that holds under all conditions, selectivity unspecified, products with roles ABSENT', () => {
    const outcomes = seed.outcomes as { conditionVariantIds: string[]; selectivity: string; products: Record<string, unknown>[] }[];
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.conditionVariantIds).toEqual([]);
    expect(outcomes[0]?.selectivity).toBe('unspecified');
    expect(outcomes[0]?.products.map((p) => p.ref)).toEqual([species('spc_ethanal')]);
    expect(outcomes[0]?.products[0]).not.toHaveProperty('role');
    expect(seed.conditionVariants).toEqual([]);
  });
  it('every nested id is new and distinct', () => {
    const all = [
      ...(seed.participants as { id: string }[]).map((p) => p.id),
      ...(seed.stages as { id: string }[]).map((s) => s.id),
      ...(seed.outcomes as { id: string; products: { id: string }[] }[]).flatMap((o) => [o.id, ...o.products.map((p) => p.id)]),
    ];
    expect(new Set(all).size).toBe(all.length);
  });
  it('over the blank draft it fails L1 ONLY for the missing scope and the product role (nothing else is invented)', () => {
    const blank = blankDraft('reaction', { newId: ids(), now: () => '2026-10-22T00:00:00.000Z' } as never) as Record<string, unknown>;
    const parsed = ReactionSchema.safeParse({ ...blank, ...seed });
    expect(parsed.success).toBe(false);
    const paths = (parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'))).sort();
    expect(paths).toEqual(['outcomes.0.products.0.role', 'scope']);
    const done = ReactionSchema.safeParse({ ...blank, ...seed, scope: 'specific', outcomes: (seed.outcomes as { products: object[] }[]).map((o) => ({ ...o, products: o.products.map((p) => ({ ...p, role: 'main' })) })) });
    expect(done.success).toBe(true);
  });
  it('the typed wording that is too long for the schema is left out, never cut', () => {
    const long = 'x'.repeat(20000);
    const made = quickSeed({ entry: { stages: [{ terms: [{ text: long, start: 0, end: 1 }] }], products: [{ text: 'b', start: 0, end: 1 }], arrow: '->' }, refs: { stages: [[species('a')]], products: [species('b')] }, scope: 'specific', newId: ids() }) as { participants: Record<string, unknown>[] };
    expect(made.participants[0]).not.toHaveProperty('originalText');
  });
});
