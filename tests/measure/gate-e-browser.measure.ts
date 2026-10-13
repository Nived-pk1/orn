/**
 * Step 5.10b, Part 1 (informal; run alone; REPORTED, nothing decided). Browser measurements against the PRODUCTION build served by
 * `vite preview` on port 4173 (start it first: `npx vite build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort`).
 *   npx tsx tests/measure/gate-e-browser.measure.ts gesture            Chromium: FPS, React commits, long tasks while panning / zooming
 *   npx tsx tests/measure/gate-e-browser.measure.ts boot chromium|firefox|webkit [runs]
 * Data is the design-tier dense file with the 60 navigator anchors, entered through the real import (E15). A profile seeded by that
 * import is closed and copied: COLD run = a new browser process on a fresh copy with the HTTP and code caches removed where the
 * engine keeps them inside the profile; WARM run = the same copy launched again (caches filled by the cold run before it).
 * "Overview drawn" = the first `svg [data-node-id]` in the document, from navigation start. React commits are counted through a fake
 * DevTools hook installed before the page loads (react-dom's production build calls it), so no test build is needed.
 */
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox, webkit, type BrowserContext, type BrowserType, type Page } from '@playwright/test';
import { chooseFile, expectPreview, generatedFileWithAnchors, importDialog } from '../e2e/kit';

const ORIGIN = 'http://127.0.0.1:4173';
const LONG = { timeout: 300_000 } as const;
const GESTURE_MS = 10_000;

const PROBE = `(() => {
  const p = (window.__probe = { commits: 0, ct: [], longTasks: [], firstStatus: null, ready: null, overview: null, replicaSent: null, replicaAnswered: null, frames: [] });
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, isDisabled: false, renderers: new Map(),
    inject(r) { this.renderers.set(1, r); return 1; },
    onCommitFiberRoot() { p.commits += 1; p.ct.push(performance.now()); }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, onScheduleFiberRoot() {}, checkDCE() {},
  };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) p.longTasks.push({ start: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  const O = window.Worker;
  window.Worker = class extends O {
    constructor(url, opts) {
      super(url, opts);
      let sentId = null;
      const post = this.postMessage.bind(this);
      this.postMessage = (m, t) => {
        if (m && m.type === 'request' && m.method === 'loadReplica' && p.replicaSent === null) { p.replicaSent = performance.now(); sentId = m.id; }
        return post(m, t);
      };
      this.addEventListener('message', (e) => {
        const d = e.data;
        if (sentId !== null && d && d.type === 'response' && d.id === sentId && p.replicaAnswered === null) p.replicaAnswered = performance.now();
      });
    }
  };
  const look = () => {
    const status = document.querySelector('[aria-label="Status"]');
    if (status && p.firstStatus === null) p.firstStatus = performance.now();
    if (status && p.ready === null && !(status.textContent || '').includes('Starting up')) p.ready = performance.now();
    if (p.overview === null && document.querySelector('svg [data-node-id]')) p.overview = performance.now();
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true });
  look();
})()`;

interface Probe {
  commits: number;
  longTasks: { start: number; duration: number }[];
  firstStatus: number | null;
  ready: number | null;
  overview: number | null;
  replicaSent: number | null;
  replicaAnswered: number | null;
}

const ms = (v: number | null): string => (v === null ? 'never' : v.toFixed(0));
const stat = (xs: number[]): string => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const p99 = sorted[Math.min(sorted.length - 1, Math.ceil(0.99 * sorted.length) - 1)] as number;
  return `mean ${mean.toFixed(0)} / p99(=max of ${xs.length}) ${p99.toFixed(0)} / median ${sorted[Math.floor(sorted.length / 2)]?.toFixed(0)} / min ${sorted[0]?.toFixed(0)}`;
};
const typeOf = (name: string): BrowserType => (name === 'firefox' ? firefox : name === 'webkit' ? webkit : chromium);

