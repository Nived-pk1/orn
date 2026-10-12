/**
 * The Content-Security-Policy in a real browser, in Chromium, Firefox and WebKit (step 5.10a, part 2; SECURITY §4, ADR-035).
 * 1: the page policy (the <meta> `vite preview` serves): an injected inline script does not run and raises the event; an injected
 * inline event handler does not run; `eval` is refused; the chem worker still starts and parses (a structure appears on a family page).
 * 2: the same build served by a host that sends the policy as a HEADER on every response (tests/e2e/support/header-server.ts):
 *   case A, the same header on every script (the chem worker entry included); case B, the chem worker entry's response alone gets
 *   'unsafe-eval' added. What each engine did is written to the test annotations and to docs/PROGRESS.md.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { loadDemo, openApp, watch } from './kit';
import { startHeaderServer, type HeaderServer } from './support/header-server';

const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const FINDINGS = 'Findings: E 0 / W 2 / I 17 / Review 38';
const CHEM_ENTRY = /^\/assets\/worker-chem-[\w-]+\.js$/;
/** What the deliberate violations of this spec put in the console or the page errors. */
const DELIBERATE = /Content Security Policy|Content-Security-Policy|CSP|unsafe-eval|EvalError|invalid\.invalid|Refused|blocked|violat/i;

/** A structure appears: the PCC card of the Alcohols page draws two images from blob: URLs (made by the chem worker). */
async function structureAppears(page: Page): Promise<Locator> {
  await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
  await expect(page.getByRole('region', { name: 'Family page: Alcohols' })).toBeVisible();
  await page.getByRole('button', { name: /^Aldehydes\s*3\s*reactions$/ }).click();
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name: 'Ethanol → ethanal (PCC)' }) });
  await expect(card).toBeVisible();
  return card.getByRole('img');
}

interface Injected {
  readonly ran: string[];
}

/**
 * Injects what a hostile record would hope to run (the app never renders data this way); nothing may run. `eval` is not asked directly:
 * Playwright's own evaluate is exempt from the page policy in every engine (measured: an eval inside it runs), so the test would prove
 * nothing; the build check refuses `eval(` / `new Function` outside RDKit's chunk, and a script from a blob: URL stands in for it here.
 */
async function injectHostile(page: Page): Promise<Injected> {
  return page.evaluate(
    () =>
      new Promise<Injected>((done) => {
        const w = window as unknown as { __ranInline?: number; __ranHandler?: number; __ranBlob?: number };
        const script = document.createElement('script');
        script.textContent = 'window.__ranInline = 1';
        document.head.append(script);
        const img = document.createElement('img');
        img.setAttribute('onerror', 'window.__ranHandler = 1');
        img.src = 'blob:http://invalid.invalid/none';
        document.body.append(img);
        const external = document.createElement('script');
        external.src = URL.createObjectURL(new Blob(['window.__ranBlob = 1'], { type: 'text/javascript' }));
        document.head.append(external);
        setTimeout(() => {
          img.remove();
          const ran = [w.__ranInline === 1 ? 'inline script' : '', w.__ranHandler === 1 ? 'inline handler' : '', w.__ranBlob === 1 ? 'blob script' : ''];
          done({ ran: ran.filter((x) => x !== '') });
        }, 500);
      }),
  );
}

test.describe('the page policy (the <meta> tag of the production build)', () => {
  test('an injected inline script, an inline handler and a blob: script do not run, and raise the event; the chem worker still parses and draws', async ({ page }) => {
    test.setTimeout(180_000);
    const seen = await watch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await loadDemo(page);
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();

    const result = await injectHostile(page);
    expect(result.ran, 'what ran').toEqual([]);
    const violations = await seen.violations();
    expect(
      violations.some((v) => /^script-src/.test(v) && /inline/.test(v)),
      `an inline-script violation in ${JSON.stringify(violations)}`,
    ).toBe(true);
    expect(violations.length, 'violations raised').toBeGreaterThanOrEqual(3);

    // The app is unharmed: the chem worker starts and parses (the demo's invalid structure is one CHEM-001 warning) and a structure is drawn.
    await expect(page.getByText(FINDINGS)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Check unavailable/)).toHaveCount(0);
    const images = await structureAppears(page);
    await expect(images).toHaveCount(2, { timeout: 60_000 });
    for (const src of await images.evaluateAll((list) => list.map((el) => el.getAttribute('src')))) expect(src).toMatch(/^blob:/);

    // Only the deliberate violations: the rest of the page is clean.
    expect(seen.consoleErrors.filter((text) => !DELIBERATE.test(text)), 'other console errors').toEqual([]);
    expect(seen.pageErrors.filter((text) => !DELIBERATE.test(text)), 'other page errors').toEqual([]);
    expect(seen.foreignRequests.filter((url) => !url.includes('invalid.invalid')), 'requests that left the origin').toEqual([]);
    expect(seen.nativeDialogs).toEqual([]);
  });
});

