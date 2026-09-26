#!/usr/bin/env node
// Guards the "no reaction-specific hacks" rule (docs/ARCHITECTURE.md §2.6, INV-25).
// Collects record IDs and names from data/seed and data/fixtures and fails if any appears
// as a string literal in production source. Justified exceptions: append `// hardcode-ok: <reason>`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const DATA_ROOTS = ['data/seed', 'data/fixtures'];
const MIN_NAME_LENGTH = 5;

function* walk(dir, exts) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path, exts);
    else if (exts.has(extname(name))) yield path;
  }
}

const ids = new Set();
const names = new Set();
function collect(value, key) {
  if (Array.isArray(value)) { value.forEach((v) => collect(v, key)); return; }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collect(v, k);
    return;
  }
  if (typeof value !== 'string') return;
  if (/^[a-z]{3}_[0-9a-z][0-9a-z-]{1,62}$/.test(value)) ids.add(value);
  if ((key === 'canonical' || key === 'name') && value.trim().length >= MIN_NAME_LENGTH) names.add(value.trim().toLowerCase());
}
for (const root of DATA_ROOTS) {
  for (const file of walk(root, new Set(['.json']))) {
    try { collect(JSON.parse(readFileSync(file, 'utf8'))); } catch { /* non-JSON or malformed fixtures are ignored here */ }
  }
}

const literal = /(['"`])((?:\\.|(?!\1).)*)\1/g;
let failures = 0;
for (const file of walk('src', new Set(['.ts', '.tsx']))) {
  if (/\.(test|bench)\.tsx?$/.test(file) || file.startsWith(join('src', 'test-support'))) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    // Examples in documentation comments are allowed; code is not.
    if (line.includes('hardcode-ok:') || trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
    for (const match of line.matchAll(literal)) {
      const text = match[2];
      const hit = ids.has(text) || names.has(text.trim().toLowerCase()) || [...ids].some((id) => text.includes(id));
      if (hit) {
        failures += 1;
        console.error(`✖ ${relative(process.cwd(), file)}:${index + 1} hardcodes dataset content: ${match[0]}`);
      }
    }
  });
}
if (failures > 0) process.exit(1);
console.log(`check:hardcode passed (${ids.size} ids, ${names.size} names checked)`);