async function seed(type: BrowserType): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'orn-seed-'));
  const context = await type.launchPersistentContext(dir, { baseURL: ORIGIN, viewport: { width: 1280, height: 800 } });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto('/');
  await page.getByRole('region', { name: 'Status' }).waitFor(LONG);
  await page.getByText('Starting up', { exact: true }).waitFor({ state: 'detached', ...LONG });
  if (process.env.ORN_TIER === 'demo') {
    await page.getByRole('button', { name: 'Load demo dataset' }).click();
  } else {
    const file = generatedFileWithAnchors((process.env.ORN_TIER ?? 'design') as 'design', 'dense');
    console.log(`seed: ${file.name}, ${(file.buffer.length / 1048576).toFixed(1)} MB`);
    if (type === webkit) {
      // Playwright's WebKit stalls on a 17 MB buffer upload through the protocol (step 5.10b): the same bytes are uploaded by path instead.
      writeFileSync(join(tmpdir(), file.name), file.buffer);
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import a file' }).click()]);
      await chooser.setFiles(join(tmpdir(), file.name));
    } else await chooseFile(page, file);
    await expectPreview(page, 300_000);
    await importDialog(page).getByRole('button', { name: 'Confirm' }).click();
  }
  await page.getByText(/^Imported \d+ records from /).waitFor(LONG);
  await page.locator('svg [data-node-id]').first().waitFor(LONG);
  await page.waitForTimeout(4_000);
  await context.close();
  return dir;
}

