#!/usr/bin/env node
// Fails when a text file of the repository holds a raw control character other than tab, LF and CR
// (step 3.11c review, Part A): git and other tools treat such a file as binary, so its diffs and merges silently
// stop working. Write the character as an escape (for example \u0000) instead.
// Scope: .md and .json under docs/, data/ and the repo root; source files (.ts, .tsx, .mjs, .js, .cjs, .css) under
// src/, tests/ and scripts/ (the same defect was found in src/io/legacy-v6/id-space.ts).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const DOC_EXTENSIONS = new Set(['.md', '.json']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js', '.cjs', '.css']);
const TREES = [
  { root: 'docs', extensions: DOC_EXTENSIONS, recursive: true },
  { root: 'data', extensions: DOC_EXTENSIONS, recursive: true },
  { root: '.', extensions: DOC_EXTENSIONS, recursive: false },
  { root: 'src', extensions: SOURCE_EXTENSIONS, recursive: true },
  { root: 'tests', extensions: SOURCE_EXTENSIONS.union(DOC_EXTENSIONS), recursive: true },
  { root: 'scripts', extensions: SOURCE_EXTENSIONS, recursive: true },
];
// C0 controls except TAB (09), LF (0A), CR (0D), plus DEL (7F).
// eslint-disable-next-line no-control-regex -- matching control characters is the purpose of this script
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function* walk(dir, extensions, recursive) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (recursive) yield* walk(path, extensions, recursive);
    } else if (extensions.has(extname(name))) yield path;
  }
}

let failures = 0;
for (const { root, extensions, recursive } of TREES) {
  for (const file of walk(root, extensions, recursive)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const match of line.matchAll(CONTROL)) {
        failures += 1;
        const code = match[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
        console.error(`✖ ${relative(process.cwd(), file)}:${index + 1}:${match.index + 1}: raw control character U+${code}; write it as an escape.`);
      }
    });
  }
}
if (failures > 0) process.exit(1);
console.log('check:control-chars passed');
