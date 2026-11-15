#!/usr/bin/env node
// The edition check (studio step E2, ADR-041): proves the Study build has NO editing code and that the Studio build has it.
//   node scripts/check-edition.mjs <study|studio> [distDir] [reportFile]
// The module list of every chunk is the build's own report (`build-report/<edition>.json`, written by the Vite plugin in
// vite.config.ts: the Vite manifest lists chunks, not modules). Rules:
//   1. Study: no module of EDITOR_MODULES in ANY chunk (entry, lazy or worker). One module is a failure, named with its chunk.
//   2. Studio: at least one editor module is in the build (a report of the wrong build is not mistaken for a right one).
//   3. The report is for this edition.
//   4. Both: the initial JS (the scripts and preloads index.html names) in gzip kB is reported; Study must be at most
//      360 kB and Studio at most 365 kB (step 8.4s; scripts/check-build.mjs keeps the same two lines).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/** What counts as an editor module: scripts/editor-modules.json (also read by vite.config.ts). */
const EDITOR_MODULES = JSON.parse(readFileSync(new URL('./editor-modules.json', import.meta.url), 'utf8')).modules;
// step 8.4s (L1): lowered after the lazy map canvas gave the room back, so it is not spent silently
const STUDY_LINE_KB = 360;
const STUDIO_LINE_KB = 365;
const MAX_LISTED = 6;

/**
 * Step 8.4s (S7; audit SE-01): names that mark an editor module even when nobody listed its path in editor-modules.json. A Study module whose
 * path has one of these in it fails the check, so a new editor file that was forgotten in the list is still caught. A module that has such a
 * name and is meant for Study goes in NAME_OK, each with its reason.
 */
const DENY_PATTERNS = ['delete-host', 'merge-port', 'quick-entry', 'create-new', 'bulk-'];
const NAME_OK = new Map([['src/features/navigator/bulk-context.ts', 'a React context with an inert default: Study reads it, only Studio fills it']]);
const deniedBy = (id) => (NAME_OK.has(id) ? undefined : DENY_PATTERNS.find((pattern) => id.includes(pattern)));

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
        for (const id of (chunk.modules ?? []).filter((module) => !isEditorModule(module))) {
          const pattern = deniedBy(id);
          if (pattern !== undefined) fail(chunk.file, `module ${id} is in the Study build and its name has "${pattern}" (an editor name; list it in editor-modules.json, or give the reason in NAME_OK)`);
        }
      }
      if (edition === 'studio' && editorModules === 0) fail('studio', 'no editor module in the build (the report or the build is the wrong one)');
      notes.push(`${edition}: ${report.chunks.length} chunks, ${editorModules} editor module(s)`);
    }
    const kb = initialGzipKb(dist);
    if (kb === undefined) fail('index.html', `missing from ${dist}`);
    else {
      notes.push(`initial JS (${edition}): ${kb.toFixed(2)} kB gzip`);
      const line = edition === 'studio' ? STUDIO_LINE_KB : STUDY_LINE_KB;
      if (kb > line) fail('initial JS', `${kb.toFixed(2)} kB gzip is over the ${line} kB line`);
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
