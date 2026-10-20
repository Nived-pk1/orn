#!/usr/bin/env node
// The edition check (studio step E2, ADR-041): proves the Study build has NO editing code and that the Studio build has it.
//   node scripts/check-edition.mjs <study|studio> [distDir] [reportFile]
// The module list of every chunk is the build's own report (`build-report/<edition>.json`, written by the Vite plugin in
// vite.config.ts: the Vite manifest lists chunks, not modules). Rules:
//   1. Study: no module of EDITOR_MODULES in ANY chunk (entry, lazy or worker). One module is a failure, named with its chunk.
//   2. Studio: at least one editor module is in the build (a report of the wrong build is not mistaken for a right one).
//   3. The report is for this edition.
//   4. Both: the initial JS (the scripts and preloads index.html names) in gzip kB is reported; Studio, which has the most, must be at
//      most 395 kB (the line of the reviewer; scripts/check-build.mjs keeps its own 400 kB budget for both).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/** What counts as an editor module: scripts/editor-modules.json (also read by vite.config.ts). */
const EDITOR_MODULES = JSON.parse(readFileSync(new URL('./editor-modules.json', import.meta.url), 'utf8')).modules;
const STUDIO_LINE_KB = 395;
const MAX_LISTED = 6;

const isEditorModule = (id) => EDITOR_MODULES.some((entry) => (entry.endsWith('/') ? id.startsWith(entry) : id === entry));

function initialGzipKb(dist) {
  const index = join(dist, 'index.html');
  if (!existsSync(index)) return undefined;
  const html = readFileSync(index, 'utf8');
  const names = [...html.matchAll(/<(?:script|link)\s[^>]*(?:src|href)="\/?([^"]+\.js)"/gi)].map((match) => match[1]);
  return names.reduce((sum, name) => sum + (existsSync(join(dist, name)) ? gzipSync(readFileSync(join(dist, name))).length : 0), 0) / 1000;
}

function main() {
  const edition = process.argv[2];
  const dist = process.argv[3] ?? (edition === 'studio' ? 'dist-studio' : 'dist');
  const reportPath = process.argv[4] ?? join('build-report', `${edition}.json`);
  const failures = [];
  const notes = [];
  const fail = (where, why) => failures.push(`FAIL ${where}: ${why}`);

  if (edition !== 'study' && edition !== 'studio') {
    fail('edition', `"${edition}" is not study or studio`);
  } else {
    let report;
    try {
      report = JSON.parse(readFileSync(reportPath, 'utf8'));
    } catch (error) {
      fail('report', `cannot read ${reportPath} (${error instanceof Error ? error.message : String(error)})`);
    }
    if (report !== undefined && (typeof report !== 'object' || report === null || !Array.isArray(report.chunks) || typeof report.edition !== 'string')) {
      fail('report', `${reportPath} is not a build report`);
      report = undefined;
    }
    if (report !== undefined && report.edition !== edition) {
      fail('report', `it is for the ${report.edition} edition, not ${edition}`);
      report = undefined;
    }
    if (report !== undefined) {
      let editorModules = 0;
      for (const chunk of report.chunks) {
        const found = (chunk.modules ?? []).filter(isEditorModule);
        editorModules += found.length;
        if (edition !== 'study') continue;
        for (const id of found.slice(0, MAX_LISTED)) fail(chunk.file, `editor module ${id} is in the Study build`);
        if (found.length > MAX_LISTED) fail(chunk.file, `and ${found.length - MAX_LISTED} more editor modules`);
      }
      if (edition === 'studio' && editorModules === 0) fail('studio', 'no editor module in the build (the report or the build is the wrong one)');
      notes.push(`${edition}: ${report.chunks.length} chunks, ${editorModules} editor module(s)`);
    }
    const kb = initialGzipKb(dist);
    if (kb === undefined) fail('index.html', `missing from ${dist}`);
    else {
      notes.push(`initial JS (${edition}): ${kb.toFixed(2)} kB gzip`);
      if (edition === 'studio' && kb > STUDIO_LINE_KB) fail('initial JS', `${kb.toFixed(2)} kB gzip is over the ${STUDIO_LINE_KB} kB line`);
    }
  }
  for (const note of notes) console.log(note);
  if (failures.length > 0) {
    for (const line of failures) console.error(line);
    console.error(`edition check: ${failures.length} problem(s)`);
    process.exit(1);
  }
  console.log('edition check: passed');
}

main();
