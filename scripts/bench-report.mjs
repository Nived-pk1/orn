#!/usr/bin/env node
// Shared runner for `npm run bench:baseline` and `npm run bench:compare` (docs/PERFORMANCE_ARCHITECTURE.md
// §9). Runs tests/perf/*.bench.ts through Vitest's benchmark mode (Node API — `vitest bench`'s CLI has no
// built-in "fail on regression" mode, only a display-only `--compare`), joins each measured task with its
// budget metadata from tests/perf/budgets.mjs, and returns one entry per benchmark with mean/p75/p99/sample
// count. Nothing is silently skipped: an unmatched benchmark (renamed, or new and not yet in budgets.mjs)
// or a stale budgets.mjs entry (no matching benchmark) is a hard error (CLAUDE.md §1.5).
//
// Stable measurement (docs/PROGRESS.md step 2.11): `fileParallelism: false` forces every bench file to run
// one at a time, in a single worker, alongside nothing else vitest/node starts for this call — see
// `acquireBenchLock` for the cross-process half of "benches never run alongside tests or other benches".
import { startVitest } from 'vitest/node';
import { BUDGETS } from '../tests/perf/budgets.mjs';
import { acquireBenchLock } from './bench-guard.mjs';

/**
 * @param {{ quiet?: boolean, skipLock?: boolean }} [options]
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function runBenchmarks(options = {}) {
  const { quiet = false, skipLock = false } = options;
  // skipLock: for a caller that already holds the lock itself, in a *different* process than the one that
  // took it (docs/PROGRESS.md step 2.11's `scripts/bench-run-once.mjs`, spawned by generate-baseline.mjs so
  // each of its 3 runs is a genuinely fresh process — see that file for why a shared process is unsafe here).
  // acquireBenchLock's reentrancy only recognises its own process's PID, so a child process must be told
  // explicitly that the lock is already held rather than trying to take it again.
  const release = skipLock ? () => {} : acquireBenchLock();
  try {
    const results = [];
    const unmatched = [];

    const collector = {
      onInit() {},
      onTestRunEnd(testModules) {
        for (const mod of testModules) {
          for (const t of mod.children.allTests()) {
            const raw = t.task.result?.benchmark;
            if (!raw) continue; // a failed or skipped benchmark task; vitest already reports the failure
            const meta = BUDGETS[t.fullName];
            if (!meta) {
              unmatched.push(t.fullName);
              continue;
            }
            results.push({
              key: t.fullName,
              operation: meta.operation,
              tier: meta.tier,
              shape: meta.shape,
              meanMs: raw.mean,
              p75Ms: raw.p75,
              p99Ms: raw.p99,
              sampleCount: raw.sampleCount,
              budgetMs: meta.budgetMs,
              budgetRow: meta.budgetRow ?? null,
              informalBudgetMs: meta.informalBudgetMs ?? null,
              note: meta.note ?? null,
              openItem: meta.openItem ?? null,
            });
          }
        }
      },
    };

    const reporters = quiet ? [collector] : ['default', collector];
    const vitest = await startVitest('benchmark', [], {}, { test: { benchmark: { reporters }, fileParallelism: false } });
    await vitest.close();

    if (unmatched.length > 0) {
      throw new Error(
        `bench-report: no budget metadata for ${unmatched.length} benchmark(s):\n  ${unmatched.join('\n  ')}\nAdd an entry to tests/perf/budgets.mjs (or remove the stale one it replaced).`,
      );
    }
    const seen = new Set(results.map((r) => r.key));
    const stale = Object.keys(BUDGETS).filter((k) => !seen.has(k));
    if (stale.length > 0) {
      throw new Error(`bench-report: tests/perf/budgets.mjs has entries with no matching benchmark:\n  ${stale.join('\n  ')}`);
    }

    return results;
  } finally {
    release();
  }
}

/** Verdict for one entry: pass/fail against its §2 budget (or the informal one), computed on p99. */
export function verdictOf(entry) {
  const budget = entry.budgetMs ?? entry.informalBudgetMs;
  if (budget == null) return null;
  return entry.p99Ms <= budget;
}
