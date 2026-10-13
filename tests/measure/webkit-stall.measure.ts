/**
 * Step 5.10b, Part 2W (informal; run alone; REPORTED, nothing decided): the WebKit import stall. Imports a generated dataset of a given
 * size (the 'initial' dense tier scaled by a factor; files are uploaded BY PATH, Playwright's WebKit stalls on big buffers), confirms,
 * and records what the page, its workers and IndexedDB did, to compare WebKit with Chromium on the same file.
 *   npx tsx tests/measure/webkit-stall.measure.ts <engine> <sizeMB> <waitSeconds> [persistent]
 * Needs the production build on 4173. Prints: the file size, the time to the preview, whether "Imported" ever appeared, every worker
 * request with its answer time (and the last one that was not answered), every IndexedDB transaction (and any that never settled),
 * every page or worker error, and the visible state of the dialog at the end.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox, webkit } from '@playwright/test';
import { documentToState, serializeDocument, stateToDocument } from '@/core/dataset';
import { generateDataset, tierParams } from '@/test-support/generator';

const ORIGIN = 'http://127.0.0.1:4173';

const PROBE = `(() => {
  const L = (window.__w = { calls: [], idb: [], errors: [], beats: 0, last: 0 });
  const now = () => Math.round(performance.now());
  setInterval(() => { L.beats += 1; L.last = now(); }, 500);
  addEventListener('error', (e) => L.errors.push({ at: now(), where: 'window.error', msg: String(e.message).slice(0, 200) }));
  addEventListener('unhandledrejection', (e) => L.errors.push({ at: now(), where: 'unhandledrejection', msg: String(e.reason && (e.reason.name + ': ' + e.reason.message)).slice(0, 200) }));
  const O = window.Worker;
  window.Worker = class extends O {
    constructor(url, opts) {
      super(url, opts);
      const name = String(url).replace(/^.*\\/(worker-[a-z]+)-.*$/, '$1');
      const open = new Map();
      const post = this.postMessage.bind(this);
      this.postMessage = (m, t) => {
        if (m && m.type === 'request') { const c = { worker: name, id: m.id, method: m.method, sent: now(), answered: null, ok: null }; open.set(m.id, c); L.calls.push(c); }
        return post(m, t);
      };
      this.addEventListener('message', (e) => { const d = e.data; if (d && d.type === 'response' && open.has(d.id)) { const c = open.get(d.id); c.answered = now(); c.ok = d.ok; open.delete(d.id); } });
      this.addEventListener('error', (e) => L.errors.push({ at: now(), where: name + ' worker error', msg: String(e.message).slice(0, 200) }));
      this.addEventListener('messageerror', () => L.errors.push({ at: now(), where: name + ' messageerror', msg: '' }));
    }
  };
  const fo = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function (...a) {
    const r = fo.apply(this, a); const rec = { kind: 'open', start: now(), end: null }; L.idb.push(rec);
    r.addEventListener('success', () => { rec.end = now(); }); r.addEventListener('error', () => { rec.end = now(); rec.err = String(r.error && r.error.name); });
    return r;
  };
  const tx = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (stores, mode, ...r) {
    const t = tx.call(this, stores, mode, ...r); const rec = { kind: 'tx', stores: [].concat(stores).join(','), mode: mode || 'readonly', start: now(), end: null, result: null };
    L.idb.push(rec);
    t.addEventListener('complete', () => { rec.end = now(); rec.result = 'complete'; });
    t.addEventListener('abort', () => { rec.end = now(); rec.result = 'ABORT ' + String(t.error && (t.error.name + ': ' + t.error.message)).slice(0, 160); });
    t.addEventListener('error', () => { rec.err = String(t.error && t.error.name); });
    return t;
  };
})()`;

function fileOfMb(targetMb: number): { path: string; bytes: number } {
  const base = tierParams('initial', 'dense', 1);
  const build = (scale: number): string => {
    const params = { ...base, species: Math.max(2, Math.round(base.species * scale)), classes: Math.max(2, Math.round(base.classes * scale)), reagents: Math.max(1, Math.round(base.reagents * scale)), reactions: Math.max(2, Math.round(base.reactions * scale)), topics: Math.max(1, Math.round(base.topics * scale)) };
    const doc = generateDataset(params);
    const parsed = documentToState(doc);
    if (!parsed.ok) throw new Error('duplicate ids');
    const out = serializeDocument(stateToDocument(parsed.state, { exportedAt: doc.exportedAt, exportScope: doc.exportScope, generator: doc.generator }));
    if (!out.ok) throw new Error('does not serialise');
    return out.text;
  };
  let scale = targetMb / 3.5;
  let text = build(scale);
  scale *= (targetMb * 1048576) / Buffer.byteLength(text, 'utf8');
  text = build(scale);
  const path = join(mkdtempSync(join(tmpdir(), 'orn-ws-')), `generated-${targetMb}mb.orn.json`);
  writeFileSync(path, text, 'utf8');
  return { path, bytes: Buffer.byteLength(text, 'utf8') };
}

interface Log { calls: { worker: string; method: string; sent: number; answered: number | null; ok: boolean | null }[]; idb: { kind: string; stores?: string; mode?: string; start: number; end: number | null; result?: string | null; err?: string }[]; errors: { at: number; where: string; msg: string }[]; beats: number; last: number }

async function main(): Promise<void> {
  const [engine = 'webkit', sizeArg = '1', waitArg = '120', persistent = ''] = process.argv.slice(2);
  const type = engine === 'chromium' ? chromium : engine === 'firefox' ? firefox : webkit;
  const file = fileOfMb(Number(sizeArg));
  console.log(`== ${engine} ${type.name()}, ${persistent === 'persistent' ? 'persistent' : 'ephemeral'} context, file ${(file.bytes / 1048576).toFixed(2)} MB, wait ${waitArg} s`);
  const opts = { baseURL: ORIGIN, viewport: { width: 1280, height: 800 } };
  const browser = persistent === 'persistent' ? null : await type.launch();
  const context = browser !== null ? await browser.newContext(opts) : await type.launchPersistentContext(mkdtempSync(join(tmpdir(), 'orn-wsp-')), opts);
  await context.addInitScript({ content: PROBE });
  const page = context.pages()[0] ?? (await context.newPage());
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning' ? console.log(`   console ${m.type()}: ${m.text().slice(0, 200)}`) : undefined));
  page.on('pageerror', (e) => console.log(`   pageerror: ${String(e).slice(0, 200)}`));
  await page.goto('/');
  await page.getByText('Starting up', { exact: true }).waitFor({ state: 'detached', timeout: 120_000 });
  const t0 = Date.now();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import a file' }).click()]);
  await chooser.setFiles(file.path);
  await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).waitFor({ timeout: 240_000 });
  const t1 = Date.now();
  console.log(`file chosen to preview: ${t1 - t0} ms`);
  await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).click();
  let done = false;
  const seen: string[] = [];
  for (let s = 0; s < Number(waitArg) && !done; s += 5) {
    await page.waitForTimeout(5_000);
    const text = await Promise.race([page.evaluate(`(document.body.innerText || '').replace(/\\s+/g, ' ').slice(-200)`) as Promise<string>, new Promise<string>((r) => setTimeout(() => r('PAGE DID NOT ANSWER IN 10 s'), 10_000))]);
    if (seen[seen.length - 1] !== text) { seen.push(text); console.log(`   +${Math.round((Date.now() - t1) / 1000)} s: ${text}`); }
    done = /Imported \d+ records/.test(text);
  }
  console.log(done ? `IMPORTED after ${Date.now() - t1} ms from Confirm` : `NOT imported within ${waitArg} s of Confirm`);
  const log = (await Promise.race([page.evaluate('window.__w') as Promise<Log>, new Promise<null>((r) => setTimeout(() => r(null), 10_000))]));
  if (log === null) console.log('the page did not answer for the log');
  else {
    console.log(`page heartbeats: ${log.beats}, last at ${log.last} ms (page clock now unknown)`);
    for (const c of log.calls.filter((x) => x.method !== 'warmUp')) console.log(`   ${c.worker}.${c.method}: sent ${c.sent}, ${c.answered === null ? 'NOT ANSWERED' : `answered ${c.answered} (${c.answered - c.sent} ms, ok=${String(c.ok)})`}`);
    const unsettled = log.idb.filter((x) => x.end === null);
    console.log(`indexedDB: ${log.idb.length} opens/transactions, ${unsettled.length} never settled; aborted: ${log.idb.filter((x) => (x.result ?? '').startsWith('ABORT')).map((x) => `${x.stores} ${x.result}`).join(' | ') || 'none'}`);
    for (const x of log.idb.filter((y) => y.end === null || y.end - y.start > 300)) console.log(`   SLOW tx: ${x.kind} ${x.mode ?? ''} [${x.stores ?? ''}] ${x.start} -> ${x.end ?? 'NEVER SETTLED'} (${x.end === null ? '' : `${x.end - x.start} ms`}) ${x.result ?? ''}`);
    for (const x of log.idb.slice(-3)) console.log(`   last tx: ${x.kind} ${x.mode ?? ''} [${x.stores ?? ''}] ${x.start} -> ${x.end ?? 'NEVER SETTLED'} ${x.result ?? ''} ${x.err ?? ''}`);
    console.log(`errors: ${log.errors.length === 0 ? 'none' : ''}`);
    for (const e of log.errors) console.log(`   ${e.at} ${e.where}: ${e.msg}`);
  }
  await context.close();
  await browser?.close();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
