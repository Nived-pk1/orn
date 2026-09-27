#!/usr/bin/env node
// One benchmark pass, run to completion and printed as JSON on stdout — nothing else goes to stdout ('
// reporters: [collector]' only, quiet mode). Spawned as a fresh child process by
// scripts/generate-baseline.mjs (docs/PROGRESS.md step 2.11), never invoked directly: `bench:baseline`'s 3
// runs must be genuinely independent processes, not 3 sequential `startVitest` calls sharing one Node
// process's module cache and V8 JIT state — the first version of this file's 3-run method did exactly that
// and it was the dominant source of the "noisy" spread it was supposed to catch (baseline.json's own
// caveat originally): almost every entry's *third* call came out fastest, a monotonic warm-up bias, not
// random workstation noise (confirmed by inspecting the raw p99Runs before this fix — run 3 was the low
// outlier in the large majority of entries, never randomly any of the three). `skipLock: true` because the
// parent already holds the bench lock for the whole 3-run session (this process's own PID would otherwise
// look like a second, conflicting bench run to `acquireBenchLock`).
import { runBenchmarks } from './bench-report.mjs';

const results = await runBenchmarks({ quiet: true, skipLock: true });
process.stdout.write(JSON.stringify(results));
