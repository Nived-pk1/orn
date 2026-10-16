/**
 * Phone mode, part 1 (informal; run once, alone; REPORTED, nothing asserted): how long a phone takes to load the LIVE preview.
 * Chromium (Pixel 7 profile, touch) with CDP: CPU slowdown 4x on the page (the workers' CPU is NOT slowed unless ORN_WORKER_CPU=1), network 1.6 Mbps down / 750 kbps up /
 * 150 ms latency on the page and on every worker (each CDP session has its own bucket, so the page and the workers are each
 * limited to that speed, not together). Per run a NEW browser profile (cache and storage empty):
 *   visit 1 (cold):  (a) navigation to "Get started" visible; (b) "Load demo dataset" to the first view drawn;
 *                    (c) the Alcohols family page (also reported: page shown), then the group "Aldehydes" opened and its "Ethanol → ethanal (PCC)" card scrolled to, to the first structure drawn.
 *   visit 2 (warm):  the HTTP cache is kept, IndexedDB is cleared (so the first-run screen shows again), same (a)-(c).
 * Times are milliseconds since the navigation start (page clock); resource times are aligned to it through wall-clock time.
 * Long tasks are the MAIN THREAD's (the browser reports none for workers). (c) is tried first as a visitor would (as soon as the map is
 * drawn); if no structure is drawn within the cap (ORN_CAP ms, default 60 000) the run waits for the RDKit wasm, goes back to the map and opens the
 * page again (c'). Debug switches: ORN_ONLY=net|cpu|none (which throttle), ORN_SHOT=<png> (screenshot, counts and resource list when a wait fails),
 * ORN_WAIT=<ms>, ORN_NO_WORKERS=1 (do not attach to workers), ORN_WORKER_CPU=1 (throttle workers' CPU too). Run: `npx tsx tests/measure/phone-load.measure.ts [runs] [url] [out.json]`.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, devices, type BrowserContext, type Page } from '@playwright/test';

const { defaultBrowserType: _ignored, ...PIXEL } = devices['Pixel 7'];
const PORT = 9333;
const NETWORK = { offline: false, latency: 150, downloadThroughput: (1.6 * 1_000_000) / 8, uploadThroughput: (750 * 1000) / 8 };
const CPU_RATE = 4;

type Params = Record<string, unknown>;
type Handler = (sessionId: string | undefined, method: string, params: Params) => void;

/** A minimal DevTools protocol client over the browser's WebSocket (Node's global WebSocket; no dependency). */
class Cdp {
  private readonly pending = new Map<number, { ok: (v: Params) => void; fail: (e: Error) => void }>();
  private next = 1;
  public onEvent: Handler = () => undefined;
  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener('message', (message) => {
      const data = JSON.parse(String(message.data)) as { id?: number; result?: Params; error?: { message: string }; method?: string; params?: Params; sessionId?: string };
      if (data.id !== undefined) {
        const waiting = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error !== undefined) waiting?.fail(new Error(data.error.message));
        else waiting?.ok(data.result ?? {});
      } else if (data.method !== undefined) this.onEvent(data.sessionId, data.method, data.params ?? {});
    });
  }
  static async connect(): Promise<Cdp> {
    const info = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()) as { webSocketDebuggerUrl: string };
    const ws = new WebSocket(info.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('cdp connect failed')));
    });
    return new Cdp(ws);
  }
  send(method: string, params: Params = {}, sessionId?: string): Promise<Params> {
    const id = this.next++;
    return new Promise((ok, fail) => {
      this.pending.set(id, { ok, fail });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId === undefined ? {} : { sessionId }) }));
    });
  }
  close(): void {
    this.ws.close();
  }
}

interface Resource {
  readonly url: string;
  readonly where: string;
  readonly type: string;
  startEpoch: number;
  endEpoch: number;
  status: number;
  transfer: number;
  decoded: number;
  encoding: string;
  cache: string;
}
interface Attach { readonly epoch: number; readonly kind: string; readonly url: string }

class Recorder {
  readonly resources = new Map<string, Resource>();
  readonly attaches: Attach[] = [];
  private readonly kinds = new Map<string, string>();
  constructor(private readonly cdp: Cdp) {
    cdp.onEvent = (sessionId, method, p) => this.event(sessionId, method, p);
  }

