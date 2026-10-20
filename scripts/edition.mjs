#!/usr/bin/env node
// Runs Vite for one edition (studio step, ADR-041): node scripts/edition.mjs <study|studio> <vite arguments...>
// e.g. `node scripts/edition.mjs studio build`, `node scripts/edition.mjs study preview --port 4174 --strictPort`.
// It only sets ORN_EDITION (read by vite.config.ts, which also picks the output folder) and starts the local Vite: the same
// on every platform, with no shell and no `VAR=value cmd` syntax.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [edition, ...viteArguments] = process.argv.slice(2);
if (edition !== 'study' && edition !== 'studio') {
  console.error("usage: node scripts/edition.mjs <study|studio> <vite arguments...>");
  process.exit(2);
}
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const result = spawnSync(process.execPath, [vite, ...viteArguments], { stdio: 'inherit', env: { ...process.env, ORN_EDITION: edition } });
process.exit(result.status ?? 1);
