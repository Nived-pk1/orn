#!/usr/bin/env node
// `npm run bench` — the plain `vitest bench --run` CLI entry point, wrapped so it gets the same guarantees
// as `bench:baseline`/`bench:compare` (docs/PERFORMANCE_ARCHITECTURE.md §9, docs/PROGRESS.md step 2.11):
// the bench PID lock (refuses to start if another bench run is already using it) and `--no-file-parallelism`
// (single worker, no file-parallel bench execution). Extra CLI args (a file filter, `--reporter`, …) pass
// through unchanged.
import { spawnSync } from 'node:child_process';
import { acquireBenchLock } from './bench-guard.mjs';

const release = acquireBenchLock();
try {
  const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(npxBin, ['vitest', 'bench', '--run', '--no-file-parallelism', ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  release();
}