for (const kind of ['same', 'chem-allowance'] as const) {
  test.describe(`the policy as a response header, case ${kind === 'same' ? 'A (the same header on every script)' : 'B (the chem worker entry alone allows unsafe-eval)'}`, () => {
    let server: HeaderServer;
    test.beforeAll(async () => {
      server = await startHeaderServer(kind);
    });
    test.afterAll(async () => {
      await server.close();
    });

    test('what the app does', async ({ makeContext, browserName }) => {
      test.setTimeout(240_000);
      const context = await makeContext({ baseURL: server.origin, acceptDownloads: true, viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      const seen = await watch(page, server.origin);
      await openApp(page);
      await loadDemo(page);
      await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
      await expect(page.getByText(/^Workers: compute ok, /)).toBeVisible({ timeout: 60_000 });
      // wait until the chem worker has had its say: the findings settle, or the unavailable banner shows
      await expect
        .poll(async () => (await page.getByText(FINDINGS).count()) + (await page.getByText(/Check unavailable/).count()), { timeout: 90_000 })
        .toBeGreaterThan(0);

      // the header is on every response, the document included; the chem entry differs only in case B
      expect(server.served.length).toBeGreaterThan(5);
      expect(new Set(server.served.filter((s) => !CHEM_ENTRY.test(s.path)).map((s) => s.csp)).size, 'one policy on everything but the chem entry').toBe(1);
      const chemEntry = server.served.filter((s) => CHEM_ENTRY.test(s.path));
      expect(chemEntry.length, 'the chem worker entry was requested').toBeGreaterThan(0);
      expect(chemEntry.every((s) => s.csp.includes("'unsafe-eval'")), 'unsafe-eval on the chem entry only in case B').toBe(kind === 'chem-allowance');
      expect(server.served.filter((s) => !CHEM_ENTRY.test(s.path)).some((s) => s.csp.includes("'unsafe-eval'")), 'the page policy is never widened').toBe(false);

      const workers = (await page.getByText(/^Workers: /).first().textContent()) ?? '';
      const chemWorks = (await page.getByText(/Check unavailable/).count()) === 0;
      const retry = (await page.getByRole('button', { name: 'Retry' }).count()) > 0;
      let structure = 'not tried';
      if (chemWorks) {
        const images = await structureAppears(page);
        await expect(images).toHaveCount(2, { timeout: 60_000 });
        structure = 'drawn';
      }
      const summary = `${browserName}, case ${kind}: chem ${chemWorks ? `works (structure ${structure}, L4 ran)` : `says "Check unavailable"${retry ? ' with Retry' : ' WITHOUT Retry'}`}; ${workers}`;
      test.info().annotations.push({ type: 'observed', description: summary });
      console.log(`HEADER-CSP ${summary}`);

      // The page policy is enforced in both cases, and the other workers run.
      const result = await injectHostile(page);
      expect(result.ran, 'what ran').toEqual([]);
      expect(await seen.violations(), 'the injected script raised the event').not.toEqual([]);
      expect(workers).toMatch(/compute ok/);
      expect(workers).toMatch(/search ok/);
      if (kind === 'chem-allowance') expect(chemWorks, 'case B: chem works').toBe(true);
      else if (!chemWorks) expect(retry, 'case A: Check unavailable offers Retry').toBe(true);
      await expect(page.getByText(/CHEM-001/)).toHaveCount(0);
      expect(seen.pageErrors.filter((text) => !DELIBERATE.test(text)), 'page errors').toEqual([]);
      expect(seen.foreignRequests.filter((url) => !url.includes('invalid.invalid'))).toEqual([]);
      expect(seen.nativeDialogs).toEqual([]);
    });
  });
}
