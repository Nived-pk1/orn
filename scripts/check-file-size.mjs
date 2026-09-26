#!/usr/bin/env node
// Enforces the file-size rule (docs/ARCHITECTURE.md §2.5): source files ≤ 400 lines, warning above 300.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOTS = ['src', 'tests', 'scripts'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.css']);
const HARD_LIMIT = 400;
const SOFT_LIMIT = 300;

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (EXTENSIONS.has(extname(name))) yield path;
  }
}

let failures = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, 'utf8').split('\n').length;
    const rel = relative(process.cwd(), file);
    if (lines > HARD_LIMIT) {
      failures += 1;
      console.error(`✖ ${rel}: ${lines} lines (limit ${HARD_LIMIT}) — split by responsibility.`);
    } else if (lines > SOFT_LIMIT) {
      console.warn(`⚠ ${rel}: ${lines} lines (consider splitting above ${SOFT_LIMIT}).`);
    }
  }
}
if (failures > 0) process.exit(1);
console.log('check:size passed');
