/**
 * Readability of the navigator overview (step 5.5a, items h and m; calmed in 5.5b, ADR-037: no arrow text, no expansion, so the structures
 * and conditions moved to the family page, tests/e2e/family.spec.ts), Chromium against the PRODUCTION build with real fonts: at LOD 2 no
 * count chip overlaps another one or a node box, or leaves the Scene bounds. How many text rectangles a
 * line crosses is reported (an annotation), not asserted. Screenshots of the fitted overview go to `screenshots/` (git-ignored).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { expectClean, loadDemo, openApp, watch } from './kit';
import { measure, problemsOf } from './readability';

const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const drawing = (page: Page) => page.getByRole('group', { name: NAVIGATOR });
const SHOTS = resolve(process.cwd(), 'screenshots');

async function openDemo(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(drawing(page)).toBeVisible();
}

async function zoomInTo(page: Page, lod: number): Promise<void> {
  for (let i = 0; i < 20 && Number(await drawing(page).getAttribute('data-lod')) < lod; i += 1) {
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(60);
  }
  expect(Number(await drawing(page).getAttribute('data-lod'))).toBeGreaterThanOrEqual(lod);
}

async function shot(page: Page, name: string): Promise<string> {
  mkdirSync(SHOTS, { recursive: true });
  const path = resolve(SHOTS, name);
  await page.screenshot({ path });
  return path;
}

test.describe('the demo overview is readable', () => {
  test('at LOD 2 no count chip overlaps another one or a node, or leaves the bounds', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    await zoomInTo(page, 2);
    const measured = await measure(page);
    const problems = problemsOf(measured);
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(resolve(SHOTS, 'readability-overview-lod2.json'), JSON.stringify({ ...problems, nodes: measured.nodes.length, segments: measured.segments.length, bounds: measured.bounds }, null, 1));
    expect(problems.labels, 'text rectangles were measured').toBeGreaterThan(5);
    test.info().annotations.push({ type: 'text rectangles', description: String(problems.labels) });
    test.info().annotations.push({ type: 'text rectangles a line crosses (reported, not asserted)', description: String(problems.linesCrossingText) });
    expect(problems.labelOverLabel).toEqual([]);
    expect(problems.labelOverNode).toEqual([]);
    expect(problems.outside).toEqual([]);
    await expectClean(seen);
  });

  test('the overview is calm: no arrow text at any LOD, only the count chips (ADR-037)', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    await zoomInTo(page, 2);
    await expect(page.locator('svg [data-arrow-text-of]')).toHaveCount(0);
    await expect(page.locator('svg [data-count-of]').first()).toBeAttached();
    await expectClean(seen);
  });

  test('the fitted overview, 1280 x 800 (screenshot)', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'Fit' }).click();
    await page.waitForTimeout(500);
    const path = await shot(page, 'overview-fitted-1280x800.png');
    test.info().annotations.push({ type: 'screenshot', description: path });
  });
});
