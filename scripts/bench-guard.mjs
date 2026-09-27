#!/usr/bin/env node
// Mutual exclusion for tests/perf/*.bench.ts runs (docs/PERFORMANCE_ARCHITECTURE.md §9, docs/PROGRESS.md
// step 2.11). Benchmarks must never run alongside another benchmark run — two `vitest bench` processes (or
// a bench run and `bench:baseline`'s/`bench:compare`'s own Node-API run) sharing the machine measure each
// other's GC/CPU contention, not the operation under test (docs/PROGRESS.md step 2.10's contention note:
// the same scenario measured 20-32 ms alone vs. 92-107 ms inside the full suite).
//
// This guards the self-inflicted case — the common one, since every bench entry point in this repo
// (`npm run bench`, `npm run bench:baseline`, `npm run bench:compare`) goes through `acquireBenchLock` —
// with a PID lock file: a second call from a different live process is refused outright, and a call from
// the same process (e.g. `bench:baseline` running the suite three times in one Node invocation, step 2.11)
// nests correctly via an in-memory reference count.
//
// It does NOT scan the OS process list for an unrelated `npm test` / `vitest watch` process started in
// another terminal: reliable cross-platform command-line inspection was judged impractical to get right
// here — Windows' `tasklist` omits command lines by default (a `wmic`/CIM query that does show them is slow
// and permission-sensitive), and matching by process name alone (`node`) would false-positive on any
// unrelated Node process. Per this step's own instructions, that case is a documented manual check instead
// (docs/PERFORMANCE_ARCHITECTURE.md §9): confirm no other `npm test`, `npm run test:watch`, or `npm run
// bench*` process is running before benchmarking.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCK_PATH = fileURLToPath(new URL('../tests/perf/.bench.lock', import.meta.url));

function isAlive(pid) {
  try {
    // Signal 0 sends nothing; it only checks whether the process exists and is signalable (Node docs).
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

let holdCount = 0;
let cleanupRegistered = false;

function removeLockFile() {
  try {
    rmSync(LOCK_PATH, { force: true });
  } catch {
    // best effort — a missing or unremovable lock file must never crash the bench run itself
  }
}

/**
 * Takes the bench lock, throwing if a *different*, still-live process already holds it. Returns a release
 * function; call it exactly once per `acquireBenchLock()` call (nested calls within the same process are
 * safe — the lock file is written once and removed only when the last holder releases it).
 */
export function acquireBenchLock() {
  if (holdCount === 0) {
    if (existsSync(LOCK_PATH)) {
      const held = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
      if (held.pid !== process.pid && isAlive(held.pid)) {
        throw new Error(
          `bench-guard: another benchmark run (pid ${held.pid}, started ${held.startedAt}) already holds ` +
            `${LOCK_PATH}. Benches must run alone, never alongside another bench or the test suite ` +
            `(docs/PERFORMANCE_ARCHITECTURE.md §9) — wait for it to finish. If it crashed without cleaning ` +
            `up, delete the lock file and retry.`,
        );
      }
      // Stale lock (the holder process no longer exists) — safe to reclaim.
    }
    mkdirSync(dirname(LOCK_PATH), { recursive: true });
    writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    if (!cleanupRegistered) {
      cleanupRegistered = true;
      process.once('exit', removeLockFile);
      process.once('SIGINT', () => {
        removeLockFile();
        process.exit(130);
      });
      process.once('SIGTERM', () => {
        removeLockFile();
        process.exit(143);
      });
    }
  }
  holdCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holdCount -= 1;
    if (holdCount === 0) removeLockFile();
  };
}
