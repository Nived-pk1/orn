/**
 * The arranged overview and the family colours (step 5.5c; ADR-037), Chromium against the PRODUCTION build with real fonts and the
 * real layout worker, the demo in 1280 x 800: the overview is the grid layout; zero lines through a box, zero count chips over another
 * chip or a box, every hub inside the fitted view at LOD 1 or more; the legend lists the four groups; the family page of Alcohols takes
 * its tone; axe and zero CSP violations; a generated file with no cells still gets the ELK overview. Screenshots go to `screenshots/`
 * (git-ignored) and the numbers of the demo (arcs, boxes) to `screenshots/arrangement-numbers.json`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { axeProblems, chooseFile, expectClean, generatedFileWithAnchors, loadDemo, openApp, watch } from './kit';
import { chipsOffMiddle, linesThroughBoxes, measure, problemsOf } from './readability';

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

test.describe('the demo overview is arranged on the grid', () => {
  test('the layout is the grid, the legend lists the four groups, and the fitted overview shows every hub at LOD 1 or more', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    await expect(page.locator('[data-layout-engine]')).toHaveAttribute('data-layout-engine', 'grid');
    const legend = page.getByRole('list', { name: 'Family groups' });
    await expect(legend.getByRole('listitem')).toHaveText(['Hydrocarbons', 'Halogen compounds', 'Oxygen compounds', 'Nitrogen compounds']);
    await page.getByRole('button', { name: 'Fit' }).click();
    await page.waitForTimeout(500);
    expect(Number(await drawing(page).getAttribute('data-lod'))).toBeGreaterThanOrEqual(1);
    const outside = await page.evaluate(() => {
      const frame = (document.querySelector('svg[data-scene-width]') as SVGSVGElement).getBoundingClientRect();
      return [...document.querySelectorAll('[data-box="hub"], [data-box="unclassified"]')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < frame.left - 0.5 || r.top < frame.top - 0.5 || r.right > frame.right + 0.5 || r.bottom > frame.bottom + 0.5;
        })
        .map((el) => el.getAttribute('data-node-id'));
    });
    expect(outside).toEqual([]);
    expect(await page.locator('svg [data-box="hub"]').count()).toBe(15);
    const path = await shot(page, 'overview-arranged-1280x800.png');
    test.info().annotations.push({ type: 'screenshot', description: path });
    await expectClean(seen);
  });

  test('zero lines through a box and zero count chips over another chip or a box, at the fitted view and at LOD 2', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    const report: Record<string, unknown> = {};
    for (const at of ['fitted', 'lod2'] as const) {
      if (at === 'lod2') await zoomInTo(page, 2);
      const measured = await measure(page);
      const problems = problemsOf(measured);
      expect(linesThroughBoxes(measured), `lines through a box (${at})`).toEqual([]);
      expect(problems.labelOverLabel, `chip over chip (${at})`).toEqual([]);
      expect(problems.labelOverNode, `chip over a box (${at})`).toEqual([]);
      expect(problems.outside, `chip outside the bounds (${at})`).toEqual([]);
      // the count chips are drawn from LOD 2 on; at the fitted view only the lines are measured
      if (at === 'lod2') report['chipsOffMiddle'] = await Promise.all(chipsOffMiddle(measured).map(async (id) => (await page.locator(`[data-edge-id="${id}"]`).getAttribute('aria-label')) ?? id));
      if (at === 'lod2') expect(problems.labels, 'the chips were measured').toBeGreaterThanOrEqual(5);
      if (at === 'fitted') {
        const parts = new Map<string, number>();
        for (const s of measured.segments) parts.set(s.id, (parts.get(s.id) ?? 0) + 1);
        report['edges'] = parts.size;
        const nameOf = async (id: string): Promise<string> => (await page.locator(`[data-edge-id="${id}"]`).getAttribute('aria-label')) ?? id;
        report['arcs'] = await Promise.all([...parts].filter(([, n]) => n > 1).map(([id]) => nameOf(id)));
        report['nodes'] = measured.nodes.map((n) => ({ id: n.id, x: Math.round(n.x), y: Math.round(n.y), width: n.width, height: n.height }));
        report['bounds'] = measured.bounds;
      }
    }
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(resolve(SHOTS, 'arrangement-numbers.json'), JSON.stringify(report, null, 1));
    await expectClean(seen);
  });

  test('axe: nothing serious on the arranged overview; zero CSP violations', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });

  test('a hub card has the tone of its group, its group in the accessible name and a rounded corner', async ({ page }) => {
    await openDemo(page);
    const alcohols = page.locator('[data-node-id="cls_alcohols"]');
    await expect(alcohols).toHaveAttribute('aria-label', /^Alcohols, class hub, Oxygen compounds, /);
    await expect(alcohols.locator('rect').first()).toHaveAttribute('data-tone', 'green');
    await expect(alcohols.locator('rect').first()).toHaveAttribute('rx', '8');
    await expect(page.locator('[data-node-id="cls_amines"] rect').first()).toHaveAttribute('data-tone', 'violet');
    const fills = await page.evaluate(() => {
      const tint = (id: string): string => getComputedStyle(document.querySelector(`[data-node-id="${id}"] rect`) as Element).fill;
      return { green: tint('cls_alcohols'), violet: tint('cls_amines'), blue: tint('cls_alkenes'), amber: tint('cls_haloalkanes') };
    });
    expect(new Set(Object.values(fills)).size).toBe(4);
    await expect(page.locator('[data-box="unclassified"] rect').first()).not.toHaveAttribute('data-tone', /.+/);
  });
});

test.describe('the family page takes the tone of its family', () => {
  test('Alcohols: a green header with its group written, the strip buttons in the same tone; axe', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    await page.locator('[data-node-id="cls_alcohols"]').dblclick();
    await expect(page.getByRole('heading', { level: 1, name: /Alcohols/ })).toBeVisible();
    const header = page.getByRole('heading', { level: 1 }).locator('xpath=ancestor::div[@data-tone][1]');
    await expect(header).toHaveAttribute('data-tone', 'green');
    await expect(header.getByText('Oxygen compounds')).toBeVisible();
    await page.waitForTimeout(800);
    expect(await axeProblems(page)).toEqual([]);
    const path = await shot(page, 'family-alcohols-1280x800.png');
    test.info().annotations.push({ type: 'screenshot', description: path });
    await expectClean(seen);
  });
});

test.describe('an overview without cells keeps the ELK layout', () => {
  test('a generated file with anchors but no cells is drawn by ELK, with no legend', async ({ page }) => {
    const seen = await watch(page);
    await openApp(page);
    await chooseFile(page, generatedFileWithAnchors('tiny', 'chain'));
    await expect(page.getByRole('heading', { name: 'Import summary' })).toBeVisible({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(drawing(page)).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-layout-engine]')).toHaveAttribute('data-layout-engine', /^(elk|fallback)$/);
    await expect(page.getByRole('list', { name: 'Family groups' })).toHaveCount(0);
    await expectClean(seen);
  });
});
