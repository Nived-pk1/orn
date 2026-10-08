/**
 * The smoke (step 5.1d, note E10): it runs in Chromium, Firefox and WebKit. 1: the app boots and loads the demo. 2: the chem
 * worker starts and parses (the demo's invalid structure arrives as a CHEM-001 warning in the counts). 3: the status shows the compute,
 * chem and search workers as ok. 4: the BUILT layout worker loads ELK, answers `warmUp` and lays out a small graph with engine 'elk'
 * (5.1d review follow-up a: ELK did not load in the production worker).
 */
import { readdirSync } from 'node:fs';
import { expect, test } from './fixtures';
import { expectClean, findingsText, loadDemo, openApp, recordCount, showDataset, watch } from './kit';

test('the app boots and loads the demo; its counts are shown', async ({ page }) => {
  const seen = await watch(page);
  await openApp(page);
  await expect(page.getByRole('region', { name: 'First run' })).toBeVisible();
  await loadDemo(page);
  // step 5.5a: after the demo loads the navigator shows its hubs (Chromium, Firefox, WebKit)
  await expect(page.getByRole('group', { name: /^Navigator: 16 hubs, \d+ arrows$/ })).toBeVisible();
  await expect(page.locator('svg [data-node-id]')).toHaveCount(16);
  await showDataset(page);
  expect(await recordCount(page, 'reaction')).toBe(27);
  expect(await recordCount(page, 'species')).toBe(66);
  await expect(page.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
  await expectClean(seen);
});

test('the chem worker parses: the demo has one CHEM-001 warning in the counts', async ({ page }) => {
  await openApp(page);
  await loadDemo(page);
  // L1-L3 findings of the demo: one planted RXN-002 warning (E 0 / W 1 / I 17 / Review 38). L4 (chem worker) adds one CHEM-001 warning for the invalid structure.
  await expect(findingsText(page)).toHaveText('Findings: E 0 / W 2 / I 17 / Review 38', { timeout: 60_000 });
  await expect(page.getByText(/Check unavailable/)).toHaveCount(0);
});

test('the status shows the compute, chem and search workers as ok after the demo loads', async ({ page }) => {
  await openApp(page);
  await loadDemo(page);
  await expect(findingsText(page)).toHaveText('Findings: E 0 / W 2 / I 17 / Review 38', { timeout: 60_000 });
  await expect(page.getByText(/^Workers: compute ok, chem ok, layout (not started|ok), search ok$/)).toBeVisible();
});

interface Answer {
  readonly type?: string;
  readonly id?: number;
  readonly ok?: boolean;
  readonly result?: { readonly ok?: boolean; readonly engine?: string; readonly message?: string; readonly positions?: Record<string, unknown>; readonly fallbackReason?: string };
}

test('the built layout worker loads ELK: warmUp answers ok and a small layout answers engine elk', async ({ page }) => {
  const seen = await watch(page);
  await openApp(page);
  const file = readdirSync('dist/assets').find((name) => name.startsWith('worker-layout-') && name.endsWith('.js'));
  expect(file, 'the built layout worker').toBeDefined();
  const answers = await page.evaluate(
    (workerUrl) =>
      new Promise<{ warm: Answer; layout: Answer; again: Answer }>((resolve, reject) => {
        const worker = new Worker(workerUrl, { type: 'module' });
        const got = new Map<number, Answer>();
        const request = {
          requestId: 'e2e',
          algorithm: 'layered',
          direction: 'RIGHT',
          nodes: ['a', 'b', 'c'].map((id) => ({ id, width: 80, height: 40 })),
          edges: [
            { id: 'e1', from: 'a', to: 'b' },
            { id: 'e2', from: 'b', to: 'c' },
          ],
          spacing: { node: 20, layer: 40, edge: 10 },
          seed: 1,
        };
        worker.onerror = (event) => reject(new Error(`worker error: ${event.message}`));
        worker.onmessage = (event: MessageEvent) => {
          const data = event.data as Answer;
          if (data.type !== 'response' || data.id === undefined) return;
          got.set(data.id, data);
          if (data.id === 1) worker.postMessage({ type: 'request', id: 2, method: 'layout', params: request });
          if (data.id === 2) worker.postMessage({ type: 'request', id: 3, method: 'layout', params: { ...request, requestId: 'e2e-2' } });
          if (got.size === 3) {
            worker.terminate();
            resolve({ warm: got.get(1) as Answer, layout: got.get(2) as Answer, again: got.get(3) as Answer });
          }
        };
        worker.postMessage({ type: 'request', id: 1, method: 'warmUp', params: {} });
      }),
    `/assets/${file}`,
  );
  expect(answers.warm.ok, JSON.stringify(answers.warm)).toBe(true);
  expect(answers.warm.result?.ok, JSON.stringify(answers.warm)).toBe(true);
  expect(answers.layout.ok, JSON.stringify(answers.layout)).toBe(true);
  expect(answers.layout.result?.engine, JSON.stringify(answers.layout)).toBe('elk');
  expect(Object.keys(answers.layout.result?.positions ?? {}).sort()).toEqual(['a', 'b', 'c']);
  expect(answers.again.result?.engine).toBe('elk');
  await expectClean(seen);
});
