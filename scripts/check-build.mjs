#!/usr/bin/env node
// Build smoke (step 4.6; docs/SONNET_HANDOFF.md §19, `npm run build:smoke`): inspects a production build and fails, naming the
// file, unless
//   1. dist/index.html carries the Content-Security-Policy of docs/SECURITY.md §4, exactly (the policy is read from that document,
//      so the page, the doc and this check cannot drift apart);
//   2. the four worker entries exist as assets/worker-<chem|layout|search|compute>-<hash>.js (vite.config.ts names them from the
//      directory of their entry file);
//   3. RDKit's WASM is a separate hashed asset (assets/*-<hash>.wasm with the WASM magic bytes), the chem worker names it, and no
//      JS chunk carries WASM inlined (a data URL or a long base64 run starting with the magic);
//   4. no JS chunk except RDKit's own glue chunk contains `eval(`, `new Function` or `Function(` (ADR-035). RDKit's glue chunk is
//      the one vite.config.ts names assets/rdkit-glue-<hash>.js: the chunk made only of @rdkit/rdkit modules. Anything else holding
//      RDKit's code keeps another name and is scanned, so a build that merges RDKit into one of our chunks fails here. The glue
//      may be mentioned only by the chem worker's entry (RDKit runs only inside the chem worker).
// Usage: node scripts/check-build.mjs [distDir = dist] [securityDoc = docs/SECURITY.md]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const WORKERS = ['chem', 'layout', 'search', 'compute'];
const dist = process.argv[2] ?? 'dist';
const securityDoc = process.argv[3] ?? 'docs/SECURITY.md';
const EVAL_PATTERNS = [
  ['eval(', /\beval\s*\(/],
  ['(0, eval)', /\(\s*0\s*,\s*eval\s*\)/],
  ['new Function', /new\s+Function\b/],
  ['Function(', /\bFunction\s*\(/],
];
const WASM_BASE64 = /AGFzbQ[A-Za-z0-9+/]{100,}/; // base64 of the magic bytes 00 61 73 6d, then more

const failures = [];
const report = [];
const fail = (file, why) => failures.push(`${file}: ${why}`);
const kB = (bytes) => `${(bytes / 1024).toFixed(2)} kB`;

function files(dir) {
  const found = [];
  if (!existsSync(dir)) return found;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...files(path));
    else found.push(path);
  }
  return found.sort();
}
const rel = (path) => relative(dist, path).split(sep).join('/');
const decodeEntities = (text) => text.replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

// 1. the policy
let expectedCsp;
try {
  const doc = readFileSync(securityDoc, 'utf8');
  const section = doc.slice(doc.search(/^## 4\./m));
  expectedCsp = /`(default-src[^`]*)`/.exec(section)?.[1];
} catch {
  /* reported below */
}
if (expectedCsp === undefined) fail(securityDoc, 'no policy (a backticked `default-src ...` text) found in section 4');
const indexPath = join(dist, 'index.html');
if (!existsSync(indexPath)) fail('index.html', `missing from ${dist}`);
else {
  const html = readFileSync(indexPath, 'utf8');
  const metas = [...html.matchAll(/<meta\s[^>]*http-equiv="Content-Security-Policy"[^>]*>/gi)];
  const content = metas.length === 1 ? /\scontent="([^"]*)"/.exec(metas[0][0])?.[1] : undefined;
  if (metas.length !== 1 || content === undefined) fail(rel(indexPath), `expected exactly one Content-Security-Policy meta tag, found ${metas.length}`);
  else if (expectedCsp !== undefined && decodeEntities(content) !== expectedCsp) fail(rel(indexPath), `the policy is not the one of ${securityDoc} §4.\n    page: ${decodeEntities(content)}\n    doc:  ${expectedCsp}`);
  else report.push(`CSP: ${rel(indexPath)} carries the policy of SECURITY §4 exactly`);
  if (/<script(?![^>]*\ssrc=)[^>]*>/i.test(html)) fail(rel(indexPath), 'has an inline script (the policy allows scripts from the origin only)');
}

const all = files(dist);
const js = all.filter((path) => path.endsWith('.js'));

// 2. the four worker entries
const entries = new Map();
for (const name of WORKERS) {
  const found = js.filter((path) => rel(path).startsWith(`assets/worker-${name}-`) && rel(path).endsWith('.js'));
  if (found.length !== 1) fail(`assets/worker-${name}-<hash>.js`, `expected exactly one worker chunk, found ${found.length}`);
  else if (statSync(found[0]).size === 0) fail(rel(found[0]), 'is empty');
  else {
    entries.set(name, found[0]);
    report.push(`worker ${name}: ${rel(found[0])} (${kB(statSync(found[0]).size)})`);
  }
}

// 3. RDKit's WASM
const wasm = all.filter((path) => path.endsWith('.wasm'));
if (wasm.length !== 1) fail('assets/*.wasm', `expected exactly one WASM asset, found ${wasm.length}`);
else {
  const file = wasm[0];
  const bytes = readFileSync(file);
  const name = rel(file);
  if (!/^assets\/.+-[A-Za-z0-9_-]{6,}\.wasm$/.test(name)) fail(name, 'is not a hashed asset (expected assets/<name>-<hash>.wasm)');
  if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x6d736100) fail(name, 'does not start with the WASM magic bytes');
  const chem = entries.get('chem');
  const basename = name.split('/').pop();
  if (chem !== undefined && !readFileSync(chem, 'utf8').includes(basename)) fail(rel(chem), `does not refer to the WASM asset ${basename}`);
  if (failures.every((line) => !line.startsWith(name))) report.push(`wasm: ${name} (${kB(bytes.length)}), separate and hashed, named by the chem worker`);
}
for (const file of js) {
  const text = readFileSync(file, 'utf8');
  if (/data:application\/wasm/.test(text) || WASM_BASE64.test(text)) fail(rel(file), 'has WASM inlined (a data URL or a base64 run starting with the WASM magic)');
}

// 4. no eval anywhere but RDKit's glue chunk, and only the chem worker may load it
const GLUE = /^assets\/rdkit-glue-[^/]+\.js$/;
const glue = js.filter((path) => GLUE.test(rel(path)));
if (glue.length > 1) fail('assets/rdkit-glue-<hash>.js', `expected at most one RDKit glue chunk, found ${glue.length}`);
for (const file of js) {
  const name = rel(file);
  const text = readFileSync(file, 'utf8');
  if (GLUE.test(name)) {
    report.push(`rdkit glue: ${name} (${kB(statSync(file).size)}), the only chunk allowed \`new Function\` (ADR-035)`);
    continue;
  }
  for (const [label, pattern] of EVAL_PATTERNS) {
    if (pattern.test(text)) fail(name, `contains \`${label}\` (ADR-035: only RDKit's glue chunk may)`);
  }
  if (glue.length > 0 && name !== (entries.get('chem') === undefined ? '' : rel(entries.get('chem'))) && text.includes('rdkit-glue-')) {
    fail(name, 'refers to RDKit\'s glue chunk, which only the chem worker may load');
  }
}
report.push(`scanned ${js.length} JS chunk(s) for eval( / new Function / Function(`);

