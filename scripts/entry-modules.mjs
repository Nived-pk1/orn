#!/usr/bin/env node
// The biggest modules of the entry chunk of an edition (from build-report/<edition>.json): node scripts/entry-modules.mjs <study|studio> [n]
import { readFileSync } from 'node:fs';

const edition = process.argv[2] ?? 'studio';
const count = Number(process.argv[3] ?? 10);
const report = JSON.parse(readFileSync(`build-report/${edition}.json`, 'utf8'));
const entry = report.chunks.find((chunk) => chunk.isEntry && /^assets\/index-/.test(chunk.file));
if (entry === undefined || entry.rendered === undefined) {
  console.error('no entry chunk with sizes in the report');
  process.exit(1);
}
const rows = Object.entries(entry.rendered).sort((a, b) => b[1] - a[1]).slice(0, count);
for (const [id, size] of rows) console.log(`${(size / 1000).toFixed(1).padStart(8)} kB  ${id}`);
console.log(`${entry.modules.length} modules in ${entry.file}`);
