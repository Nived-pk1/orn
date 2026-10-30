/**
 * Step 7.2a, A2: every number on the overview that says "reactions" counts DISTINCT reactions. The map counted one per (outcome, main
 * product), so an arrow of two reactions with two outcomes each said 4. For EVERY overview arrow of the demo the bundle's total is the
 * inspector's "Reactions on this arrow (n)" (distinct reactions of the roll-up's candidates) and the Reactions view's count for that
 * arrow (From and To together). Bundles and the edges drawn are unchanged: only the number.
 */
import { describe, expect, it } from 'vitest';
import { documentToState } from '@/core/dataset';
import { contextOf, requestOf } from '@/test-support/graph-state';
import { buildDemoDocument } from '@/test-support/demo';
import { exampleLookupOf, familyStudy, foldExamples } from '../family';
import { buildReactionFilterInput, filterReactions } from '../reaction-filter';
import { navigatorProjection } from '.';

const parsed = documentToState(buildDemoDocument());
if (!parsed.ok) throw new Error('demo dataset has duplicate IDs');
const ctx = contextOf(parsed.state);
const projection = navigatorProjection.build(ctx, requestOf('navigator'));
const rollup = ctx.indexes.navigatorRollup();
// 7.3a C3: every number that says "reactions" counts CARDS: an example folded under its general reaction in the same list is not counted
const lookup = exampleLookupOf(parsed.state);
const cardsOf = (ids: Iterable<string>): number => foldExamples([...ids], lookup).shown.length;

describe('the demo overview: one number per arrow', () => {
  it('has arrows where several outcomes of one reaction share a pair (the case that was counted twice)', () => {
    const multi = rollup.pairs().filter((pair) => pair.candidates.length > new Set(pair.candidates.map((c) => c.reactionId)).size);
    expect(multi.length).toBeGreaterThan(0);
  });

  it('every pair of the demo: chip = inspector count = Reactions view count = distinct reactions', () => {
    const input = buildReactionFilterInput(ctx);
    for (const pair of rollup.pairs()) {
      const distinct = cardsOf(new Set(pair.candidates.map((c) => c.reactionId as string)));
      const inspector = cardsOf(new Set(rollup.candidatesFrom(pair.from).filter((c) => c.toHub === pair.to).map((c) => c.reactionId as string)));
      const view = cardsOf(filterReactions(input, { fromFamilyIds: [pair.from], toFamilyIds: [pair.to] }, undefined).rows.map((row) => row.id));
      expect(inspector, `${pair.from} → ${pair.to}`).toBe(distinct);
      expect(view, `${pair.from} → ${pair.to}`).toBe(distinct);
      const bundle = projection.bundles.find((b) => b.from === pair.from && b.to === pair.to);
      if (bundle !== undefined) {
        expect(bundle.reactions, `${pair.from} → ${pair.to}`).toBe(distinct);
        expect(bundle.total, `${pair.from} → ${pair.to} arrows`).toBe(pair.candidates.length); // INV-22 still adds up arrows
      }
    }
  });

  it('a bundle keeps every drawn edge: only its reaction count is the distinct one', () => {
    const doubled = projection.bundles.filter((b) => (b.reactions ?? b.total) < b.edgeIds.length);
    expect(doubled.length).toBeGreaterThan(0);
  });
});

describe("a family's \"reactions out / in\" counts each reaction once, however many arrows it leaves by", () => {
  it('every hub of the demo: the node counts are the distinct reactions of its candidates', () => {
    const hubs = projection.nodes.filter((node) => node.reactionCounts !== undefined);
    expect(hubs.length).toBeGreaterThan(0);
    for (const node of hubs) {
      const out = new Set(rollup.candidatesFrom(node.id).map((c) => c.reactionId as string));
      const into = new Set(rollup.candidatesTo(node.id).map((c) => c.reactionId as string));
      expect(node.reactionCounts?.outAll, `${node.id} out`).toBe(cardsOf(out));
      expect(node.reactionCounts?.inAll, `${node.id} in`).toBe(cardsOf(into));
    }
  });

  it('the old sum over arrows double counted at least one family of the demo (the reason for the node counts)', () => {
    const doubled = projection.nodes.filter((node) => {
      const sum = rollup.pairs().filter((p) => p.from === node.id).reduce((n, p) => n + new Set(p.candidates.map((c) => c.reactionId)).size, 0);
      return sum > (node.reactionCounts?.outAll ?? sum);
    });
    expect(doubled.length).toBeGreaterThan(0);
  });
});

describe('the family pages count distinct reactions too', () => {
  it('every hub of the demo: section counts, partner strips and the total are the candidates\' distinct reactions', () => {
    for (const hub of rollup.hubs) {
      const study = familyStudy(ctx, hub.id);
      expect(study, hub.id).not.toBeNull();
      if (study === null) continue;
      const from = new Set(rollup.candidatesFrom(hub.id).map((c) => c.reactionId));
      const to = new Set(rollup.candidatesTo(hub.id).map((c) => c.reactionId));
      // 7.3a C3: the counts are CARDS; a folded example is counted apart ("+ n examples"), so nothing is lost
      expect(study.reactionsOf.reactionCount + study.reactionsOf.exampleCount, `${hub.id} of`).toBe(from.size);
      expect(study.preparationOf.reactionCount + study.preparationOf.exampleCount, `${hub.id} prep`).toBe(to.size);
      expect(study.counts.total + study.counts.examples, `${hub.id} total`).toBe(new Set([...from, ...to]).size);
      expect(study.counts.reactionsOf, `${hub.id} of cards`).toBe(study.reactionsOf.reactionCount);
      for (const section of [study.reactionsOf, study.preparationOf]) {
        for (const group of section.groups) expect(new Set(group.cards.map((card) => card.reactionId)).size, `${hub.id} ${group.hubId}`).toBe(group.cards.length);
      }
      for (const partner of [...study.turnsInto, ...study.madeFrom]) expect(partner.reactionCount).toBeGreaterThan(0);
    }
  });
});
