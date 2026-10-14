/**
 * Step 5.10b, Part 2b (informal; run alone; REPORTED, nothing decided): the Gate C watch (openItem 71) and phase-4-close §9 items
 * 1, 2 and 4 in a real browser with real IndexedDB, against the PRODUCTION build on port 4173.
 *   npx tsx tests/measure/import-conflict.measure.ts [tier] [shape]      (default: design hub_explosion)
 * ORN_CHANGE=1 (decision 6 of the 2026-10-14 review): the second file has the SAME IDs but `tags` changed on EVERY record (a provenance timestamp is not content: the first try with it said "0 would be written"),
 * so every ID conflicts with DIFFERENT content (the Gate C watch). Without it the second file is byte-identical ("0 would be written").
 * Step 1: the file is imported into an empty store (apply). Step 2: the SAME file is chosen again through the File menu, so every ID
 * conflicts; the time from the file chosen to the preview shown is the "Import 5k reactions (parse -> preview)" row's figure with
 * real conflicts. A Chromium trace (devtools.timeline) lists the main-thread message-handling events over 20 ms (the cost of receiving
 * a whole state from a worker, item 1), and an in-page wrapper times every `postMessage` to a worker (the cost of sending a state).
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { chooseFile, chooseFileViaMenu, expectPreview, generatedFile, importDialog, openApp } from '../e2e/kit';
import { serializeDocument } from '@/core/dataset';
import { generateTier, type GeneratorShape, type GeneratorTier } from '@/test-support/generator';

const ORIGIN = 'http://127.0.0.1:4173';

const SEND = `(() => {
  window.__sends = [];
  window.__long = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ start: e.startTime, duration: e.duration }); }).observe({ type: 'longtask' }); } catch (e) {}
  const O = window.Worker;
  window.Worker = class extends O {
    constructor(url, opts) {
      super(url, opts);
      const name = String(url).replace(/^.*\\/(worker-[a-z]+)-.*$/, '$1');
      const post = this.postMessage.bind(this);
      this.postMessage = (m, t) => {
        const a = performance.now();
        const r = post(m, t);
        const d = performance.now() - a;
        if (d > 5) window.__sends.push({ worker: name, method: m && m.method, at: a, ms: d });
        return r;
      };
    }
  };
})()`;

/** ORN_BY_PATH=1: upload by path (the browser reads the file natively); a buffer goes through Playwright's injected script, a 3-5 s main-thread task of the harness. */
async function pick(page: Page, file: { name: string; mimeType: string; buffer: Buffer }, viaMenu: boolean, byPath: boolean): Promise<void> {
  if (!byPath) return viaMenu ? chooseFileViaMenu(page, file) : chooseFile(page, file);
  const path = join(mkdtempSync(join(tmpdir(), 'orn-conf-')), file.name);
  writeFileSync(path, file.buffer);
  if (viaMenu) {
    await page.getByRole('button', { name: 'File' }).click();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: /Import a file\.\.\./ }).click()]);
    await chooser.setFiles(path);
  } else {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import a file' }).click()]);
    await chooser.setFiles(path);
  }
}

/** The same IDs as `generatedFile`, with one field (`tags`, one added tag) changed on every record. */
function changedFile(tier: GeneratorTier, shape: GeneratorShape): { name: string; mimeType: string; buffer: Buffer } {
  const doc = generateTier(tier, shape, 1) as unknown as { records: Record<string, { tags?: string[] }[]> };
  let changed = 0;
  for (const rows of Object.values(doc.records)) {
    for (const row of rows) {
      if (!Array.isArray(row.tags)) continue;
      row.tags = [...row.tags, 'changed'];
      changed += 1;
    }
  }
  console.log(`changed file: tags changed on ${changed} records`);
  const result = serializeDocument(doc as never);
  if (!result.ok) throw new Error('the changed document does not serialise');
  return { name: `generated-${tier}-${shape}-changed.orn.json`, mimeType: 'application/json', buffer: Buffer.from(result.text, 'utf8') };
}

