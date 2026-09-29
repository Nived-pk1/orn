#!/usr/bin/env node
// Regenerates a legacy oracle: runs the legacy v6 app's OWN data layer over a JSON file, the Phase 0 method
// (data/fixtures/legacy/README.md; docs/PROGRESS.md "Phase 0" and "Step 3.8").
//
//   node scripts/legacy-oracle.mjs <Organic_Reaction_Navigator_v6.html> <input.json> <output.json> [--idempotence]
//   node scripts/legacy-oracle.mjs <legacy.html> <values.json> <output.json> --each <splitLegacyReagent|autofillConditionFlags|fgId>
//
// Only script lines 1-294 of the legacy HTML are used (`defaultData`, `migrateLegacy`, `splitLegacyReagent`,
// `normalizeData` and their helpers; script line 1 is the line after `<script>`), executed in a Node `vm` context with DOM
// stubs. The HTML is never printed or parsed as a whole.
//   default:       output = `normalizeData(input)`; with `--idempotence` it also reports whether
//                  `normalizeData(normalizeData(x))` deep-equals `normalizeData(x)` inside the legacy code.
//   --each <fn>:   input is a JSON array of values; output is `[{ "input": v, "result": fn(v) }, ...]`.
// The output is written as `JSON.stringify(result, null, 2)` plus a newline, like the existing oracle. Not part of
// `npm run check`: the legacy HTML lives outside the repository.
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { isDeepStrictEqual } from 'node:util';

const SCRIPT_TAG = '<script>';
const FIRST = 1;
const LAST = 294;
const EACH_FUNCTIONS = ['splitLegacyReagent', 'autofillConditionFlags', 'fgId'];

const [htmlPath, inputPath, outputPath, ...flags] = process.argv.slice(2);
if (htmlPath === undefined || inputPath === undefined || outputPath === undefined) {
  console.error('usage: node scripts/legacy-oracle.mjs <legacy.html> <input.json> <output.json> [--idempotence | --each <fn>]');
  process.exit(2);
}

const htmlLines = readFileSync(htmlPath, 'utf8').split('\n');
const tagLine = htmlLines.findIndex((line) => line.trim() === SCRIPT_TAG);
if (tagLine < 0) throw new Error('no bare <script> line found');
const code = htmlLines
  .slice(tagLine + FIRST, tagLine + LAST + 1)
  .join('\n')
  .replace(/\r$/gm, '');

const stubElement = () => ({ value: '', innerHTML: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {} });
const sandbox = {
  document: { getElementById: stubElement, querySelector: stubElement, querySelectorAll: () => [], createElement: stubElement },
  window: {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  console,
};
const legacy = runInNewContext(`${code}\n;({ normalizeData, migrateLegacy, splitLegacyReagent, autofillConditionFlags, fgId, defaultData })`, sandbox);
const plain = (value) => JSON.parse(JSON.stringify(value));
const input = JSON.parse(readFileSync(inputPath, 'utf8'));

const eachAt = flags.indexOf('--each');
if (eachAt >= 0) {
  const name = flags[eachAt + 1];
  if (!EACH_FUNCTIONS.includes(name)) throw new Error(`--each takes one of ${EACH_FUNCTIONS.join(', ')}`);
  const results = input.map((value) => ({ input: value, result: plain(legacy[name](value)) }));
  writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`wrote ${outputPath} (${results.length} results of ${name})`);
} else {
  const once = plain(legacy.normalizeData(input));
  writeFileSync(outputPath, `${JSON.stringify(once, null, 2)}\n`);
  console.log(`wrote ${outputPath} (${once.compounds.length} compounds, ${once.reactions.length} reactions, schemaVersion ${once.schemaVersion})`);
  if (flags.includes('--idempotence')) {
    const twice = plain(legacy.normalizeData(plain(once)));
    console.log(`normalizeData is idempotent on its own output: ${isDeepStrictEqual(once, twice)}`);
  }
}
