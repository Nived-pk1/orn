/**
 * The long apply (step 5.11b), against the PRODUCTION build. A write that takes more than 2 s shows "Applying the records... N of M" with
 * a progress bar and "Keep this tab open until it finishes."; a short one shows nothing extra. WebKit (Playwright's build pays about 15 ms
 * per IndexedDB put request, PROGRESS 5.10b part 2W) makes a 0.5 MB file (about 500 records) take about 10 s, so the long view is tested
 * there; Chromium and Firefox apply the same kind of small import in well under 2 s and must show no progress view and still end in
 * "Imported". axe on the progress view; zero policy violations, console errors and foreign requests.
 */
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { documentToState, serializeDocument, stateToDocument } from '@/core/dataset';
import { generateDataset, tierParams } from '@/test-support/generator';
import { axeProblems, chooseFile, expectClean, expectPreview, importDialog, loadDemo, openApp, watch, type UploadFile } from './kit';

const SHOTS = resolve(process.cwd(), 'screenshots');
const toasts = (page: Page) => page.getByRole('status', { name: 'Notifications' });

/** A generated dataset near `targetMb` megabytes as an `.orn.json` upload. */
function fileOfMb(targetMb: number): UploadFile {
  const base = tierParams('initial', 'dense', 1);
  const build = (scale: number): string => {
    const params = { ...base, species: Math.max(2, Math.round(base.species * scale)), classes: Math.max(2, Math.round(base.classes * scale)), reagents: Math.max(1, Math.round(base.reagents * scale)), reactions: Math.max(2, Math.round(base.reactions * scale)), topics: Math.max(1, Math.round(base.topics * scale)) };
    const doc = generateDataset(params);
    const parsed = documentToState(doc);
    if (!parsed.ok) throw new Error('the generated dataset has duplicate IDs');
    const out = serializeDocument(stateToDocument(parsed.state, { exportedAt: doc.exportedAt, exportScope: doc.exportScope, generator: doc.generator }));
    if (!out.ok) throw new Error('the generated dataset does not serialise');
    return out.text;
  };
  let scale = targetMb / 3.5;
  let text = build(scale);
  scale *= (targetMb * 1048576) / Buffer.byteLength(text, 'utf8');
  text = build(scale);
  return { name: `generated-${targetMb}mb.orn.json`, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') };
}

/** Samples the progress bar and the live regions of the page every 100 ms from now on; `read` returns what was seen. */
async function sampleProgress(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen = { values: [] as number[], max: new Set<string>(), texts: new Set<string>(), live: new Set<string>(), bars: 0 };
    (window as unknown as { __progress: typeof seen }).__progress = seen;
    setInterval(() => {
      const bar = document.querySelector('[role="progressbar"]');
      if (bar !== null) {
        seen.bars += 1;
        const now = Number(bar.getAttribute('aria-valuenow'));
        if (seen.values[seen.values.length - 1] !== now) seen.values.push(now);
        seen.max.add(String(bar.getAttribute('aria-valuemax')));
        const text = bar.previousElementSibling?.textContent ?? '';
        seen.texts.add(text.replace(/\d+/g, 'N'));
      }
      for (const region of document.querySelectorAll('dialog [role="status"]')) seen.live.add((region.textContent ?? '').replace(/\d+/g, 'N'));
    }, 100);
  });
}
const read = (page: Page) =>
  page.evaluate(() => {
    const seen = (window as unknown as { __progress: { values: number[]; max: Set<string>; texts: Set<string>; live: Set<string>; bars: number } }).__progress;
    return { values: seen.values, max: [...seen.max], texts: [...seen.texts], live: [...seen.live], bars: seen.bars };
  });

test.describe('the long apply (5.11b)', () => {
  test('WebKit, a 0.5 MB file: the count rises through at least two values, the bar has its ARIA values, then "Imported"', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'only WebKit writes slowly enough (about 15 ms per put) for a 0.5 MB file to pass 2 s; the other engines are the next test');
    test.setTimeout(300_000);
    const seen = await watch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await chooseFile(page, fileOfMb(0.5));
    await expectPreview(page, 120_000);
    await sampleProgress(page);
    await importDialog(page).getByRole('button', { name: 'Confirm' }).click();

    const bar = page.getByRole('progressbar', { name: 'Applying the records' });
    await expect(bar).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/^Applying the records\.\.\. \d+ of \d+$/)).toBeVisible();
    await expect(page.getByText('Keep this tab open until it finishes.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
    expect(await bar.getAttribute('aria-valuemin')).toBe('0');
    expect(Number(await bar.getAttribute('aria-valuemax'))).toBeGreaterThan(100);
    await page.screenshot({ path: resolve(SHOTS, 'apply-progress-webkit-1280x800.png') });
    expect(await axeProblems(page, 10)).toEqual([]);

    await expect(toasts(page).getByText(/^Imported \d+ records from generated-0\.5mb\.orn\.json\./)).toBeVisible({ timeout: 240_000 });
    const result = await read(page);
    console.log(`WebKit progress values seen: ${result.values.join(', ')} (aria-valuemax ${result.max.join(',')}; ${result.bars} samples)`);
    expect(new Set(result.values).size).toBeGreaterThanOrEqual(2);
    expect(result.values).toEqual([...result.values].sort((a, b) => a - b));
    expect(result.max).toHaveLength(1);
    expect(result.texts).toEqual(['Applying the records... N of N']);
    // the live region of the dialog never carried the moving count
    for (const text of result.live) expect(text, text).not.toMatch(/\bof \d+/);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expectClean(seen);
  });

  test('a small import shows no progress view and still ends in "Imported"', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit pays about 15 ms per put, so even the demo can pass 2 s there; its long view is the test above');
    const seen = await watch(page);
    await openApp(page);
    await sampleProgress(page);
    await loadDemo(page);
    await expect(page.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
    const result = await read(page);
    expect(result.bars).toBe(0);
    expect(result.live.filter((text) => /Keep this tab open/.test(text))).toEqual([]);
    await expectClean(seen);
  });
});
