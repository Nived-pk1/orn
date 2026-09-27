#!/usr/bin/env node
// `npm run bench:baseline` — docs/PERFORMANCE_ARCHITECTURE.md §9. Runs tests/perf/*.bench.ts and writes
// tests/perf/baseline.json: mean, p75, p99 and sample count per entry, with the pass/fail verdict computed
// on p99 (a conservative stand-in for the §2 budgets' p95 — vitest bench does not report p95). Run this only
// when deliberately re-establishing the committed baseline (at a gate, or after a reviewed performance
// change); everyday CI-style checking is `npm run bench:compare` against the committed file, not this.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runBenchmarks, verdictOf } from './bench-report.mjs';

const BASELINE_PATH = fileURLToPath(new URL('../tests/perf/baseline.json', import.meta.url));

async function main() {
  const measured = await runBenchmarks();

  const entries = measured.map((entry) => ({
    operation: entry.operation,
    tier: entry.tier,
    shape: entry.shape,
    meanMs: round(entry.meanMs),
    p75Ms: round(entry.p75Ms),
    p99Ms: round(entry.p99Ms),
    sampleCount: entry.sampleCount,
    budgetMs: entry.budgetMs,
    ...(entry.informalBudgetMs != null ? { informalBudgetMs: entry.informalBudgetMs } : {}),
    budgetRow: entry.budgetRow,
    pass: verdictOf(entry),
    ...(entry.note != null ? { note: entry.note } : {}),
    ...(entry.openItem != null ? { openItem: entry.openItem } : {}),
  }));

  const baseline = {
    measuredAt: new Date().toISOString().slice(0, 10),
    toolchain: `Node ${process.version.replace(/^v/, '')}, Vitest 4.1.11 (vitest bench via the Node API)`,
    runner: 'developer workstation, single run — not a dedicated CI runner class; numbers are indicative, not tight (workstation noise: a repeat run can move any single entry by double digits of percent, which is why bench:compare uses a 20% threshold, not a tighter one). A further caveat specific to p99: vitest bench\'s default time budget (500 ms) gives the slower operations here (commit/projection-build entries near or over the 16 ms budget) only 10-30 samples, so their p99 is close to their observed max, not a statistically stable 99th percentile — read it as "the worst run we saw," a still-honest but noisier number than a longer run would give.',
    note: "docs/PERFORMANCE_ARCHITECTURE.md §9: 'CI fails when a benchmark regresses > 20% against the baseline on the same runner class.' `npm run bench:compare` (scripts/bench-compare.mjs) checks that threshold against this file; it is run at gates, not in `npm run check`. Regenerate this file with `npm run bench:baseline` (scripts/generate-baseline.mjs).",
    budgetSource: 'docs/PERFORMANCE_ARCHITECTURE.md §2, design tier (docs/PERFORMANCE_ARCHITECTURE.md §1: 2,000 entities / 5,000 reactions / 15,000 relationships+mappings)',
    verdictBasis: "p99, as a conservative stand-in for §2's p95 budgets — `vitest bench` (tinybench) reports p75/p99/p995/p999 but not p95. `pass` below is computed on p99; a p95 verdict would only be more forgiving.",
    entries,
  };

  await writeFile(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${entries.length} entries to ${BASELINE_PATH}`);
}

function round(ms) {
  return Math.round(ms * 10_000) / 10_000;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
