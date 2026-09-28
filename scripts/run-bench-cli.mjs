#!/usr/bin/env node
// `npm run bench` — the plain `vitest bench --run` CLI entry point, wrapped so it gets the same guarantees
// as `bench:baseline`/`bench:compare` (docs/PERFORMANCE_ARCHITECTURE.md §9, docs/PROGRESS.md step 2.11):
// the bench PID lock (refuses to start if another bench run is already using it) and `--no-file-parallelism`
// (single worker, no file-parallel bench execution). Extra CLI args (a file filter, `--reporter`, …) pass
// through unchanged.
//
// Step 2.13: vitest is started as `node <vitest's own entry file> …`, not through `npx`. On Windows `npx` is
// `npx.cmd`, which Node >= 20.12 refuses to spawn without a shell (`spawnSync npx.cmd EINVAL`); running the
// entry file with `process.execPath` needs neither `.cmd` resolution nor a shell, so it is the same call on
// every platform (and passes the arguments unchanged, with no shell quoting in the way).
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { acquireBenchLock } from './bench-guard.mjs';

const vitestEntry = join(dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs');

const release = acquireBenchLock();
try {
  const result = spawnSync(process.execPath, [vitestEntry, 'bench', '--run', '--no-file-parallelism', ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  release();
}