  async attach(sessionId: string, kind: string, url: string): Promise<void> {
    this.kinds.set(sessionId, kind);
    this.attaches.push({ epoch: Date.now(), kind, url });
    const send = (m: string, params: Params = {}): Promise<unknown> => this.cdp.send(m, params, sessionId).catch(() => undefined);
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: false });
    if ([undefined, 'net'].includes(process.env.ORN_ONLY)) await send('Network.emulateNetworkConditions', NETWORK);
    if ([undefined, 'cpu'].includes(process.env.ORN_ONLY) && (kind === 'page' || process.env.ORN_WORKER_CPU !== undefined)) await send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE });
    if (process.env.ORN_NO_WORKERS === undefined) await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    await send('Runtime.runIfWaitingForDebugger');
  }

  private event(sessionId: string | undefined, method: string, p: Params): void {
    if (method === 'Target.attachedToTarget') {
      const info = p.targetInfo as { type: string; url: string };
      void this.attach(p.sessionId as string, info.type, info.url);
      return;
    }
    if (sessionId === undefined) return;
    const key = (id: unknown): string => `${sessionId}:${String(id)}`;
    const get = (id: unknown): Resource | undefined => this.resources.get(key(id));
    if (method === 'Network.requestWillBeSent') {
      const request = p.request as { url: string };
      if (request.url.startsWith('data:') || request.url.startsWith('blob:')) return;
      const redirect = get(p.requestId);
      if (redirect !== undefined) this.resources.set(`${key(p.requestId)}#${redirect.startEpoch}`, redirect);
      this.resources.set(key(p.requestId), {
        url: request.url, where: this.kinds.get(sessionId) ?? '?', type: String(p.type ?? ''), startEpoch: (p.wallTime as number) * 1000,
        endEpoch: NaN, status: 0, transfer: 0, decoded: 0, encoding: '', cache: 'network',
      });
    } else if (method === 'Network.responseReceived') {
      const r = get(p.requestId);
      const response = p.response as { status: number; headers: Record<string, string>; fromDiskCache?: boolean; encodedDataLength: number };
      if (r === undefined) return;
      const lower = Object.fromEntries(Object.entries(response.headers).map(([k, v]) => [k.toLowerCase(), v]));
      r.status = response.status;
      r.encoding = lower['content-encoding'] ?? '';
      r.cache = response.fromDiskCache === true ? 'disk cache' : `network${lower['cf-cache-status'] === undefined ? '' : ` (cf ${lower['cf-cache-status']})`}`;
    } else if (method === 'Network.dataReceived') {
      const r = get(p.requestId);
      if (r !== undefined) r.decoded += p.dataLength as number;
    } else if (method === 'Network.loadingFinished') {
      const r = get(p.requestId);
      if (r === undefined) return;
      r.transfer = p.encodedDataLength as number;
      r.endEpoch = Date.now();
    }
  }
}

interface Marks { a?: number; b0?: number; b?: number; c0?: number; p?: number; chem?: number; c?: number; origin: number; longTasks: { start: number; duration: number }[] }

/** In the page: the clock of every milestone, so the harness's own polling does not add to a time. */
const INIT = `(() => {
  const ms = { longTasks: [] };
  window.__ms = ms;
  try { new PerformanceObserver((list) => { for (const e of list.getEntries()) ms.longTasks.push({ start: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch {}
  const check = () => {
    const now = performance.now();
    if (ms.a === undefined && [...document.querySelectorAll('h2')].some((h) => h.textContent === 'Get started')) ms.a = now;
    if (ms.chem === undefined && (document.querySelector('footer')?.textContent ?? '').includes('chem ok')) ms.chem = now;
    const svg = document.querySelector('svg[role="group"]');
    // the first view: the map's drawing (desktop, the Map tab) or, on a phone, the Families tab's cards
    if (ms.b0 !== undefined && ms.b === undefined && ((svg && svg.getAttribute('data-lod') !== '0' && svg.querySelector('[data-node-id]')) || document.querySelector('[data-view="families"] [data-family-id]'))) ms.b = now;
    if (ms.c0 !== undefined && ms.p === undefined && document.querySelector('[aria-label="Family page: Alcohols"]')) ms.p = now;
    if (ms.c0 !== undefined && ms.c === undefined && [...document.querySelectorAll('img[alt^="Structure of"]')].some((i) => i.naturalWidth > 0)) ms.c = now;
  };
  new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true });
  document.addEventListener('load', check, true);
  setInterval(check, 25);
})();`;

interface Visit { chem: number; a: number; b: number; p: number; c: number; c2: number; marks: Marks; resources: Resource[]; attaches: Attach[] }

async function until(page: Page, field: 'a' | 'b' | 'c'): Promise<void> {
  await page.waitForFunction((f) => (window as unknown as { __ms: Record<string, number | undefined> }).__ms[f] !== undefined, field, { timeout: Number(process.env.ORN_WAIT ?? 240_000), polling: 100 }).catch(async (error: unknown) => {
    if (process.env.ORN_SHOT !== undefined) {
      await page.screenshot({ path: process.env.ORN_SHOT });
      console.log(await page.evaluate(() => `figs ${document.querySelectorAll("figure[data-substance-id]").length}, drawing ${(document.body.textContent ?? "").split("Drawing the structure").length - 1}, imgs ${document.querySelectorAll("img").length}, structure imgs ${document.querySelectorAll('img[alt^="Structure of"]').length}, loaded ${[...document.querySelectorAll('img')].filter((i) => i.naturalWidth > 0).length}; status: ${document.querySelector('footer')?.textContent ?? ''}`));
    }
    throw error;
  });
}
const CAP = Number(process.env.ORN_CAP ?? 60_000);

