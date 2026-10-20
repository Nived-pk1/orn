#!/usr/bin/env node
// npm run publish:dataset -- <file>   (studio step E4, ADR-041, docs/RELEASE.md "Publishing a dataset")
// Checks a Studio export (.orn.json with its pictures embedded, or an .ornpkg) with the SAME import pipeline the app uses (src/io/publish.ts:
// parse, envelope, migrations, L1-L3, assets with magic bytes and SHA-256), refuses on any L1 ERROR or rejected asset, prints the counts and
// the findings, then copies the file into data/published/ (dataset.orn.json or dataset.ornpkg) with manifest.json: sha256, publishedAt from an
// INJECTED clock (ORN_NOW, an ISO time; the wall clock only when it is not set), the record counts. Nothing is written on a refusal.
// ORN_PUBLISH_DIR changes the folder (the tests use a temporary one). Exit: 0 accepted, 1 refused, 2 usage.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'tsx/esm/api';

const file = process.argv[2];
if (file === undefined || process.argv.length > 3) {
  console.error('usage: npm run publish:dataset -- <file>');
  process.exit(2);
}
let bytes;
try {
  bytes = new Uint8Array(readFileSync(file));
} catch (error) {
  console.error(`publish: cannot read ${file} (${error instanceof Error ? error.message : String(error)})`);
  process.exit(1);
}

const root = fileURLToPath(new URL('..', import.meta.url));
register({ tsconfig: join(root, 'tsconfig.json') }); // the repo's TypeScript and its "@/" paths, in Node
const { checkForPublish } = await import('../src/io/publish.ts');
const { createIdFactory } = await import('../src/core/dataset/index.ts');
const { migrationRunner } = await import('../src/core/migrations/index.ts');
const { emptyRecordTables } = await import('../src/core/schema/index.ts');

const nowText = process.env.ORN_NOW ?? new Date().toISOString();
const nowMs = Date.parse(nowText);
if (Number.isNaN(nowMs)) {
  console.error(`publish: ORN_NOW is not a time: ${nowText}`);
  process.exit(2);
}
// the ephemeral session's IDs: a fixed generator, so a run never depends on chance
let seed = 20261021;
const next = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const iso = new Date(nowMs).toISOString();
const empty = { meta: { datasetId: 'orn-publish-check', title: 'Untitled dataset', createdAt: iso, updatedAt: iso }, records: emptyRecordTables() };
const verdict = await checkForPublish({ fileName: file, bytes }, { store: { getState: () => empty, getRevision: () => 0 }, ids: createIdFactory({ nowMs: () => nowMs }, { next }), runner: migrationRunner });

const SHOWN = 20;
const printFindings = (findings) => {
  if (findings.length > SHOWN) console.log('  (the first ' + SHOWN + ' of ' + findings.length + ' listed findings; errors come first)');
  for (const finding of findings.slice(0, SHOWN)) console.log(`  ${finding.severity.toUpperCase().padEnd(7)} ${finding.ruleId.padEnd(8)} ${finding.subject.kind} ${finding.subject.id}: ${finding.message}`);
};
if (!verdict.ok) {
  console.error(`publish: refused ${file}`);
  for (const reason of verdict.reasons) console.error(`  - ${reason}`);
  if (verdict.findings.length > 0) {
    console.error('findings:');
    printFindings(verdict.findings);
  }
  process.exit(1);
}

const kinds = Object.keys(verdict.counts).sort();
console.log(`records (${verdict.mergedRecordCount}):`);
for (const kind of kinds) console.log(`  ${kind.padEnd(14)} ${verdict.counts[kind]}`);
const summary = verdict.findingSummary;
console.log(`findings: ${summary.error} error, ${summary.warning} warning, ${summary.info} info, ${summary.reviewRequired} review required${summary.truncated ? ' (list cut short)' : ''}`);
printFindings(verdict.findings);
console.log(`pictures stored with the file: ${verdict.assets.toStore}`);

const dir = resolve(process.env.ORN_PUBLISH_DIR ?? join(root, 'data', 'published'));
const name = verdict.format === 'orn.package' ? 'dataset.ornpkg' : 'dataset.orn.json';
const other = verdict.format === 'orn.package' ? 'dataset.orn.json' : 'dataset.ornpkg';
const sha256 = createHash('sha256').update(bytes).digest('hex');
const manifest = {
  manifestVersion: 1,
  file: name,
  format: verdict.format,
  sha256,
  bytes: bytes.length,
  publishedAt: iso,
  recordTotal: verdict.mergedRecordCount,
  recordCounts: Object.fromEntries(kinds.map((kind) => [kind, verdict.counts[kind]])),
};
mkdirSync(dir, { recursive: true });
// write beside, then rename: a failure never leaves a dataset without its manifest
writeFileSync(join(dir, `${name}.tmp`), bytes);
writeFileSync(join(dir, 'manifest.json.tmp'), `${JSON.stringify(manifest, null, 2)}\n`);
renameSync(join(dir, `${name}.tmp`), join(dir, name));
renameSync(join(dir, 'manifest.json.tmp'), join(dir, 'manifest.json'));
if (existsSync(join(dir, other))) rmSync(join(dir, other));
console.log(`publish: accepted ${file} -> ${join(dir, name)} (sha256 ${sha256})`);
