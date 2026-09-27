#!/usr/bin/env node
// `npm run bench:baseline` — docs/PERFORMANCE_ARCHITECTURE.md §9. Runs tests/perf/*.bench.ts three times
// (docs/PROGRESS.md step 2.11: a single run's p99 is too noisy to judge anything by — the same scenario has
// been measured 35.6 ms in one run and 107-129 ms in another) and writes tests/perf/baseline.json: each
// run's own p99, the median p99 across the three (that is what verdicts use — a conservative stand-in for
// §2's p95 budgets, since `vitest bench` does not report p95), and mean/p75 medianed the same way. An
// entry whose three p99s spread by more than 25% (`(max - min) / median`) gets that spread recorded in the
// entry itself, not hidden — see the entry's own `p99SpreadPct`/`p99Runs`. Run this only when deliberately
// re-establishing the committed baseline (at a gate, or after a reviewed performance change); everyday
// CI-style checking is `npm run bench:compare` against the committed file, not this.
//
// Each of the 3 runs is spawned as a genuinely separate `node` process (`scripts/bench-run-once.mjs`), not
// a 3x in-process loop: an earlier version called `runBenchmarks()` three times inside this same process,
// and that was itself a measurement bug, not a neutral baseline — with one shared process's V8 JIT/module
// cache warming across the 3 calls, the *third* call came out fastest in the large majority of entries (not
// randomly any of the three, which random workstation noise would produce), inflating every entry's
// reported spread with a systematic bias rather than real run-to-run variance. Independent processes remove
// that bias; whatever spread remains after this fix is real.
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { verdictOf } from './bench-report.mjs';
import { acquireBenchLock } from './bench-guard.mjs';

const BASELINE_PATH = fileURLToPath(new URL('../tests/perf/baseline.json', import.meta.url));
const RUN_ONCE_PATH = fileURLToPath(new URL('./bench-run-once.mjs', import.meta.url));
const RUNS = 3;
const SPREAD_THRESHOLD = 0.25;

