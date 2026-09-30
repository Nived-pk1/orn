#!/usr/bin/env node
// Regenerates data/fixtures/legacy-expected/ (the committed expected outputs of the legacy dry run, step 3.11c).
// Run by hand, on purpose: `node scripts/legacy-expected.mjs`. NEVER called by a test (the test only compares).
// Read data/fixtures/legacy-expected/README.md first: a regeneration needs a reason recorded in docs/PROGRESS.md.
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['tsx', 'src/test-support/legacy-expected-cli.ts'], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
