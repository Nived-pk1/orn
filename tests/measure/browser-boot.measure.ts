/**
 * Step 5.1d, item j (informal; run once, alone; REPORTED, nothing decided): the browser numbers of Phase 5's boot, in Chromium
 * against the PRODUCTION build served by `vite preview` on port 4173 (start it first: `npx vite build && npx vite preview --port 4173`).
 * Run: `npx tsx tests/measure/browser-boot.measure.ts`. It prints plain lines:
 *   - the warm-up `loadMs` of the chem and the layout worker (a probe page posts `warmUp` straight to the worker: cold HTTP cache,
 *     then warm), and the `loadMs` the app's own chem worker answered during an import;
 *   - cold boot to the first status and to ready, for an empty store, the demo and a design-tier file, each after a reload;
 *   - every long task over 50 ms during that boot (the Long Tasks API sees the main thread only);
 *   - the page heap after boot by CDP `Performance.getMetrics` (the heaps of the workers are not in it).
 */
import { readdirSync } from 'node:fs';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { chooseFile, generatedFile } from '../e2e/kit';

const ORIGIN = 'http://127.0.0.1:4173';
const SETTLE_MS = 3_000;
const LONG = { timeout: 300_000 } as const;

interface Probe {
  firstStatus: number | null;
  ready: number | null;
  dataset: number | null;
  longTasks: { start: number; duration: number }[];
  warmUps: { worker: string; loadMs: number; at: number }[];
}

/** Collects, from inside the page, what only the page can see (installed before it navigates). */
function install(): void {
  const probe: Probe = { firstStatus: null, ready: null, dataset: null, longTasks: [], warmUps: [] };
  (window as unknown as { __probe: Probe }).__probe = probe;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) probe.longTasks.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    /* the Long Tasks API is missing */
  }
  const Original = window.Worker;
  window.Worker = class extends Original {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);
      const name = String(url).replace(/^.*\/(worker-[a-z]+)-.*$/, '$1');
      this.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as { type?: string; ok?: boolean; result?: { ok?: boolean; loadMs?: number } } | null;
        if (data?.type === 'response' && data.ok === true && data.result?.ok === true && typeof data.result.loadMs === 'number') {
          probe.warmUps.push({ worker: name, loadMs: data.result.loadMs, at: performance.now() });
        }
      });
    }
  } as typeof Worker;
  const look = (): void => {
    const status = document.querySelector('[aria-label="Status"]');
    if (status !== null && probe.firstStatus === null) probe.firstStatus = performance.now();
    if (status !== null && probe.ready === null && !(status.textContent ?? '').includes('Starting up')) probe.ready = performance.now();
    if (document.querySelector('[aria-label="Dataset"]') !== null && probe.dataset === null) probe.dataset = performance.now();
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true });
  look();
}

const fixed = (value: number | null): string => (value === null ? 'never' : `${value.toFixed(0)} ms`);

async function heap(page: Page): Promise<string> {
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const read = async (): Promise<Record<string, number>> =>
    Object.fromEntries(((await session.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] }).metrics.map((m) => [m.name, m.value]));
  const before = await read();
  await session.send('HeapProfiler.enable');
  await session.send('HeapProfiler.collectGarbage');
  const after = await read();
  const mb = (n: number | undefined): string => `${((n ?? 0) / 1048576).toFixed(1)} MB`;
  return `JSHeapUsedSize ${mb(before.JSHeapUsedSize)} (${mb(after.JSHeapUsedSize)} after a forced GC), JSHeapTotalSize ${mb(before.JSHeapTotalSize)}`;
}

async function report(label: string, page: Page): Promise<void> {
  await page.waitForTimeout(SETTLE_MS);
  const probe = await page.evaluate(() => (window as unknown as { __probe: Probe }).__probe);
  console.log(`${label}: first status ${fixed(probe.firstStatus)}, ready ${fixed(probe.ready)}, data shown ${fixed(probe.dataset)} (from navigation start)`);
  const tasks = probe.longTasks;
  console.log(`${label}: long tasks over 50 ms: ${tasks.length}${tasks.length === 0 ? '' : `, total ${tasks.reduce((sum, t) => sum + t.duration, 0).toFixed(0)} ms`}`);
  for (const t of tasks) console.log(`${label}:   at ${t.start.toFixed(0)} ms, ${t.duration.toFixed(0)} ms`);
  for (const w of probe.warmUps) console.log(`${label}: ${w.worker} warmUp loadMs ${w.loadMs.toFixed(1)} (answered at ${w.at.toFixed(0)} ms)`);
  console.log(`${label}: ${await heap(page)}`);
}