/** The Families tab's card of Alcohols exists (the phone layout, from phone mode A on): one tap opens the page; else the map's hub is double tapped. */
const alcoholsCard = (page: Page) => page.locator('button[data-family-id="cls_alcohols"]');

/** Opens the Alcohols page by a tap on its Families card (phone) or a double tap on the map hub (before phone mode), opens the Aldehydes group and scrolls to the first card with a real structure; true when a structure is drawn within the cap. */
async function openFamily(page: Page, cap: number, again = false): Promise<boolean> {
  const cards = (await alcoholsCard(page).count()) > 0;
  const centre = cards ? undefined : await settledCentre(page);
  if (!again) await mark(page, 'c0');
  if (centre === undefined) await alcoholsCard(page).tap();
  else await page.mouse.dblclick(centre.x, centre.y);
  await page.getByRole('region', { name: 'Family page: Alcohols' }).waitFor();
  await page.getByRole('button', { name: /^Aldehydes\s*3\s*reactions$/ }).tap(); // the reactions of a group (and their structures) show once a group is opened
  await page.getByRole('heading', { level: 4, name: 'Ethanol → ethanal (PCC)' }).scrollIntoViewIfNeeded(); // the first card with a real structure
  return page.waitForFunction(() => (window as unknown as { __ms: { c?: number } }).__ms.c !== undefined, null, { timeout: cap, polling: 100 }).then(() => true, () => false);
}

const mark = (page: Page, field: 'b0' | 'c0'): Promise<void> =>
  page.evaluate((f) => { (window as unknown as { __ms: Record<string, number> }).__ms[f] = performance.now(); }, field);

/** The middle of the Alcohols hub once it has stopped moving (two equal reads). */
async function settledCentre(page: Page): Promise<{ x: number; y: number }> {
  let previous = '';
  for (let i = 0; i < 80; i += 1) {
    const box = await page.locator('svg [data-node-id="cls_alcohols"]').boundingBox();
    if (box !== null) {
      const now = `${Math.round(box.x)},${Math.round(box.y)}`;
      if (now === previous) return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      previous = now;
    }
    await page.waitForTimeout(250);
  }
  throw new Error('Alcohols keeps moving');
}

async function visit(context: BrowserContext, cdp: Cdp, url: string): Promise<Visit> {
  const before = new Set(((await cdp.send('Target.getTargets')).targetInfos as { targetId: string }[]).map((t) => t.targetId));
  const page = await context.newPage();
  const recorder = new Recorder(cdp);
  const targets = (await cdp.send('Target.getTargets')).targetInfos as { targetId: string; type: string; url: string }[];
  const mine = targets.find((t) => t.type === 'page' && !before.has(t.targetId));
  if (mine === undefined) throw new Error('page target not found');
  const { sessionId } = (await cdp.send('Target.attachToTarget', { targetId: mine.targetId, flatten: true })) as { sessionId: string };
  await recorder.attach(sessionId, 'page', 'about:blank');
  await page.addInitScript(INIT);
  await page.goto(url, { waitUntil: 'commit' });
  await until(page, 'a');
  await page.getByRole('button', { name: 'Load demo dataset' }).waitFor();
  await mark(page, 'b0');
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await until(page, 'b');
  // first try: as soon as the map is drawn, as a visitor would (no waiting for the chemistry engine)
  const clock = (): Promise<{ c?: number; c0?: number; p?: number }> => page.evaluate(() => (window as unknown as { __ms: { c?: number; c0?: number; p?: number } }).__ms);
  const first = (await openFamily(page, CAP)) ? await clock() : undefined;
  let second: { c?: number; c0?: number } | undefined;
  if (first === undefined) {
    // the structures did not come: wait until the RDKit wasm is loaded, go back to the map and open the page again
    for (let i = 0; i < 1200 && ![...recorder.resources.values()].some((r) => r.url.endsWith('.wasm') && !Number.isNaN(r.endEpoch)); i += 1) await page.waitForTimeout(100);
    const home = page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Families' });
    if ((await home.count()) > 0) await home.tap();
    else await page.getByRole('button', { name: 'Overview' }).tap();
    await page.evaluate(() => { const ms = (window as unknown as { __ms: Record<string, number | undefined> }).__ms; delete ms.p; delete ms.c; ms.c0 = performance.now(); });
    second = (await openFamily(page, CAP, true)) ? await clock() : undefined;
  }
  const marks = (await page.evaluate(() => ({ ...(window as unknown as { __ms: object }).__ms, origin: performance.timeOrigin }))) as Marks;
  const resources = [...recorder.resources.values()].map((r) => ({ ...r, startEpoch: r.startEpoch - marks.origin, endEpoch: r.endEpoch - marks.origin }));
  const attaches = recorder.attaches.map((x) => ({ ...x, epoch: x.epoch - marks.origin }));
  await page.close();
  // a phone shows no status line, so "chem ok" is not on the page: the end of the RDKit wasm download stands in for it (engine ready is a moment later)
  const wasm = resources.find((r) => r.url.endsWith('.wasm') && !Number.isNaN(r.endEpoch));
  return { chem: marks.chem ?? wasm?.endEpoch ?? NaN, a: marks.a ?? NaN, p: first === undefined ? NaN : (first.p ?? NaN) - (first.c0 ?? 0), b: (marks.b ?? NaN) - (marks.b0 ?? 0), c: first === undefined ? NaN : (first.c ?? NaN) - (first.c0 ?? 0), c2: second === undefined ? NaN : (second.c ?? NaN) - (second.c0 ?? 0), marks, resources, attaches };
}

