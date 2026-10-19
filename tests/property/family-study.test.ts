/**
 * familyStudy (step 5.5b; ADR-037): over generated states, every roll-up candidate of a hub appears in EXACTLY ONE card outcome of the
 * right group of the right section (nothing dropped, nothing twice), the value is deterministic, and its size is bounded by the hub's
 * candidates. Checked against the roll-up index read independently here (the candidates are the oracle).
 */
import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { familyStudy, UNCLASSIFIED_HUB_ID, type FamilySection, type FamilyStudy } from '@/core/graph';
import type { NavigatorCandidate } from '@/core/indexes/contracts';
import { frozenStateOf, smallParamsArb } from '@/test-support/arbitraries';
import { contextOf } from '@/test-support/graph-state';
import { withNavigatorAnchors } from '@/test-support/perf-kit';
import { PARAMS, TIMEOUT_MS } from './harness';

vi.setConfig({ testTimeout: TIMEOUT_MS });

/** Every (group, reaction, outcome, product) a section shows, one entry per product line of a card outcome. */
function shown(section: FamilySection): string[] {
  return section.groups.flatMap((g) => g.cards.flatMap((c) => c.groups.flatMap((group) => group.outcomes).flatMap((o) => o.products.map((p) => `${g.hubId}|${c.reactionId}|${o.outcomeId}|${p.productId}`))));
}

const expectedOf = (candidates: readonly NavigatorCandidate[], groupOf: (c: NavigatorCandidate) => string): string[] =>
  candidates.map((c) => `${groupOf(c)}|${c.reactionId}|${c.outcomeId}|${c.productId}`);

describe('familyStudy: every candidate of the hub is in exactly one card outcome of the right group', () => {
  it('for random states and anchor counts, in both sections', () => {
    let cards = 0;
    let withElsewhere = 0;
    fc.assert(
      fc.property(smallParamsArb, fc.integer({ min: 2, max: 6 }), (params, anchors) => {
        const state = withNavigatorAnchors(frozenStateOf(params), anchors);
        const ctx = contextOf(state);
        const rollup = ctx.indexes.navigatorRollup();
        for (const hubId of [...rollup.hubs.map((h) => h.id), UNCLASSIFIED_HUB_ID]) {
          const study = familyStudy(ctx, hubId) as FamilyStudy;
          const from = rollup.candidatesFrom(hubId);
          const to = rollup.candidatesTo(hubId);
          expect(shown(study.reactionsOf).sort()).toEqual(expectedOf(from, (c) => c.toHub).sort());
          expect(shown(study.preparationOf).sort()).toEqual(expectedOf(to, (c) => c.fromHub).sort());
          // Bounded by the hub's candidates, and a card key is unique.
          const keys = [...study.reactionsOf.groups, ...study.preparationOf.groups].flatMap((g) => g.cards.map((c) => c.key));
          expect(new Set(keys).size).toBe(keys.length);
          expect(keys.length).toBeLessThanOrEqual(from.length + to.length);
          // Counts: reactions per section and in total (a reaction in both sections counts once).
          expect(study.counts.reactionsOf).toBe(new Set(from.map((c) => c.reactionId)).size);
          expect(study.counts.preparationOf).toBe(new Set(to.map((c) => c.reactionId)).size);
          expect(study.counts.total).toBe(new Set([...from, ...to].map((c) => c.reactionId)).size);
          // Elsewhere: the outcomes a card does not hold are counted, never lost.
          for (const group of study.reactionsOf.groups) {
            for (const card of group.cards) {
              cards += 1;
              const own = new Set(card.groups.flatMap((group) => group.outcomes).map((o) => o.outcomeId));
              const all = new Set(from.filter((c) => c.reactionId === card.reactionId).map((c) => c.outcomeId));
              const elsewhereOutcomes = new Set(from.filter((c) => c.reactionId === card.reactionId && c.toHub !== group.hubId).map((c) => c.outcomeId));
              expect(card.elsewhere.reduce((sum, e) => sum + e.outcomeCount, 0)).toBe(from.filter((c) => c.reactionId === card.reactionId && c.toHub !== group.hubId).reduce((set, c) => set.add(`${c.toHub}|${c.outcomeId}`), new Set<string>()).size);
              for (const outcomeId of all) expect(own.has(outcomeId) || elsewhereOutcomes.has(outcomeId)).toBe(true);
              if (card.elsewhere.length > 0) withElsewhere += 1;
            }
          }
          expect(familyStudy(ctx, hubId)).toEqual(study);
        }
      }),
      PARAMS,
    );
    expect(cards).toBeGreaterThan(20);
    expect(withElsewhere).toBeGreaterThan(0);
  });
});