async function boot(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  // tsx (esbuild keepNames) wraps functions in a __name() helper that does not exist in the page.
  await page.addInitScript(() => {
    (globalThis as unknown as { __name: <T>(f: T) => T }).__name = (f) => f;
  });
  await page.addInitScript(install);
  await page.goto('/');
  await page.getByRole('region', { name: 'Status' }).waitFor(LONG);
  await page.getByText('Starting up', { exact: true }).waitFor({ state: 'detached', ...LONG });
  return page;
}

async function warmUpProbe(context: BrowserContext, worker: string, url: string): Promise<string> {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}${url}`);
  const answer = await page.evaluate(
    (workerUrl) =>
      new Promise<{ loadMs: number; wall: number } | string>((resolve) => {
        const began = performance.now();
        const w = new Worker(workerUrl, { type: 'module' });
        w.onerror = (event) => resolve(`worker error: ${event.message}`);
        w.onmessage = (event: MessageEvent) => {
          const data = event.data as { type?: string; ok?: boolean; result?: { ok?: boolean; loadMs?: number; message?: string } };
          if (data.type !== 'response') return;
          resolve(data.ok === true && data.result?.ok === true ? { loadMs: data.result.loadMs ?? -1, wall: performance.now() - began } : `refused: ${JSON.stringify(data)}`);
          w.terminate();
        };
        w.postMessage({ type: 'request', id: 1, method: 'warmUp', params: {} });
      }),
    url,
  );
  await page.close();
  return typeof answer === 'string' ? `${worker}: ${answer}` : `${worker}: loadMs ${answer.loadMs.toFixed(1)}, request to answer ${answer.wall.toFixed(0)} ms (including the thread start)`;
}

async function main(): Promise<void> {
  const assets = readdirSync('dist/assets');
  const find = (prefix: string): string => `/assets/${assets.find((name) => name.startsWith(prefix) && name.endsWith('.js')) as string}`;
  const browser = await chromium.launch();
  const base = { baseURL: ORIGIN };
  console.log(`Chromium ${browser.version()}, production build, headless, ${process.platform}`);

  const probes = await browser.newContext(base);
  for (const pass of ['cold HTTP cache', 'warm HTTP cache']) {
    for (const worker of ['worker-chem', 'worker-layout']) console.log(`probe, ${pass}: ${await warmUpProbe(probes, worker, find(worker))}`);
  }
  await probes.close();

  const empty = await browser.newContext(base);
  await report('empty store, first load', await boot(empty));
  await empty.close();

  const demo = await browser.newContext(base);
  const demoPage = await boot(demo);
  const began = Date.now();
  await demoPage.getByRole('button', { name: 'Load demo dataset' }).click();
  await demoPage.getByText(/^Imported \d+ records from demo\.orn\.json\./).waitFor(LONG);
  console.log(`demo: import took ${Date.now() - began} ms (click to "Imported")`);
  await report('demo, during the import', demoPage);
  await demoPage.close();
  await report('demo, after a reload (new page)', await boot(demo));
  await demo.close();

  const design = await browser.newContext(base);
  const designPage = await boot(design);
  const file = generatedFile('design', 'dense');
  console.log(`design file: ${(file.buffer.length / 1048576).toFixed(1)} MB`);
  const t0 = Date.now();
  await chooseFile(designPage, file);
  await designPage.getByRole('heading', { name: 'Import summary' }).waitFor({ timeout: 300_000 });
  const t1 = Date.now();
  await designPage.getByRole('button', { name: 'Confirm' }).click();
  await designPage.getByText(/^Imported \d+ records from /).waitFor({ timeout: 300_000 });
  console.log(`design: preview ${t1 - t0} ms, apply ${Date.now() - t1} ms (file chosen to summary, Confirm to "Imported")`);
  await report('design, during the import', designPage);
  await designPage.close();
  await report('design, after a reload (new page)', await boot(design));
  await design.close();
  await browser.close();
}

void main();
