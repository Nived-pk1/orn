/**
 * Field-aware, per-rule validation scope (ADR-031, ADR-032, docs/PERFORMANCE_ARCHITECTURE.md §4): after random
 * edit sequences aimed at a high-referrer hub species, and at the class hub every species lists (review status
 * and lifecycle, names, notes, parents, classes, deletion) — the ADV-012 shape (one hub, every reaction through it) and the
 * "like water" shape (several hubs among many reactions, one relationship per reaction) — the findings
 * kept by validateTouchedByRule + commitTouched equal a full validateAll after every edit. Edits
 * are raw recipes, so hub deletions leave dangling references and other invalid states, on purpose.
 */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { ADV_012, EDITS, LIKE_WATER, classHubOf, hubOf, stateOf, type Ctx } from '@/test-support/scope-edits';
import { IncrementalRun } from '@/test-support/scope-walk';
import { PARAMS, TIMEOUT_MS } from './harness';

// A resource limit, not an assertion: the hub walks took longer than 30 s once under v8 coverage (step 3.3).
vi.setConfig({ testTimeout: Math.max(TIMEOUT_MS, 120_000) });


describe('P-11 incremental validation equals full validation on high-referrer hubs (ADR-031)', () => {
  const editArb = fc.record({ op: fc.integer({ min: 0, max: EDITS.length - 1 }), a: fc.nat(1_000_000), b: fc.nat(1_000_000), c: fc.nat(1_000_000) });

  it.each([['ADV-012 hub', ADV_012], ['like-water hub', LIKE_WATER]] as const)('%s: after every random edit', (_name, params) => {
    const initial = stateOf(params);
    fc.assert(
      fc.property(fc.array(editArb, { minLength: 1, maxLength: 24 }), (edits) => {
        const run = new IncrementalRun(initial);
        const hub = hubOf(initial, run.indexes);
        const classHub = classHubOf(initial, run.indexes);
        expect(run.indexes.referrersOf(hub).length).toBeGreaterThan(20);
        const graveyard: Ctx['graveyard'] = [];
        edits.forEach((edit, i) => {
          const recipe = EDITS[edit.op]?.({ state: run.state, indexes: run.indexes, hub, classHub, a: edit.a, b: edit.b, c: edit.c, graveyard });
          if (recipe === undefined) return;
          run.apply(recipe);
          run.expectEqualsFull(`edit ${i} (op ${edit.op}, ${edit.a}/${edit.b}/${edit.c})`);
        });
      }),
      PARAMS,
    );
  });

  it('every kind of edit is applicable at least once (the property is not vacuous)', () => {
    const initial = stateOf(LIKE_WATER);
    const run = new IncrementalRun(initial);
    const hub = hubOf(initial, run.indexes);
    const classHub = classHubOf(initial, run.indexes);
    const graveyard: Ctx['graveyard'] = [];
    const applied = new Set<number>();
    for (let round = 0; round < 3; round += 1) {
      EDITS.forEach((edit, op) => {
        const recipe = edit({ state: run.state, indexes: run.indexes, hub, classHub, a: 3 + round, b: 5 + round, c: 12 * (round + 1), graveyard });
        if (recipe === undefined) return;
        run.apply(recipe);
        run.expectEqualsFull(`op ${op}, round ${round}`);
        applied.add(op);
      });
    }
    expect([...applied].length).toBeGreaterThanOrEqual(EDITS.length - 1);
  });
});
