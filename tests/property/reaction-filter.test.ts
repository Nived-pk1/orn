/**
 * The reaction filter (step 7.1a, ADR-042 E2-E4) over generated states: the result is a subset of the reactions; adding a dimension never
 * grows it; for any dimension d and option o, the facet count of (d, o) equals the size of the result with d set to {o} (everything else as
 * it is, the exam scope included); the rows are in folded-name then ID order; the answer does not change when asked twice.
 */
import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { buildReactionFilterInput, filterReactions, type ReactionFilter, type ReactionFilterEntry } from '@/core/graph';
import { fold } from '@/core/text/normalizer';
import type { Reaction } from '@/core/schema';
import { frozenStateOf, smallParamsArb } from '@/test-support/arbitraries';
import { contextOf } from '@/test-support/graph-state';
import { PARAMS, TIMEOUT_MS } from './harness';

vi.setConfig({ testTimeout: TIMEOUT_MS });

/** A few options chosen by indexes (the same index twice picks it once). */
const choose = (options: readonly string[], picks: readonly number[]): string[] => (options.length === 0 ? [] : [...new Set(picks.map((pick) => options[pick % options.length] as string))]);
const USES = ['reactant', 'arrow', 'product', 'any'] as const;

const picksArb = fc.array(fc.nat(1000), { maxLength: 3 });
const choiceArb = fc.record({
  substance: picksArb,
  usedAs: fc.constantFrom(...USES),
  from: picksArb,
  to: picksArb,
  type: picksArb,
  named: picksArb,
  status: picksArb,
  text: fc.option(fc.nat(1000), { nil: undefined }),
  only: fc.boolean(),
});
const DIMENSIONS = ['substance', 'fromFamily', 'toFamily', 'type', 'namedReaction', 'reviewStatus'] as const;