// 5. the bundled demo dataset ("Load demo dataset", step 5.1d) is served from the origin and is the repo file, byte for byte
const demoSource = fileURLToPath(new URL('../data/seed/demo.orn.json', import.meta.url));
const demoCopies = all.filter((path) => /^assets\/demo\.orn-[^/]+\.json$/.test(rel(path)));
if (demoCopies.length !== 1) fail('assets/demo.orn-<hash>.json', `expected exactly one copy of the demo dataset, found ${demoCopies.length}`);
else if (!readFileSync(demoCopies[0]).equals(readFileSync(demoSource))) fail(rel(demoCopies[0]), 'differs from data/seed/demo.orn.json');
else report.push(`demo dataset: ${rel(demoCopies[0])} (${kB(statSync(demoCopies[0]).size)}) is identical to data/seed/demo.orn.json`);

// 6. lazy chunks (step 5.7): rarely used code is its own chunk, never part of the initial load, and (being JS chunks) scanned in 4
const LAZY = ['views-other', 'import-inprocess', 'export-inprocess', 'import-legacy', 'import-screen'];
const INITIAL_JS_GZIP_BUDGET = 400 * 1000;
const gz = (bytes) => `${(bytes / 1000).toFixed(2)} kB gzip`; // vite's unit (1 kB = 1000 bytes)
const htmlText = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';
const initial = [...htmlText.matchAll(/<(?:script|link)\s[^>]*(?:src|href)="\/?([^"]+\.js)"/gi)].map((m) => m[1]);
for (const name of LAZY) {
  const found = js.filter((path) => rel(path).startsWith(`assets/${name}-`));
  if (found.length === 0) fail(`assets/${name}-<hash>.js`, 'the lazy chunk is missing (the code went back into another chunk)');
  else if (found.some((path) => initial.includes(rel(path)))) fail(name, 'is loaded by index.html, so it is not lazy');
  else report.push(`lazy chunk: ${name} (${found.map((path) => `${gz(gzipSync(readFileSync(path)).length)}`).join(', ')}), not in the initial load`);
}
const initialGzip = initial.reduce((sum, name) => sum + gzipSync(readFileSync(join(dist, name))).length, 0);
if (initial.length === 0) fail('index.html', 'no initial JS found');
else if (initialGzip > INITIAL_JS_GZIP_BUDGET) fail('index.html', `initial JS is ${gz(initialGzip)}, over the 400 kB budget`);
else report.push(`initial JS: ${initial.join(', ')} (${gz(initialGzip)}, budget 400 kB)`);

for (const line of report) console.log(`ok   ${line}`);
if (failures.length > 0) {
  for (const line of failures) console.error(`FAIL ${line}`);
  console.error(`build smoke: ${failures.length} problem(s) in ${dist}`);
  process.exit(1);
}
console.log('build smoke: passed');
