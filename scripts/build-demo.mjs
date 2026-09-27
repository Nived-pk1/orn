#!/usr/bin/env node
// Regenerates data/seed/demo.orn.json and data/fixtures/demo-invalid.orn.json from the builders in
// src/test-support/demo. The demo test rewrites the files when ORN_WRITE_DEMO=1 and otherwise fails if
// they differ from the builders, so a stale committed file cannot pass `npm test`.
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['vitest', 'run', 'src/test-support/demo'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ORN_WRITE_DEMO: '1' },
});
process.exit(result.status ?? 1);
