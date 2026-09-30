#!/usr/bin/env node
// Regenerates docs/reviews/demo-chem-findings.md (step 4.3b): every CHEM finding on the demo dataset, for the human reviewer.
// Run by hand: `node scripts/demo-chem-findings.mjs`. Reads data/seed/demo.orn.json; edits no data.
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['tsx', 'src/test-support/demo-chem-findings-cli.ts'], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
