/**
 * Readability of the navigator (step 5.5a, items h and m; part 2 adds the structures), Chromium against the PRODUCTION build with real
 * fonts: at LOD 2 no arrow-text rectangle overlaps another one or a node box, or leaves the Scene bounds. How many text rectangles a
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

const hub = (page: Page, id: string) => page.locator(`svg [data-node-id="${id}"]`);

test.describe('structures (step 5.5a part 2, item k)', () => {
  test('a hub expanded: no overlap at LOD 2; at LOD 3 a member shows its structure as a blob image, with no CSP violation', async ({ page }) => {
    test.setTimeout(90_000);
    const seen = await watch(page);
    await openDemo(page);
    const before = await page.locator('svg [data-node-id]').count();
    await hub(page, 'cls_alcohols').dblclick();
    await expect(async () => expect(await page.locator('svg [data-node-id]').count()).toBeGreaterThan(before)).toPass();
    await page.waitForTimeout(400);
    await zoomInTo(page, 2);
    const problems = problemsOf(await measure(page));
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(resolve(SHOTS, 'readability-expanded-lod2.json'), JSON.stringify(problems, null, 1));
    test.info().annotations.push({ type: 'expanded LOD 2: text rectangles / a line crosses', description: `${problems.labels} / ${problems.linesCrossingText}` });
    expect(problems.labels, 'text rectangles were measured').toBeGreaterThan(5);
    expect(problems.labelOverLabel).toEqual([]);
    expect(problems.labelOverNode).toEqual([]);
    expect(problems.outside).toEqual([]);
    // fit, so the member is on the screen, then zoom in on the member Ethanol with the wheel until LOD 3
    await page.getByRole('button', { name: 'Fit' }).click();
    await page.waitForTimeout(400);
    const box = await hub(page, 'spc_ethanol').boundingBox();
    if (box === null) throw new Error('the member Ethanol is not drawn');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 40 && Number(await drawing(page).getAttribute('data-lod')) < 3; i += 1) {
      await page.mouse.wheel(0, -400);
      await page.waitForTimeout(120);
    }
    const world = await page.evaluate(() => document.querySelector('[data-world]')?.getAttribute('transform'));
    expect(Number(await drawing(page).getAttribute('data-lod')), `world transform ${world}`).toBe(3);
    const image = hub(page, 'spc_ethanol').locator('image');
    await expect(image).toHaveAttribute('href', /^blob:/, { timeout: 30_000 });
    await expect(page.locator('svg image[href^="blob:"]').first()).toBeAttached();
    // the name stays at LOD 3 beside the structure
    await expect(page.locator('svg [data-label-of="spc_ethanol"] text')).toHaveCount(1);
    await page.waitForTimeout(300);
    const path = await shot(page, 'expanded-alcohols-lod3-1280x800.png');
    test.info().annotations.push({ type: 'screenshot', description: path });
    await expectClean(seen);
  });
});

test.describe('the demo overview is readable', () => {
  test('at LOD 2 no arrow text overlaps another one or a node, or leaves the bounds', async ({ page }) => {
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

  test('a single-edge arrow with a condition shows it at LOD 2 (Amines to Diazonium salts: 0–5 °C; Alcohols to Ethers: 413 K), and nothing overlaps', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    await zoomInTo(page, 2);
    const textOf = async (name: string): Promise<string> => {
      const edge = page.locator(`svg [data-edge-id][aria-label^="${name}"]`).first();
      const id = await edge.getAttribute('data-edge-id');
      expect(id, name).not.toBeNull();
      expect(await edge.getAttribute('aria-label'), 'a single edge, not a bundle').toMatch(/, 1 reaction/);
      return (await page.locator(`svg [data-arrow-text-of="${id}"]`).textContent()) ?? '';
    };
    expect(await textOf('Amines to Diazonium salts')).toContain('0–5 °C');
    expect(await textOf('Alcohols to Ethers')).toContain('413 K');
    const problems = problemsOf(await measure(page));
    expect(problems.labelOverLabel).toEqual([]);
    expect(problems.labelOverNode).toEqual([]);
    expect(problems.outside).toEqual([]);
    writeFileSync(resolve(SHOTS, 'readability-overview-lod2-with-conditions.json'), JSON.stringify(problems, null, 1));
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
