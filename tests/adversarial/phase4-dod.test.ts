/**
 * Phase 4 DoD, row 2 (docs/IMPLEMENTATION_PLAN.md §3, step 4.6): "all worker APIs have in-process tests". Like gate-c.test.ts, this checks
 * that nothing is missing: every method of the four `RpcMethodSpecs` objects (the type forces one entry per API method) must be named, as a
 * whole word, in at least one test title under src/ or tests/. A name counts only in a describe/it/test title, never in a comment.
 * Row 1 (the induced crashes) is tests/integration/worker-crash-recovery.test.ts plus the two crash tests of compute-worker-threads.test.ts;
 * row 3 (L4 findings for the demo's invalid species) is tests/integration/l4-service.test.ts, "the demo dataset (Phase 4 DoD)".
 */
import { describe, expect, it } from 'vitest';
import { CHEM_SPECS } from '@/workers/chem/specs';
import { COMPUTE_SPECS } from '@/workers/compute/specs';
import { LAYOUT_SPECS } from '@/workers/layout/specs';
import { SEARCH_SPECS } from '@/workers/search/specs';
import { testTitles } from './gate-matrix';

const APIS = { chem: CHEM_SPECS, compute: COMPUTE_SPECS, layout: LAYOUT_SPECS, search: SEARCH_SPECS } as const;
const wordIn = (word: string, text: string): boolean => new RegExp(`(^|[^A-Za-z0-9_])${word}($|[^A-Za-z0-9_])`).test(text);

describe('Phase 4 completeness: every worker API method is named in a test title', () => {
  const titles = testTitles();

  it('finds the four APIs and their methods', () => {
    expect(Object.keys(CHEM_SPECS).length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(COMPUTE_SPECS).length).toBeGreaterThanOrEqual(14);
    expect(Object.keys(LAYOUT_SPECS).length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(SEARCH_SPECS).length).toBeGreaterThanOrEqual(5);
    expect(titles.length).toBeGreaterThan(1_000);
  });

  for (const [worker, specs] of Object.entries(APIS)) {
    it.each(Object.keys(specs))(`${worker}: %s is named in at least one test title`, (method) => {
      expect(
        titles.some((title) => wordIn(method, title)),
        `no test title names ${worker}.${method}`,
      ).toBe(true);
    });
  }
});
