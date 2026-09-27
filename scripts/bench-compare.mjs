#!/usr/bin/env node
// `npm run bench:compare` (docs/PERFORMANCE_ARCHITECTURE.md §9). Runs tests/perf/*.bench.ts and fails
// (exit 1) if any entry's p99 regresses more than 20% against the committed tests/perf/baseline.json, on
// the same runner class assumption §9 states. Run at gates only — kept out of `npm run check` because a
// single-run benchmark on a developer workstation (not a dedicated CI runner class) is noisy enough that
// running it on every commit would be flaky, not informative; see baseline.json's own "runner" note.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runBenchmarks } from './bench-report.mjs';

const BASELINE_PATH = fileURLToPath(new URL('../tests/perf/baseline.json', import.meta.url));
const REGRESSION_THRESHOLD = 0.20;

async function main() {
  const baselineRaw = await readFile(BASELINE_PATH, 'utf8');
  const baseline = JSON.parse(baselineRaw);
  const baselineByKey = new Map(baseline.entries.map((e) => [`${e.operation}::${e.tier}::${e.shape}`, e]));

  const measured = await runBenchmarks();

  const regressions = [];
  const missingFromBaseline = [];
  for (const entry of measured) {
    const key = `${entry.operation}::${entry.tier}::${entry.shape}`;
    const prior = baselineByKey.get(key);
    if (!prior) {
      missingFromBaseline.push(entry.operation);
      continue;
    }
    const change = (entry.p99Ms - prior.p99Ms) / prior.p99Ms;
    if (change > REGRESSION_THRESHOLD) {
      regressions.push({ operation: entry.operation, tier: entry.tier, shape: entry.shape, baselineP99: prior.p99Ms, measuredP99: entry.p99Ms, change });
    }
  }

  console.log(`\nCompared ${measured.length} benchmark entries against ${BASELINE_PATH}.`);
  if (missingFromBaseline.length > 0) {
    console.log(`New entries with nothing to compare against (not a failure): ${missingFromBaseline.join(', ')}`);
  }

  if (regressions.length === 0) {
    console.log(`No entry regressed p99 by more than ${REGRESSION_THRESHOLD * 100}%.`);
    return;
  }

  console.error(`\n${regressions.length} entr${regressions.length === 1 ? 'y' : 'ies'} regressed p99 by more than ${REGRESSION_THRESHOLD * 100}% against the baseline:`);
  for (const r of regressions) {
    console.error(`  ${r.operation} (${r.tier}/${r.shape}): baseline p99 ${r.baselineP99} ms → measured p99 ${r.measuredP99} ms (${(r.change * 100).toFixed(1)}%)`);
  }
  console.error(`\nRe-run to rule out workstation noise (baseline.json's own caveat) before concluding this is a real regression.`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