/** Runs one bench pass in a fresh `node` process and parses its JSON-on-stdout result. */
function runOnceInFreshProcess() {
  const result = spawnSync(process.execPath, [RUN_ONCE_PATH], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`bench-run-once.mjs exited ${result.status}:\n${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function round(ms) {
  return Math.round(ms * 10_000) / 10_000;
}

/** The middle value of an odd-length array of numbers (RUNS is always 3, so no averaging-of-two case). */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

async function main() {
  const release = acquireBenchLock();
  let allRuns;
  try {
    allRuns = [];
    for (let run = 1; run <= RUNS; run += 1) {
      console.log(`\n=== bench:baseline run ${run}/${RUNS} (fresh process) ===`);
      allRuns.push(runOnceInFreshProcess());
    }
  } finally {
    release();
  }

  // Every run measures the same benchmark keys (bench-report.mjs throws on an unmatched/stale one, so a
  // key present in run 1 is present in every run) — group by key across the three runs.
  const byKey = new Map();
  for (const run of allRuns) {
    for (const entry of run) {
      if (!byKey.has(entry.key)) byKey.set(entry.key, []);
      byKey.get(entry.key).push(entry);
    }
  }

  const entries = [];
  const noisy = [];
  for (const runs of byKey.values()) {
    const first = runs[0];
    const p99Runs = runs.map((r) => round(r.p99Ms));
    const p99Median = median(p99Runs);
    const spreadPct = p99Median > 0 ? ((Math.max(...p99Runs) - Math.min(...p99Runs)) / p99Median) * 100 : 0;
    const isNoisy = spreadPct > SPREAD_THRESHOLD * 100;
    if (isNoisy) noisy.push({ operation: first.operation, tier: first.tier, shape: first.shape, spreadPct });

    const medianEntry = { ...first, meanMs: median(runs.map((r) => r.meanMs)), p75Ms: median(runs.map((r) => r.p75Ms)), p99Ms: p99Median };

    entries.push({
      operation: first.operation,
      tier: first.tier,
      shape: first.shape,
      meanMs: round(medianEntry.meanMs),
      p75Ms: round(medianEntry.p75Ms),
      p99Ms: p99Median,
      p99Runs,
      p99SpreadPct: round(spreadPct),
      sampleCount: Math.min(...runs.map((r) => r.sampleCount)),
      budgetMs: first.budgetMs,
      ...(first.informalBudgetMs != null ? { informalBudgetMs: first.informalBudgetMs } : {}),
      budgetRow: first.budgetRow,
      pass: verdictOf(medianEntry),
      ...(first.note != null ? { note: first.note } : {}),
      ...(first.openItem != null ? { openItem: first.openItem } : {}),
      ...(isNoisy
        ? {
            noisy: `p99 spread ${round(spreadPct)}% across ${RUNS} runs (> ${SPREAD_THRESHOLD * 100}%) — see docs/PERFORMANCE_ARCHITECTURE.md §9 for what to check (GC inside the timed region, setup leaking into it, shared state between iterations) before trusting this entry's verdict`,
          }
        : {}),
    });
  }

  const baseline = {
    measuredAt: new Date().toISOString().slice(0, 10),
    toolchain: `Node ${process.version.replace(/^v/, '')}, Vitest 4.1.11 (vitest bench via the Node API)`,
    runner:
      'developer workstation, ' +
      `${RUNS} runs of the whole suite, each its own fresh node process (docs/PROGRESS.md step 2.11 — an ` +
      'earlier version of this file ran all 3 in one process and that cross-run warm-up was itself the ' +
      "dominant source of spread, not real noise) — not a dedicated CI runner " +
      'class; numbers are indicative, not tight. Machine conditions: plugged in (not on battery), no other ' +
      'heavy applications open, file parallelism disabled and a single worker (fileParallelism: false — see ' +
      'scripts/bench-guard.mjs), no other vitest process running concurrently (enforced for other bench runs ' +
      'via a PID lock; an unrelated `npm test`/`vitest watch` process is a manual check, documented in ' +
      'PERFORMANCE_ARCHITECTURE.md §9 — cross-platform process-list inspection was judged impractical here).',
    note:
      "docs/PERFORMANCE_ARCHITECTURE.md §9: 'CI fails when a benchmark regresses > 20% against the baseline on the same runner class.' " +
      '`npm run bench:compare` (scripts/bench-compare.mjs) checks that threshold against this file (single run, compared to the median ' +
      "below); it is run at gates, not in `npm run check`. Regenerate this file with `npm run bench:baseline` (scripts/generate-baseline.mjs, " +
      `${RUNS} runs). Each entry's \`p99Runs\` is that run's own p99, in run order; \`p99Ms\` is their median, which is what \`pass\` is computed ` +
      `on; \`p99SpreadPct\` is \`(max - min) / median\` across the ${RUNS} runs, and an entry over ${SPREAD_THRESHOLD * 100}% also gets a \`noisy\` field — nothing is hidden (CLAUDE.md §1.5).`,
    budgetSource: 'docs/PERFORMANCE_ARCHITECTURE.md §2, design tier (docs/PERFORMANCE_ARCHITECTURE.md §1: 2,000 entities / 5,000 reactions / 15,000 relationships+mappings); stress-tier entries use §1\'s "budgets may degrade <= 2x" allowance as an informal budget (no §2 row of its own).',
    verdictBasis:
      "median p99 across 3 runs, as a conservative stand-in for §2's p95 budgets — `vitest bench` (tinybench) reports p75/p99/p995/p999 but not p95, and a single run's p99 is too noisy to judge alone (docs/PROGRESS.md step 2.10 measured the same scenario at 35.6 ms and 92-107/120-129 ms across runs). `pass` below is computed on the median of 3 p99s; a p95 verdict would only be more forgiving.",
    ...(noisy.length > 0 ? { noisyEntries: noisy.map((n) => `${n.operation} (${n.tier}/${n.shape}): ${round(n.spreadPct)}% spread`) } : {}),
    entries,
  };

  await writeFile(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${entries.length} entries (median of ${RUNS} runs) to ${BASELINE_PATH}`);
  if (noisy.length > 0) {
    console.log(`${noisy.length} entr${noisy.length === 1 ? 'y' : 'ies'} exceeded the ${SPREAD_THRESHOLD * 100}% spread threshold — see each entry's "noisy" field.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
