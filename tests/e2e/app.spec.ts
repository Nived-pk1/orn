/**
 * The Chromium e2e suite of step 5.1d against the PRODUCTION build (the CSP exists only there, note E10): persistence across a
 * reload, a clean console, the page policy, no request off the origin, a second tab, a blocked RDKit WASM and an uploaded file.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { chooseFile, expectClean, findingsText, generatedFile, loadDemo, openApp, recordCount, showDataset, watch } from './kit';

test.describe('the app in Chromium', () => {
  test('a reload keeps the data; zero violations, zero console errors, nothing leaves the origin', async ({ page }) => {
    const seen = await watch(page);
    await openApp(page);
    await loadDemo(page);
    expect(await recordCount(page, 'reaction')).toBe(27);
    await expect(findingsText(page)).toHaveText('Findings: E 0 / W 2 / I 17 / Review 38', { timeout: 60_000 });
    await expect(page.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();

    await page.reload();
    await showDataset(page);
    expect(await recordCount(page, 'reaction')).toBe(27);
    expect(await recordCount(page, 'species')).toBe(66);
    await expect(page.getByRole('region', { name: 'First run' })).toHaveCount(0);
    await expect(findingsText(page)).toHaveText('Findings: E 0 / W 2 / I 17 / Review 38', { timeout: 60_000 });
    await expectClean(seen);
  });

  test('the served demo file is the repo file, byte for byte', async ({ page, request }) => {
    await openApp(page);
    const html = await (await request.get('/')).text();
    const script = /src="(\/assets\/index-[^"]+\.js)"/.exec(html)?.[1];
    expect(script).toBeTruthy();
    const bundle = await (await request.get(script as string)).text();
    const demoUrl = /\/assets\/demo\.orn-[A-Za-z0-9_-]+\.json/.exec(bundle)?.[0];
    expect(demoUrl, 'the bundle names the demo asset').toBeTruthy();
    const served = await request.get(demoUrl as string);
    expect(served.ok()).toBe(true);
    expect((await served.body()).equals(readFileSync('data/seed/demo.orn.json'))).toBe(true);
  });

  test('the page policy is enforced: an injected inline script and eval do not run', async ({ page }) => {
    const seen = await watch(page);
    // A same-origin script file (allowed by script-src 'self') that tries eval: the page's own policy decides, not the test harness.
    await page.route('**/probe.js', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: "window.__evalResult = (() => { try { return String((0, eval)('1 + 1')); } catch { return 'blocked'; } })();" }),
    );
    await openApp(page);
    await page.evaluate(() => {
      const inline = document.createElement('script');
      inline.textContent = 'window.__injectedRan = true';
      document.head.append(inline);
      const probe = document.createElement('script');
      probe.src = '/probe.js';
      document.head.append(probe);
    });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __evalResult?: string }).__evalResult)).toBe('blocked');
    expect(await page.evaluate(() => (window as unknown as { __injectedRan?: boolean }).__injectedRan === true)).toBe(false);
    // the browser reports each refusal as a securitypolicyviolation event (the inline script and the eval)
    await expect.poll(async () => (await seen.violations()).filter((v) => v.startsWith('script-src')).length).toBeGreaterThanOrEqual(2);
  });

  test('a second tab is read-only and says so', async ({ context, page }) => {
    await openApp(page);
    await loadDemo(page);
    await expect(page.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
    const other = await context.newPage();
    await other.goto('/');
    await expect(other.getByText(/This tab is read-only because another tab of this app is the writer/)).toBeVisible();
    await expect(other.getByText('Read-only', { exact: true })).toBeVisible();
    expect(await recordCount(other, 'reaction')).toBe(27);
    await expect(other.getByRole('button', { name: 'Load demo dataset' })).toHaveCount(0);
    await expect(page.getByText(/This tab is read-only/)).toHaveCount(0);
  });

  test('with the RDKit WASM request blocked the app works and says "check unavailable"', async ({ page }) => {
    await page.route('**/*.wasm', (route) => route.abort());
    await openApp(page);
    await loadDemo(page);
    expect(await recordCount(page, 'reaction')).toBe(27);
    await expect(page.getByText(/Check unavailable/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Retry' }).first()).toBeVisible();
    // nothing is claimed about the structures: no CHEM-001 warning appears
    await expect(findingsText(page)).toHaveText('Findings: E 0 / W 1 / I 17 / Review 38');
  });

  test('"Import a file" takes an initial-tier file made by the generator in Node', async ({ page }) => {
    const seen = await watch(page);
    await openApp(page);
    await chooseFile(page, generatedFile('initial', 'dense'));
    await expect(page.getByRole('heading', { name: 'Import summary' })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('list', { name: 'Records per kind' })).toBeVisible();
    await expect(page.getByText(/^Findings in the result: E 0 /)).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/^Imported \d+ records from generated-initial-dense\.orn\.json\./)).toBeVisible({ timeout: 90_000 });
    await showDataset(page);
    expect(await recordCount(page, 'reaction')).toBeGreaterThan(100);
    await expect(page.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
    await expectClean(seen);
  });

  test('Cancel in the import summary imports nothing', async ({ page }) => {
    await openApp(page);
    await chooseFile(page, generatedFile('tiny', 'dense'));
    await expect(page.getByRole('heading', { name: 'Import summary' })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Import summary' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'First run' })).toBeVisible();
  });
});