/** Empties IndexedDB of the origin and keeps the HTTP cache (a plain text page of the same origin does the deleting). */
async function clearStorage(context: BrowserContext, url: string): Promise<void> {
  const page = await context.newPage();
  await page.goto(`${url}/robots.txt`);
  const left = await page.evaluate(async () => {
    for (const db of await indexedDB.databases()) {
      await new Promise<void>((done) => {
        const request = indexedDB.deleteDatabase(db.name ?? '');
        request.onsuccess = () => done();
        request.onerror = () => done();
        request.onblocked = () => done();
      });
    }
    return (await indexedDB.databases()).length;
  });
  if (left !== 0) throw new Error(`${left} databases left`);
  await page.close();
}

const median = (xs: number[]): number => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)] ?? NaN;
const fmt = (xs: number[]): string => `${Math.round(median(xs))} (min ${Math.round(Math.min(...xs))}, max ${Math.round(Math.max(...xs))})`;

async function main(): Promise<void> {
  const runs = Number(process.argv[2] ?? '5');
  const url = (process.argv[3] ?? 'https://reaction-navigator.organic-reaction-navigator.workers.dev').replace(/\/+$/, '');
  const out = process.argv[4];
  const cold: Visit[] = [];
  const warm: Visit[] = [];
  for (let run = 1; run <= runs; run += 1) {
    const profile = mkdtempSync(join(tmpdir(), 'orn-load-'));
    const context = await chromium.launchPersistentContext(profile, { ...PIXEL, args: [`--remote-debugging-port=${PORT}`] });
    const cdp = await Cdp.connect();
    try {
      cold.push(await visit(context, cdp, `${url}/`));
      await clearStorage(context, url);
      warm.push(await visit(context, cdp, `${url}/`));
    } finally {
      cdp.close();
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    }
    console.log(`run ${run}: cold a ${Math.round(cold[run - 1]?.a ?? NaN)} b ${Math.round(cold[run - 1]?.b ?? NaN)} c ${Math.round(cold[run - 1]?.c ?? NaN)} | warm a ${Math.round(warm[run - 1]?.a ?? NaN)} b ${Math.round(warm[run - 1]?.b ?? NaN)} c ${Math.round(warm[run - 1]?.c ?? NaN)}`);
  }
  for (const [label, visits] of [['cold (a)-(c)', cold], ['warm (d)', warm]] as const) {
    console.log(`\n${label}, median over ${runs} runs (ms; min, max)`);
    console.log(`  (a) navigation -> Get started: ${fmt(visits.map((v) => v.a))}`);
    console.log(`  (b) Load demo -> first view:   ${fmt(visits.map((v) => v.b))}`);
    console.log(`  chem engine ready (ms since navigation): ${fmt(visits.map((v) => v.chem))}`);
    console.log(`  (c1) double tap -> family page: ${fmt(visits.map((v) => v.p))}`);
    const ok = visits.filter((v) => !Number.isNaN(v.c)).map((v) => v.c);
    console.log(`  (c) double tap -> structure:   ${ok.length === 0 ? 'never within the cap' : fmt(ok)}; drawn within ${CAP / 1000} s in ${ok.length} of ${visits.length} runs`);
    const again = visits.filter((v) => !Number.isNaN(v.c2)).map((v) => v.c2);
    if (again.length > 0) console.log(`  (c') reopened after the wasm was loaded -> structure: ${fmt(again)} (${again.length} runs)`);
  }
  if (out !== undefined) writeFileSync(out, JSON.stringify({ url, runs, cold, warm }, null, 1));
}

void main();