function stripCaches(dir: string): void {
  for (const name of ['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'cache2', 'Cache2']) {
    for (const base of [dir, join(dir, 'Default')]) rmSync(join(base, name), { recursive: true, force: true });
  }
}

async function open(type: BrowserType, dir: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await type.launchPersistentContext(dir, { baseURL: ORIGIN, viewport: { width: 1280, height: 800 } });
  await context.addInitScript({ content: PROBE });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

async function bootOnce(type: BrowserType, dir: string): Promise<{ probe: Probe; heap: string | null }> {
  const { context, page } = await open(type, dir);
  await page.goto('/');
  await page.locator('svg [data-node-id]').first().waitFor(LONG);
  await page.waitForTimeout(2_500);
  const probe = (await page.evaluate('window.__probe')) as Probe;
  let heap: string | null = null;
  if (type === chromium) {
    const session = await context.newCDPSession(page);
    await session.send('Performance.enable');
    await session.send('HeapProfiler.enable');
    const read = async (): Promise<Record<string, number>> =>
      Object.fromEntries(((await session.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] }).metrics.map((m) => [m.name, m.value]));
    const before = await read();
    await session.send('HeapProfiler.collectGarbage');
    const after = await read();
    const mb = (n: number | undefined): string => `${((n ?? 0) / 1048576).toFixed(1)}`;
    heap = `used ${mb(before.JSHeapUsedSize)} MB (${mb(after.JSHeapUsedSize)} after GC), total ${mb(before.JSHeapTotalSize)} MB`;
  }
  await context.close();
  return { probe, heap };
}

async function boot(engine: string, runs: number): Promise<void> {
  const type = typeOf(engine);
  console.log(`== boot, ${engine} ${type.name()}, production build, headless, ${process.platform}, ${runs} runs each`);
  const seeded = await seed(type);
  const cold: Probe[] = [];
  const warm: Probe[] = [];
  const heaps: string[] = [];
  for (let i = 0; i < runs; i += 1) {
    const dir = mkdtempSync(join(tmpdir(), 'orn-cold-'));
    cpSync(seeded, dir, { recursive: true });
    stripCaches(dir);
    const first = await bootOnce(type, dir);
    cold.push(first.probe);
    console.log(`cold ${i + 1}: overview ${ms(first.probe.overview)} ms, ready ${ms(first.probe.ready)}, replica sent ${ms(first.probe.replicaSent)} answered ${ms(first.probe.replicaAnswered)}, commits ${first.probe.commits}, long tasks ${first.probe.longTasks.length}`);
    for (const t of first.probe.longTasks) console.log(`   cold ${i + 1} long task at ${t.start.toFixed(0)} ms, ${t.duration.toFixed(0)} ms`);
    if (first.heap !== null) heaps.push(`cold ${first.heap}`);
    const second = await bootOnce(type, dir);
    warm.push(second.probe);
    console.log(`warm ${i + 1}: overview ${ms(second.probe.overview)} ms, ready ${ms(second.probe.ready)}, replica sent ${ms(second.probe.replicaSent)} answered ${ms(second.probe.replicaAnswered)}, commits ${second.probe.commits}, long tasks ${second.probe.longTasks.length}`);
    for (const t of second.probe.longTasks) console.log(`   warm ${i + 1} long task at ${t.start.toFixed(0)} ms, ${t.duration.toFixed(0)} ms`);
    if (second.heap !== null) heaps.push(`warm ${second.heap}`);
    rmSync(dir, { recursive: true, force: true });
  }
  const col = (set: Probe[], f: (p: Probe) => number | null): number[] => set.map(f).filter((v): v is number => v !== null);
  for (const [label, set] of [['cold', cold], ['warm', warm]] as const) {
    console.log(`SUMMARY ${engine} ${label}: overview drawn ${stat(col(set, (p) => p.overview))}`);
    console.log(`SUMMARY ${engine} ${label}: status ready ${stat(col(set, (p) => p.ready))}`);
    console.log(`SUMMARY ${engine} ${label}: loadReplica answered ${stat(col(set, (p) => p.replicaAnswered))}; sent ${stat(col(set, (p) => p.replicaSent))}`);
    console.log(`SUMMARY ${engine} ${label}: long tasks per boot ${set.map((p) => p.longTasks.length).join(',')}; React commits ${set.map((p) => p.commits).join(',')}`);
  }
  for (const h of heaps) console.log(`heap ${h}`);
  rmSync(seeded, { recursive: true, force: true });
}

/** In-page rAF recorder: the intervals between animation frames while a gesture runs. */
const FRAMES = `(() => { const f = (window.__frames = { t: [], on: true }); const tick = (now) => { if (f.on) { f.t.push(now); requestAnimationFrame(tick); } }; requestAnimationFrame(tick); })()`;

async function frames(page: Page): Promise<{ n: number; seconds: number; fps: number; p99: number; max: number; over20: number; over34: number }> {
  const t = (await page.evaluate('(() => { window.__frames.on = false; return window.__frames.t; })()')) as number[];
  const gaps = t.slice(1).map((v, i) => v - (t[i] as number));
  const sorted = [...gaps].sort((a, b) => a - b);
  const seconds = ((t[t.length - 1] as number) - (t[0] as number)) / 1000;
  return {
    n: t.length,
    seconds,
    fps: (t.length - 1) / seconds,
    p99: sorted[Math.ceil(0.99 * sorted.length) - 1] as number,
    max: sorted[sorted.length - 1] as number,
    over20: gaps.filter((g) => g > 20).length,
    over34: gaps.filter((g) => g > 34).length,
  };
}

async function gesture(): Promise<void> {
  const browser = await chromium.launch();
  console.log(`== gestures, Chromium ${browser.version()}, production build, headless, ${process.platform}, design dense (anchored), 1280x800`);
  const context = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1280, height: 800 } });
  await context.addInitScript({ content: PROBE });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByText('Starting up', { exact: true }).waitFor({ state: 'detached', ...LONG });
  const file = generatedFileWithAnchors((process.env.ORN_TIER ?? 'design') as 'design', 'dense');
  await chooseFile(page, file);
  await expectPreview(page, 300_000);
  await importDialog(page).getByRole('button', { name: 'Confirm' }).click();
  await page.getByText(/^Imported \d+ records from /).waitFor(LONG);
  await page.locator('svg [data-node-id]').first().waitFor(LONG);
  await page.waitForTimeout(5_000);
  const drawing = page.locator('svg[data-lod]').first();
  const box = (await drawing.boundingBox()) as { x: number; y: number; width: number; height: number };
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const nodes = await page.locator('svg [data-node-id]').count();
  const edges = await page.locator('svg [data-edge-id]').count();
  console.log(`overview: ${nodes} node elements, ${edges} edge elements, data-lod ${await drawing.getAttribute('data-lod')}`);
  // positive control: the counter must see a commit when something real changes (selecting a hub)
  const c0 = (await page.evaluate('window.__probe.commits')) as number;
  const inside = (await page.evaluate(`(() => {
    const d = document.querySelector('svg[data-lod]').getBoundingClientRect();
    return [...document.querySelectorAll('svg [data-node-id]')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.left > d.left + 5 && r.right < d.right - 5 && r.top > d.top + 5 && r.bottom < d.bottom - 5; })
      .map((e) => e.getAttribute('data-node-id'));
  })()`)) as string[];
  console.log(`${inside.length} hubs fully inside the drawing`);
  await page.locator(`svg [data-node-id="${inside[0]}"]`).click();
  await page.waitForTimeout(600);
  const c1 = (await page.evaluate('window.__probe.commits')) as number;
  console.log(`control: a click on a hub makes ${c1 - c0} React commit(s) (the counter works if > 0)`);
  await page.mouse.click(box.x + 6, box.y + box.height - 6);
  await page.waitForTimeout(600);

  const run = async (label: string, body: () => Promise<void>): Promise<void> => {
    await page.waitForTimeout(500);
    const commits = (await page.evaluate('window.__probe.commits')) as number;
    const longs = ((await page.evaluate('window.__probe.longTasks.length')) as number);
    const lodBefore = await drawing.getAttribute('data-lod');
    await page.evaluate(FRAMES);
    const g0 = (await page.evaluate('performance.now()')) as number;
    await body();
    const g1 = (await page.evaluate('performance.now()')) as number;
    await page.waitForTimeout(1500);
    const f = await frames(page);
    const commits2 = (await page.evaluate('window.__probe.commits')) as number;
    const ct = (await page.evaluate('window.__probe.ct')) as number[];
    console.log(`${label}: commits during the gesture ${ct.filter((x) => x >= g0 && x <= g1).length}, in the 1.5 s after it ${ct.filter((x) => x > g1).length} (${ct.filter((x) => x > g1).map((x) => (x - g1).toFixed(0)).join(', ')} ms after the end)`);
    const tasks = (await page.evaluate('window.__probe.longTasks')) as { start: number; duration: number }[];
    const mine = tasks.slice(longs);
    console.log(`${label}: ${f.fps.toFixed(1)} fps over ${f.seconds.toFixed(1)} s (${f.n} frames), frame gap p99 ${f.p99.toFixed(1)} ms, max ${f.max.toFixed(1)} ms, gaps >20 ms: ${f.over20}, >34 ms: ${f.over34}`);
    console.log(`${label}: React commits ${commits2 - commits}; long tasks over 50 ms ${mine.length}${mine.length ? ` (${mine.map((t) => t.duration.toFixed(0)).join(', ')} ms)` : ''}; data-lod ${lodBefore} -> ${await drawing.getAttribute('data-lod')}`);
    await page.waitForTimeout(500);
  };

  await run('pan 10 s (mouse drag on empty canvas, circle r=150 px)', async () => {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    const began = Date.now();
    let i = 0;
    while (Date.now() - began < GESTURE_MS) {
      i += 1;
      const a = i / 20;
      await page.mouse.move(cx + 150 * Math.cos(a) - 150, cy + 150 * Math.sin(a));
    }
    await page.mouse.up();
    console.log(`  (${i} pointer moves sent)`);
  });
  await page.getByRole('button', { name: 'Fit' }).click({ timeout: 3000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  await run('wheel zoom 10 s inside one LOD band (alternating in / out, small steps)', async () => {
    await page.mouse.move(cx, cy);
    const began = Date.now();
    let i = 0;
    while (Date.now() - began < GESTURE_MS) {
      i += 1;
      await page.mouse.wheel(0, Math.floor(i / 6) % 2 === 0 ? -6 : 6);
      await page.waitForTimeout(10);
    }
    console.log(`  (${i} wheel events sent)`);
  });
  await page.getByRole('button', { name: 'Fit' }).click({ timeout: 3000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  await run('wheel zoom 10 s across LOD bands (in to the maximum, out to the minimum, repeated)', async () => {
    await page.mouse.move(cx, cy);
    const began = Date.now();
    let i = 0;
    while (Date.now() - began < GESTURE_MS) {
      i += 1;
      await page.mouse.wheel(0, Math.floor(i / 40) % 2 === 0 ? -40 : 40);
      await page.waitForTimeout(10);
    }
    console.log(`  (${i} wheel events sent)`);
  });
  await browser.close();
}

const [mode, engine = 'chromium', runs = '5'] = process.argv.slice(2);
void (mode === 'gesture' ? gesture() : mode === 'boot' ? boot(engine, Number(runs)) : Promise.reject(new Error('usage: gesture | boot <engine> [runs]'))).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
