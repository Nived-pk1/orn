/**
 * The preview of a reaction DRAFT (step 6.3b D2): built by the same builders as the card's full equation, from a draft that is in no store
 * or index. A demo reaction opened unchanged gives the card's own equation; an edit shows; a participant with no substance is said in words
 * and nothing is drawn; a reaction with no outcome keeps its reactants and its arrow and has no products.
 */
import { describe, expect, it } from 'vitest';
import { familyStudy, type FamilyStudy } from '.';
import { previewOfDraft } from './draft-preview';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';
import type { Reaction } from '../schema';

const state = demoState();
const ctx = contextOf(state);
const E2 = 'rxn_r-2-bromobutane-alc-koh';
const reactionOf = (id: string): Reaction => structuredClone(state.records.reaction[id as never]) as Reaction;
const ready = (draft: unknown) => {
  const result = previewOfDraft(ctx.state, ctx.indexes, draft);
  if (!result.ok) throw new Error(result.missing.join('; '));
  return result;
};

describe('the preview of a draft', () => {
  it("a demo reaction opened UNCHANGED gives the card's own equation (the same groups, words, arrow and terms)", () => {
    const card = (familyStudy(ctx, 'cls_haloalkanes') as FamilyStudy).reactionsOf.groups.find((g) => g.name === 'Alkenes')?.cards.find((c) => c.name.includes('alc. KOH'));
    const preview = ready(reactionOf(E2));
    expect(preview.hasOutcomes).toBe(true);
    expect(preview.equations).toHaveLength(card?.groups.length ?? -1);
    expect(preview.equations.map((e) => e.equation)).toEqual(card?.groups.map((g) => g.equation));
    expect(preview.equations[0]?.equation.products.map((t) => [t.name, t.word, t.regiochemistry])).toEqual([
      ['But-2-ene', 'major', 'Saytzeff'],
      ['But-1-ene', 'minor', 'Hofmann'],
    ]);
  });

  it('an edit shows: the coefficient of the reactant is in the equation', () => {
    const draft = reactionOf(E2);
    const reactant = draft.participants.find((p) => p.role === 'reactant');
    if (reactant === undefined) throw new Error('no reactant');
    reactant.coefficient = 2;
    expect(ready(draft).equations[0]?.equation.reactants[0]?.coefficient).toBe('2');
  });

  it('a product whose role is not chosen yet (quick entry, a new product) is drawn as a plain product, never with the word "undefined"', () => {
    const draft = reactionOf(E2) as unknown as { outcomes: { products: Record<string, unknown>[] }[] };
    for (const outcome of draft.outcomes) for (const product of outcome.products) delete product.role;
    const preview = ready(draft);
    const terms = preview.equations.flatMap((e) => e.equation.products);
    expect(terms.length).toBeGreaterThan(0);
    for (const term of terms) {
      expect(term.role).toBeNull();
      expect(term.text).not.toContain('undefined');
    }
  });

  it('nothing is written: the draft is in no store table and the state is unchanged', () => {
    const before = JSON.stringify(state.records.reaction[E2 as never]);
    const draft = { ...reactionOf(E2), id: 'rxn_not-stored-draft' };
    ready(draft);
    expect(Object.hasOwn(state.records.reaction, 'rxn_not-stored-draft')).toBe(false);
    expect(JSON.stringify(state.records.reaction[E2 as never])).toBe(before);
  });

  it('a reaction with NO outcome has its reactants and its arrow and no products', () => {
    const draft = { ...reactionOf(E2), outcomes: [] };
    const preview = ready(draft);
    expect(preview.hasOutcomes).toBe(false);
    expect(preview.equations).toHaveLength(1);
    const equation = preview.equations[0]?.equation;
    expect(equation?.reactants.map((t) => t.name)).toEqual(['(R)-2-bromobutane']);
    expect(equation?.products).toEqual([]);
    expect([...(equation?.arrow.above ?? []), ...(equation?.arrow.below ?? [])].map((p) => p.text).join(' ')).toContain('KOH');
  });

  it('a participant with no substance is said in words (its number), and nothing is built', () => {
    const draft = reactionOf(E2);
    const broken = draft.participants.map((p, i) => (i === 1 ? ({ ...p, ref: {} } as unknown as typeof p) : p));
    const result = previewOfDraft(ctx.state, ctx.indexes, { ...draft, participants: broken });
    expect(result).toEqual({ ok: false, missing: ['Participant 2 has no substance.'] });
    const gone = previewOfDraft(ctx.state, ctx.indexes, { ...draft, participants: draft.participants.map(({ ref: _ref, ...rest }) => rest) });
    expect(gone.ok).toBe(false);
  });

  it('a record that is gone is drawn by its ID, as on a card (not a missing substance)', () => {
    const draft = reactionOf(E2);
    const result = previewOfDraft(ctx.state, ctx.indexes, { ...draft, participants: draft.participants.map((p) => (p.role === 'reactant' ? { ...p, originalText: undefined, ref: { kind: 'species', id: 'spc_not-there' } } : p)) });
    expect(result.ok && result.equations[0]?.equation.reactants.map((t) => t.name)).toContain('spc_not-there');
  });

  it('a product with no substance, or a draft that is not a reaction, is said in words', () => {
    const draft = reactionOf(E2);
    const outcomes = draft.outcomes.map((o, i) => (i === 0 ? { ...o, products: o.products.map((p) => ({ ...p, ref: undefined })) } : o));
    expect(previewOfDraft(ctx.state, ctx.indexes, { ...draft, outcomes })).toEqual({ ok: false, missing: ['Product 1 of outcome 1 has no substance.'] });
    expect(previewOfDraft(ctx.state, ctx.indexes, null).ok).toBe(false);
    expect(previewOfDraft(ctx.state, ctx.indexes, { participants: 'x' }).ok).toBe(false);
  });

  it('several groups carry a label each (the outcomes\' labels, else "Outcome n")', () => {
    const aldol = ready(reactionOf('rxn_ethanal-aldol'));
    expect(aldol.equations).toHaveLength(2);
    expect(aldol.equations.every((e) => typeof e.label === 'string' && e.label !== '')).toBe(true);
    expect(ready(reactionOf(E2)).equations[0]?.label).toBeUndefined();
  });
});
