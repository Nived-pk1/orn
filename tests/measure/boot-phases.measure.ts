/**
 * Step 5.10b, Part 2c (informal; run alone; REPORTED, nothing decided): where the Chromium boot time goes, cold and warm, at the
 * design tier (the dense file with the 60 navigator anchors, imported once into a profile that is then copied).
 *   npx tsx tests/measure/boot-phases.measure.ts timeline [runs]   production build on 4173: every worker request / response, every
 *                                                                    IndexedDB open / transaction, the status and overview marks
 *   npx tsx tests/measure/boot-phases.measure.ts profile [runs]    NON-MINIFIED build on 4174 (started with
 *                                                                    `vite preview --outDir <temp> --port 4174 --strictPort --host 127.0.0.1`):
 *                                                                    a V8 CPU profile of the main thread from navigation to the overview
 * COLD = a copy of the seeded profile with the HTTP and code caches removed, WARM = the same copy opened again.
 */
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { chooseFile, expectPreview, generatedFileWithAnchors, importDialog } from '../e2e/kit';

const mode = process.argv[2] ?? 'timeline';
const runs = Number(process.argv[3] ?? 3);
const ORIGIN = mode === 'profile' ? 'http://127.0.0.1:4174' : 'http://127.0.0.1:4173';
const LONG = { timeout: 300_000 } as const;

const PROBE = `(() => {
  const p = (window.__t = { calls: [], idb: [], status: null, ready: null, overview: null });
  const now = () => performance.now();
  const O = window.Worker;
  window.Worker = class extends O {
    constructor(url, opts) {
      super(url, opts);
      const name = String(url).replace(/^.*\\/(worker-[a-z]+)-.*$/, '$1');
      const open = new Map();
      const created = now();
      const post = this.postMessage.bind(this);
      this.postMessage = (m, t) => {
        if (m && m.type === 'request') { const c = { worker: name, method: m.method, created, sent: now(), answered: null }; open.set(m.id, c); p.calls.push(c); }
        return post(m, t);
      };
      this.addEventListener('message', (e) => {
        const d = e.data;
        if (d && d.type === 'response' && open.has(d.id)) { open.get(d.id).answered = now(); open.delete(d.id); }
      });
    }
  };
  const fo = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function (...a) {
    const r = fo.apply(this, a); const rec = { kind: 'open', name: a[0], start: now(), end: null }; p.idb.push(rec);
    r.addEventListener('success', () => { rec.end = now(); }); r.addEventListener('error', () => { rec.end = now(); rec.err = true; });
    return r;
  };
  const tx = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (stores, mode, ...r) {
    const t = tx.call(this, stores, mode, ...r); const rec = { kind: 'tx', stores: [].concat(stores).join(','), mode: mode || 'readonly', start: now(), end: null };
    p.idb.push(rec);
    t.addEventListener('complete', () => { rec.end = now(); }); t.addEventListener('abort', () => { rec.end = now(); rec.abort = true; });
    return t;
  };
  const look = () => {
    const s = document.querySelector('[aria-label="Status"]');
    if (s && p.status === null) p.status = now();
    if (s && p.ready === null && !(s.textContent || '').includes('Starting up')) p.ready = now();
    if (p.overview === null && document.querySelector('svg [data-node-id]')) p.overview = now();
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true });
  look();
})()`;

interface Call { worker: string; method: string; created: number; sent: number; answered: number | null }
interface Idb { kind: string; name?: string; stores?: string; mode?: string; start: number; end: number | null; abort?: boolean }
interface Probe { calls: Call[]; idb: Idb[]; status: number | null; ready: number | null; overview: number | null }
interface Node { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }
interface Profile { nodes: Node[]; startTime: number; samples: number[]; timeDeltas: number[] }

const f0 = (v: number | null | undefined): string => (v === null || v === undefined ? 'never' : v.toFixed(0).padStart(5));

async function seed(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'orn-seed-'));
  const context = await chromium.launchPersistentContext(dir, { baseURL: ORIGIN, viewport: { width: 1280, height: 800 } });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto('/');
  await page.getByText('Starting up', { exact: true }).waitFor({ state: 'detached', ...LONG });
  await chooseFile(page, generatedFileWithAnchors('design', 'dense'));
  await expectPreview(page, 300_000);
  await importDialog(page).getByRole('button', { name: 'Confirm' }).click();
  await page.getByText(/^Imported \d+ records from /).waitFor(LONG);
  await page.locator('svg [data-node-id]').first().waitFor(LONG);
  await page.waitForTimeout(4_000);
  await context.close();
  return dir;
}

function stripCaches(dir: string): void {
  for (const name of ['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache'])
    for (const base of [dir, join(dir, 'Default')]) rmSync(join(base, name), { recursive: true, force: true });
}