interface TraceEvent {
  readonly name: string;
  readonly ph: string;
  readonly ts: number;
  readonly dur?: number;
  readonly pid: number;
  readonly tid: number;
  readonly args?: { readonly name?: string };
}

async function main(): Promise<void> {
  const tier = (process.argv[2] ?? 'design') as GeneratorTier;
  const shape = (process.argv[3] ?? 'hub_explosion') as GeneratorShape;
  const byPath = process.env.ORN_BY_PATH === '1';
  const browser = await chromium.launch();
  console.log(`Chromium ${browser.version()}, production build, headless, ${process.platform}, ${tier} ${shape}, upload ${byPath ? 'by path' : 'as a buffer'}`);
  const context = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.addInitScript({ content: SEND });
  await openApp(page);
  const file = generatedFile(tier, shape);
  console.log(`file: ${file.name}, ${(file.buffer.length / 1048576).toFixed(1)} MB`);

  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing'] });
  await page.evaluate("performance.mark('t:first-start')");
  const a0 = Date.now();
  await pick(page, file, false, byPath);
  await expectPreview(page, 600_000);
  const a1 = Date.now();
  console.log(`first import (empty store): file chosen to preview ${a1 - a0} ms`);
  await importDialog(page).getByRole('button', { name: 'Confirm' }).click();
  await page.getByText(/^Imported \d+ records from /).waitFor({ timeout: 600_000 });
  const a2 = Date.now();
  console.log(`first import: Confirm to "Imported" ${a2 - a1} ms`);
  await page.waitForTimeout(3_000);
  await page.evaluate("performance.mark('t:second-start')");
  const second = process.env.ORN_CHANGE === '1' ? changedFile(tier, shape) : file;
  const b0 = Date.now();
  await pick(page, second, true, byPath);
  await expectPreview(page, 600_000);
  const b1 = Date.now();
  console.log(`second import (same file, every ID conflicting): file chosen to preview ${b1 - b0} ms  <- the row is 5,000 ms`);
  const summary = (await importDialog(page).innerText()).replace(/\s+/g, ' ').slice(0, 1500);
  console.log(`preview says: ${summary}`);
  await page.evaluate("performance.mark('t:second-shown')");
  await page.waitForTimeout(1_000);
  const raw = await browser.stopTracing();

  const sends = (await page.evaluate('window.__sends')) as { worker: string; method: string; at: number; ms: number }[];
  console.log(`postMessage calls over 5 ms (the main-thread cost of sending): ${sends.length === 0 ? 'none' : ''}`);
  for (const s of sends) console.log(`   ${s.worker} ${s.method} at ${s.at.toFixed(0)} ms: ${s.ms.toFixed(1)} ms`);
  const longs = (await page.evaluate('window.__long')) as { start: number; duration: number }[];
  console.log(`long tasks over 50 ms during both imports: ${longs.length}${longs.length ? ` (${longs.map((l) => `${l.duration.toFixed(0)} ms at ${l.start.toFixed(0)}`).join(', ')})` : ''}`);

  const events = (JSON.parse(raw.toString('utf8')) as { traceEvents: TraceEvent[] }).traceEvents;
  const mark = events.find((e) => e.name === 't:first-start');
  const main = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain' && e.pid === mark?.pid);
  if (mark === undefined || main === undefined) throw new Error('no main thread in the trace');
  const names = new Set(['HandlePostMessage', 'MessageEvent', 'V8.DeserializeValue', 'RunMicrotasks']);
  const inMain = events.filter((e) => e.ph === 'X' && e.pid === main.pid && e.tid === main.tid && names.has(e.name) && (e.dur ?? 0) > 20_000);
  console.log(`main-thread message-handling events over 20 ms: ${inMain.length}`);
  for (const e of inMain.sort((x, y) => x.ts - y.ts)) console.log(`   ${e.name} ${((e.dur ?? 0) / 1000).toFixed(0)} ms at +${((e.ts - mark.ts) / 1000).toFixed(0)} ms`);
  await browser.close();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