describe('filterReactions', () => {
  it('is a subset, never grows when a dimension is added, and its facets equal the result with that dimension set to the option', () => {
    let facetsChecked = 0;
    fc.assert(
      fc.property(smallParamsArb, fc.array(choiceArb, { minLength: 1, maxLength: 3 }), fc.nat(5), (params, choices, parity) => {
        const state = frozenStateOf(params);
        const { indexes } = contextOf(state);
        const input = buildReactionFilterInput({ state, indexes });
        const reactions = Object.values(state.records.reaction) as Reaction[];
        const all = new Set(reactions.map((r) => r.id as string));
        const scope = (ref: { id: string }) => ((ref.id.length + parity) % 3 === 0 ? ('outside' as const) : ('official' as const));
        const unfiltered = filterReactions(input, {}, scope).facets;
        const options = {
          substance: unfiltered.substance.map((o) => o.id),
          from: unfiltered.fromFamily.map((o) => o.id),
          to: unfiltered.toFamily.map((o) => o.id),
          type: unfiltered.type.map((o) => o.id),
          named: unfiltered.namedReaction.map((o) => o.id),
          status: unfiltered.reviewStatus.map((o) => o.id),
        };
        expect(filterReactions(input, {}, scope).rows.map((r) => r.id).sort()).toEqual([...all].sort());
        for (const choice of choices) {
          const names = reactions.map((r) => fold(r.name));
          const filter: ReactionFilter = {
            substanceIds: choose(options.substance, choice.substance),
            usedAs: choice.usedAs,
            fromFamilyIds: choose(options.from, choice.from),
            toFamilyIds: choose(options.to, choice.to),
            typeIds: choose(options.type, choice.type),
            namedReactionIds: choose(options.named, choice.named),
            reviewStatuses: choose(options.status, choice.status) as never,
            ...(choice.text === undefined || names.length === 0 ? {} : { text: (names[choice.text % names.length] as string).slice(0, 3) }),
            onlyInScope: choice.only,
          };
          const result = filterReactions(input, filter, scope);
          // a subset, in order, no repeats, stable
          for (const row of result.rows) expect(all.has(row.id)).toBe(true);
          expect(new Set(result.rows.map((r) => r.id)).size).toBe(result.rows.length);
          const keys = result.rows.map((r) => `${fold(r.name)}\u0000${r.id}`);
          expect(keys).toEqual([...keys].sort());
          expect(filterReactions(input, filter, scope)).toEqual(result);
          // adding a dimension never grows the result
          const bigger: ReactionFilter = { ...filter, typeIds: [...(filter.typeIds ?? []), ...choose(options.type, choice.type.map((n) => n + 1))].slice(0, 1) };
          if ((filter.typeIds ?? []).length === 0 && (bigger.typeIds ?? []).length > 0) {
            const narrowed = new Set(filterReactions(input, bigger, scope).rows.map((r) => r.id));
            const before = new Set(result.rows.map((r) => r.id));
            for (const id of narrowed) expect(before.has(id)).toBe(true);
          }
          // facet(d, o) = size of the result with d set to {o}
          const key = { substance: 'substanceIds', fromFamily: 'fromFamilyIds', toFamily: 'toFamilyIds', type: 'typeIds', namedReaction: 'namedReactionIds', reviewStatus: 'reviewStatuses' } as const;
          for (const dimension of DIMENSIONS) {
            for (const option of result.facets[dimension === 'substance' ? 'substance' : dimension].slice(0, 6)) {
              const set = filterReactions(input, { ...filter, [key[dimension]]: [option.id] }, scope);
              expect(option.count, `${dimension} ${option.id}`).toBe(set.rows.length);
              facetsChecked += 1;
            }
          }
          expect(result.total).toBe(all.size);
          expect(result.hiddenByScope).toBeLessThanOrEqual(all.size);
        }
      }),
      PARAMS,
    );
    expect(facetsChecked).toBeGreaterThan(0);
  });

  it('From and To together (7.1b C2): over entries with several candidates each, a facet equals the result with that option chosen', () => {
    const family = fc.constantFrom('A', 'B', 'C', 'D');
    const entryArb = fc.array(fc.tuple(family, family), { minLength: 0, maxLength: 3 });
    fc.assert(
      fc.property(fc.array(entryArb, { minLength: 1, maxLength: 12 }), fc.subarray(['A', 'B', 'C', 'D']), fc.subarray(['A', 'B', 'C', 'D']), (all, from, to) => {
        const entries: ReactionFilterEntry[] = all.map((candidates, index) => {
          const pairs = [...new Map(candidates.map((p) => [p.join('|'), p as readonly [string, string]])).values()].sort();
          const id = `rxn_${String(index).padStart(3, '0')}`;
          return { id, name: id, folded: id, fromFamilyIds: [...new Set(pairs.map((p) => p[0]))].sort(), toFamilyIds: [...new Set(pairs.map((p) => p[1]))].sort(), pairs, typeIds: [], namedReactionIds: [], status: 'unreviewed', reactants: new Set(), arrow: new Set(), products: new Set(), any: new Set() };
        });
        const input = { entries };
        const filter: ReactionFilter = { fromFamilyIds: from, toFamilyIds: to };
        const result = filterReactions(input, filter, undefined);
        // the rule: ONE candidate with its from in From and its to in To (an empty choice is no constraint)
        const expected = entries.filter((e) => e.pairs.some((p) => (from.length === 0 || from.includes(p[0])) && (to.length === 0 || to.includes(p[1])))).map((e) => e.id);
        expect(result.rows.map((r) => r.id)).toEqual(expected);
        for (const option of result.facets.fromFamily) expect(option.count, `from ${option.id}`).toBe(filterReactions(input, { ...filter, fromFamilyIds: [option.id] }, undefined).rows.length);
        for (const option of result.facets.toFamily) expect(option.count, `to ${option.id}`).toBe(filterReactions(input, { ...filter, toFamilyIds: [option.id] }, undefined).rows.length);
      }),
      PARAMS,
    );
  });
});