function showTimeline(label: string, p: Probe): void {
  console.log(`-- ${label}: status ${f0(p.status)}, ready ${f0(p.ready)}, overview ${f0(p.overview)} ms from navigation start`);
  const rows: { at: number; text: string }[] = [];
  for (const i of p.idb) rows.push({ at: i.start, text: `idb ${i.kind === 'open' ? `open ${i.name}` : `${i.mode} tx [${i.stores}]`}: ${f0(i.start)} -> ${f0(i.end)} (${i.end === null ? 'never settled' : `${(i.end - i.start).toFixed(0)} ms`}${i.abort ? ', ABORTED' : ''})` });
  for (const c of p.calls) rows.push({ at: c.sent, text: `${c.worker}.${c.method}: sent ${f0(c.sent)} -> answered ${f0(c.answered)} (${c.answered === null ? 'open' : `${(c.answered - c.sent).toFixed(0)} ms`}); worker created ${f0(c.created)}` });
  for (const r of rows.sort((a, b) => a.at - b.at)) console.log(`   ${r.text}`);
}

/** Inclusive time and first / last sample of the named functions, plus the main-thread busy and idle split per 250 ms. */
function showProfile(label: string, profile: Profile, t0Us: number, endMs: number): void {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  profile.nodes.forEach((n) => (n.children ?? []).forEach((c) => parent.set(c, n.id)));
  const incl = new Map<string, { ms: number; first: number; last: number }>();
  const buckets = new Map<number, number>();
  let at = profile.startTime;
  profile.samples.forEach((id, i) => {
    const dt = profile.timeDeltas[i] ?? 0;
    at += dt;
    const rel = (at - t0Us) / 1000;
    if (rel > endMs) return;
    const fn = (byId.get(id) as Node).callFrame.functionName;
    if (fn !== '(idle)') buckets.set(Math.floor(rel / 250), (buckets.get(Math.floor(rel / 250)) ?? 0) + dt / 1000);
    const seen = new Set<string>();
    for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
      const f = (byId.get(cur) as Node).callFrame;
      if (f.functionName === '' || f.functionName.startsWith('(')) continue;
      const key = `${f.functionName} ${f.url.replace(/^.*\//, '')}:${f.lineNumber + 1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const e = incl.get(key) ?? { ms: 0, first: rel, last: rel };
      e.ms += dt / 1000;
      e.last = rel;
      incl.set(key, e);
    }
  });
  console.log(`-- ${label}: main thread busy ms per 250 ms bucket (non-idle samples): ${[...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k * 250}:${v.toFixed(0)}`).join(' ')}`);
  const interesting = /replaceState|build|loadReplica|restore|boot|start|hydrate|load|index|search|layout|scene|render|performWorkOnRoot|commitRoot|bulk|getAll|toArray|parse|validate|deserial|serialize|freeze|createRoot/i;
  const rows = [...incl.entries()].filter(([k, v]) => v.ms >= 40 && interesting.test(k)).sort((a, b) => b[1].ms - a[1].ms).slice(0, 22);
  for (const [k, v] of rows) console.log(`   ${v.ms.toFixed(0).padStart(5)} ms INCL  first ${v.first.toFixed(0).padStart(5)} last ${v.last.toFixed(0).padStart(5)}  ${k}`);
}

async function bootOnce(dir: string, label: string): Promise<void> {
  const context: BrowserContext = await chromium.launchPersistentContext(dir, { baseURL: ORIGIN, viewport: { width: 1280, height: 800 } });
  await context.addInitScript({ content: PROBE });
  const page: Page = context.pages()[0] ?? (await context.newPage());
  const session = await context.newCDPSession(page);
  if (mode === 'profile') {
    await session.send('Profiler.enable');
    await session.send('Profiler.setSamplingInterval', { interval: 1000 });
    await session.send('Profiler.start');
  }
  const started = Date.now();
  await page.goto('/');
  await page.locator('svg [data-node-id]').first().waitFor(LONG);
  const wall = Date.now() - started;
  await page.waitForTimeout(500);
  const probe = (await page.evaluate('window.__t')) as Probe;
  if (mode === 'profile') {
    const { profile } = (await session.send('Profiler.stop')) as { profile: Profile };
    // the profile starts a little before navigation: its start stands for time 0, so profile times run a few tens of ms early
    showProfile(label, profile, profile.startTime, (probe.overview ?? wall) + 200);
    console.log(`   (overview ${f0(probe.overview)} ms in the page; wall ${wall} ms incl. profiler overhead)`);
  } else showTimeline(label, probe);
  await context.close();
}

async function main(): Promise<void> {
  console.log(`== boot phases (${mode}), Chromium, ${process.platform}, ${runs} runs each, origin ${ORIGIN}`);
  const seeded = await seed();
  for (let i = 1; i <= runs; i += 1) {
    const dir = mkdtempSync(join(tmpdir(), 'orn-bp-'));
    cpSync(seeded, dir, { recursive: true });
    stripCaches(dir);
    await bootOnce(dir, `cold ${i}`);
    await bootOnce(dir, `warm ${i}`);
    rmSync(dir, { recursive: true, force: true });
  }
  rmSync(seeded, { recursive: true, force: true });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
