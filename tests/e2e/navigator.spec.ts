/**
 * The navigator end to end (step 5.5a), Chromium against the PRODUCTION build: the demo's hubs and arrows are on screen and equal the
 * projection's; no label is wider than its box (real fonts, the real measurer); axe; pan and zoom render nothing but the world group's
 * transform; a toolbar command followed by a wheel gesture continues from the command's transform. Zero policy violations, console
 * errors and foreign requests everywhere (notes E3, E10, E13).
 */
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_TRAVERSAL_LIMITS, navigatorProjection } from '@/core/graph';
import { indexEngine } from '@/core/indexes';
import { drawnPaths } from '@/render/scene';
import { demoState } from '@/test-support/app-boot-kit';
import { axeProblems, expectClean, loadDemo, openApp, watch } from './kit';

const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const drawing = (page: Page) => page.getByRole('group', { name: NAVIGATOR });

/** What the projection of the demo (no expansion, no filter, the navigator's limits) says should be drawn. */
function expectedCounts(): { nodes: number; paths: number } {
  const state = demoState();
  const projection = navigatorProjection.build(
    { state, indexes: indexEngine.build(state, 1), scopeOf: () => 'unmapped' },
    { view: 'navigator', focus: [], expansion: { expanded: [], collapsedEdgeIds: [] }, filters: { scopes: [], topicIds: [], reagentFamilies: [] }, limits: { ...DEFAULT_TRAVERSAL_LIMITS, maxNodes: 400, maxEdges: 800 } },
  );
  return { nodes: projection.nodes.length, paths: drawnPaths(projection).length };
}

async function openNavigator(page: Page): Promise<void> {
  await openApp(page);
  await loadDemo(page);
  await expect(drawing(page)).toBeVisible();
}

const lodOf = async (page: Page): Promise<number> => Number(await drawing(page).getAttribute('data-lod'));

async function zoomInTo(page: Page, lod: number): Promise<void> {
  for (let i = 0; i < 20 && (await lodOf(page)) < lod; i += 1) {
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(60);
  }
  expect(await lodOf(page)).toBeGreaterThanOrEqual(lod);
}

const transformOf = async (page: Page): Promise<{ x: number; y: number; scale: number }> =>
  page.evaluate(() => {
    const text = document.querySelector('[data-world]')?.getAttribute('transform') ?? '';
    const found = /translate\((-?[\d.e+-]+) (-?[\d.e+-]+)\) scale\((-?[\d.e+-]+)\)/.exec(text);
    if (found === null) throw new Error(`no transform: ${text}`);
    return { x: Number(found[1]), y: Number(found[2]), scale: Number(found[3]) };
  });

test.describe('the demo navigator', () => {
  test('shows its hubs and arrows; the counts equal the projection; nothing leaves the origin', async ({ page }) => {
    const seen = await watch(page);
    await openNavigator(page);
    const expected = expectedCounts();
    await expect(page.locator('svg [data-node-id]')).toHaveCount(expected.nodes);
    await expect(page.locator('svg [data-edge-id]')).toHaveCount(expected.paths);
    expect(expected.nodes).toBe(16);
    await expect(page.getByRole('toolbar', { name: 'Canvas tools' })).toBeVisible();
    await expectClean(seen);
  });

  test('no hub label is wider than its box (real fonts, real measurer)', async ({ page }) => {
    const seen = await watch(page);
    await openNavigator(page);
    await zoomInTo(page, 1);
    const wide = await page.evaluate(() => {
      const problems: string[] = [];
      let checked = 0;
      for (const group of document.querySelectorAll('[data-label-of]')) {
        const id = group.getAttribute('data-label-of') ?? '';
        const node = document.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
        const box = node?.querySelector('rect');
        if (node === null || box === null || box === undefined) continue;
        const width = Number(box.getAttribute('width'));
        for (const text of group.querySelectorAll('text')) {
          const bbox = (text as SVGTextElement).getBBox();
          checked += 1;
          if (bbox.x + bbox.width > width + 0.5) problems.push(`${id}: text ends at ${(bbox.x + bbox.width).toFixed(1)}, box is ${width}`);
        }
      }
      return { problems, checked };
    });
    expect(wide.checked, 'labels were measured').toBeGreaterThan(10);
    expect(wide.problems).toEqual([]);
    await expectClean(seen);
  });

  test('axe: nothing serious on the navigator screen', async ({ page }) => {
    const seen = await watch(page);
    await openNavigator(page);
    expect(await axeProblems(page)).toEqual([]);
    await zoomInTo(page, 2);
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });

  test('the inspector says in words what arrives later', async ({ page }) => {
    await openNavigator(page);
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    await expect(inspector.getByText(/inspector arrives in step 5\.6a and search in step 5\.8/)).toBeVisible();
  });
});

test.describe('pan and zoom', () => {
  test('inside one LOD band the only DOM mutation is the world group transform, and no layer commits', async ({ page }) => {
    const seen = await watch(page);
    await openNavigator(page);
    await zoomInTo(page, 3);
    await page.waitForTimeout(400);
    const canvas = page.locator('[data-layer-commits]').first();
    const commitsBefore = await canvas.getAttribute('data-layer-commits');
    await page.evaluate(() => {
      const svg = document.querySelector('svg[data-lod]');
      const records: string[] = [];
      (window as unknown as { __mutations: string[] }).__mutations = records;
      const observer = new MutationObserver((list) => {
        for (const record of list) {
          const target = record.target as Element;
          records.push(`${record.type}:${record.attributeName ?? ''}:${target.nodeName}${target.hasAttribute?.('data-world') ? '#world' : ''}`);
        }
      });
      if (svg !== null) observer.observe(svg, { subtree: true, attributes: true, childList: true, characterData: true });
    });
    const lodBefore = await lodOf(page);
    const box = await drawing(page).boundingBox();
    if (box === null) throw new Error('the drawing has no box');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 3; i += 1) {
      await page.mouse.wheel(0, -40);
      await page.waitForTimeout(40);
    }
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy + 40, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await lodOf(page)).toBe(lodBefore);
    const mutations = await page.evaluate(() => (window as unknown as { __mutations: string[] }).__mutations);
    expect(mutations.length, 'the transform was written').toBeGreaterThan(0);
    expect([...new Set(mutations)]).toEqual(['attributes:transform:g#world']);
    expect(await canvas.getAttribute('data-layer-commits')).toBe(commitsBefore);
    await expectClean(seen);
  });

  test('a toolbar command followed by a wheel gesture continues from the command transform (no jump)', async ({ page }) => {
    await openNavigator(page);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(150);
    const before = await transformOf(page);
    const box = await drawing(page).boundingBox();
    if (box === null) throw new Error('the drawing has no box');
    const px = 300;
    const py = 200;
    await page.mouse.move(box.x + px, box.y + py);
    await page.mouse.wheel(0, -60);
    await page.waitForTimeout(150);
    const after = await transformOf(page);
    expect(after.scale).toBeGreaterThan(before.scale);
    // zooming about the pointer keeps the world point under it: (p - t) / s is the same before and after
    expect((px - after.x) / after.scale).toBeCloseTo((px - before.x) / before.scale, 1);
    expect((py - after.y) / after.scale).toBeCloseTo((py - before.y) / before.scale, 1);
  });
});
