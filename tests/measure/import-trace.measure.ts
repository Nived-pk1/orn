/**
 * Step 5.9a, item j (informal; run once, alone; REPORTED, nothing decided; a Gate E watch item): a Chromium performance trace of a
 * design-tier import through the import screen, preview and then apply, against the PRODUCTION build served by `vite preview` on
 * port 4173 (start it first: `npx vite build && npx vite preview --port 4173`).
 * Run: `npx tsx tests/measure/import-trace.measure.ts`. It prints plain lines: for each phase (reading the file and showing the
 * preview; applying) the tasks over 50 ms on the renderer's MAIN thread, with the largest pieces inside each (event, function, file).
 * The trace is Chromium's own (`devtools.timeline`); worker threads are not main-thread tasks and are not counted.
 */
import { chromium } from '@playwright/test';
import { chooseFile, expectPreview, generatedFile, importDialog, openApp } from '../e2e/kit';

const ORIGIN = 'http://127.0.0.1:4173';
const LONG_MS = 50;

interface TraceEvent {
  readonly name: string;
  readonly ph: string;
  readonly ts: number;
  readonly dur?: number;
  readonly pid: number;
  readonly tid: number;
  readonly cat?: string;
  readonly args?: { readonly name?: string; readonly data?: { readonly functionName?: string; readonly url?: string; readonly type?: string } };
}

const PIECES = new Set(['FunctionCall', 'EvaluateScript', 'v8.run', 'v8.compile', 'EventDispatch', 'TimerFire', 'FireAnimationFrame', 'Layout', 'UpdateLayoutTree', 'Paint', 'PrePaint', 'Layerize', 'Commit', 'HitTest', 'MajorGC', 'MinorGC', 'V8.GC_MC_BACKGROUND_MARKING', 'RunMicrotasks', 'ParseHTML', 'XHRReadyStateChange', 'ResourceFinish', 'HandlePostMessage', 'MessageEvent']);
const short = (url: string | undefined): string => (url === undefined || url === '' ? '' : url.replace(/^.*\//, ''));

function phaseOf(events: readonly TraceEvent[], from: number, to: number, mainTid: number, mainPid: number, label: string): void {
  const tasks = events.filter((e) => e.ph === 'X' && e.name === 'RunTask' && e.pid === mainPid && e.tid === mainTid && (e.dur ?? 0) > LONG_MS * 1000 && e.ts >= from && e.ts <= to);
  const total = tasks.reduce((sum, t) => sum + (t.dur ?? 0), 0) / 1000;
  console.log(`${label}: main-thread tasks over ${LONG_MS} ms: ${tasks.length}${tasks.length === 0 ? '' : `, total ${total.toFixed(0)} ms`}`);
  for (const task of tasks) {
    const end = task.ts + (task.dur ?? 0);
    const inside = events
      .filter((e) => e.ph === 'X' && e.pid === mainPid && e.tid === mainTid && e !== task && PIECES.has(e.name) && e.ts >= task.ts && e.ts + (e.dur ?? 0) <= end)
      .sort((a, b) => (b.dur ?? 0) - (a.dur ?? 0))
      .slice(0, 3);
    const what = inside.map((e) => `${e.name} ${((e.dur ?? 0) / 1000).toFixed(0)} ms${e.args?.data?.functionName ? ` ${e.args.data.functionName}` : ''}${short(e.args?.data?.url) ? ` (${short(e.args?.data?.url)})` : ''}`);
    console.log(`${label}:   at +${((task.ts - from) / 1000).toFixed(0)} ms, ${((task.dur ?? 0) / 1000).toFixed(0)} ms${what.length === 0 ? ', no listed piece inside' : `: ${what.join('; ')}`}`);
  }
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  console.log(`Chromium ${browser.version()}, production build, headless, ${process.platform}`);
  const context = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    (globalThis as unknown as { __name: <T>(f: T) => T }).__name = (f) => f;
  });
  await openApp(page);
  const file = generatedFile('design', 'dense');
  console.log(`file: ${file.name}, ${(file.buffer.length / 1048576).toFixed(1)} MB`);

  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'v8.execute'] });
  await page.evaluate(() => performance.mark('trace:start'));
  await chooseFile(page, file);
  await expectPreview(page, 300_000);
  await page.evaluate(() => performance.mark('trace:preview-shown'));
  await page.waitForTimeout(500);
  await page.evaluate(() => performance.mark('trace:confirm'));
  await importDialog(page).getByRole('button', { name: 'Confirm' }).click();
  await page.getByText(/^Imported \d+ records from /).waitFor({ timeout: 300_000 });
  await page.evaluate(() => performance.mark('trace:applied'));
  await page.waitForTimeout(1_000);
  const raw = await browser.stopTracing();
  await browser.close();

  const events = (JSON.parse(raw.toString('utf8')) as { traceEvents: TraceEvent[] }).traceEvents;
  const mark = (name: string): number => events.find((e) => e.name === name)?.ts ?? NaN;
  const [start, shown, confirm, applied] = ['trace:start', 'trace:preview-shown', 'trace:confirm', 'trace:applied'].map(mark) as [number, number, number, number];
  const main = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain' && events.some((o) => o.pid === e.pid && o.tid === e.tid && o.name === 'trace:start'));
  const mainEvent = main ?? events.find((e) => e.name === 'trace:start');
  if (mainEvent === undefined || [start, shown, confirm, applied].some(Number.isNaN)) throw new Error('the trace has no marks of this page');
  console.log(`phase times: file chosen to preview shown ${((shown - start) / 1000).toFixed(0)} ms; Confirm to Imported ${((applied - confirm) / 1000).toFixed(0)} ms`);
  phaseOf(events, start, shown, mainEvent.tid, mainEvent.pid, 'preview');
  phaseOf(events, confirm, applied + 1_000_000, mainEvent.tid, mainEvent.pid, 'apply');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
