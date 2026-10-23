#!/usr/bin/env node
// Gate D (step 6.9): the 27-reaction authoring run, Chromium only, in the Playwright project "gate-d" (not part of the regular e2e run).
// The project exists only when ORN_GATE_D is set, which this script does. Extra arguments go to Playwright.
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['playwright', 'test', '--project=gate-d', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ORN_GATE_D: '1' },
});
process.exit(result.status ?? 1);
