/**
 * The navigator end to end (step 5.5a), Chromium against the PRODUCTION build: the demo's hubs and arrows are on screen and equal the
 * projection's; no label is wider than its box (real fonts, the real measurer); axe; pan and zoom render nothing but the world group's
 * transform; a toolbar command followed by a wheel gesture continues from the command's transform. Zero policy violations, console
 * errors and foreign requests everywhere (notes E3, E10, E13).
 */
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_TRAVERSAL_LIMITS, navigatorProjection } from '@/core/graph';
import { indexEngine } from '@/core/indexes';
import { NAVIGATOR_MAX_EDGES, NAVIGATOR_MAX_NODES } from '@/features/navigator/limits';
import { documentToState } from '@/core/dataset';
import { drawnPaths } from '@/render/scene';
import { generateTier } from '@/test-support/generator';
import { withNavigatorAnchors } from '@/test-support/perf-kit';
import { demoState } from '@/test-support/app-boot-kit';
import { axeProblems, chooseFile, expectClean, generatedFileWithAnchors, loadDemo, openApp, watch } from './kit';

const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const drawing = (page: Page) => page.getByRole('group', { name: NAVIGATOR });

/** What the projection of the demo (no expansion, no filter, the navigator's limits) says should be drawn. */
function expectedCounts(): { nodes: number; paths: number } {
  const state = demoState();
  const projection = navigatorProjection.build(
    { state, indexes: indexEngine.build(state, 1), scopeOf: () => 'unmapped' },
    { view: 'navigator', focus: [], expansion: { expanded: [], collapsedEdgeIds: [] }, filters: { scopes: [], topicIds: [], reagentFamilies: [] }, limits: { ...DEFAULT_TRAVERSAL_LIMITS, maxNodes: NAVIGATOR_MAX_NODES, maxEdges: NAVIGATOR_MAX_EDGES } },
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
    // closed by default (step 5.5a review, item g); open it to read
    await page.getByRole('button', { name: 'Show inspector' }).click();
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
    // Compared on the SCREEN (world difference times the scale, within 0.05 px): the world drawing is larger now (room for the arrow text), so
    // the fitted scale is smaller and a fixed world tolerance became stricter in pixels than it was.
    expect(Math.abs((px - after.x) / after.scale - (px - before.x) / before.scale) * after.scale).toBeLessThan(0.05);
    expect(Math.abs((py - after.y) / after.scale - (py - before.y) / before.scale) * after.scale).toBeLessThan(0.05);
  });
});

// The line naming the selection sits next to the canvas toolbar (step 5.5a review, item g).
const inspector = (page: Page) => page.getByRole('toolbar', { name: 'Canvas tools' });
const hubGroup = (page: Page, id: string) => page.locator(`svg [data-node-id="${id}"]`);
const nodeCount = (page: Page): Promise<number> => page.locator('svg [data-node-id]').count();

test.describe('selection and opening a family', () => {
  test('a click selects a hub and the inspector names it; a click on empty canvas, not a drag, clears it', async ({ page }) => {
    const seen = await watch(page);
    await openNavigator(page);
    await hubGroup(page, 'cls_aldehydes').click();
    await expect(inspector(page).getByText(/^Selected: Aldehydes, class hub/)).toBeVisible();
    // a drag that starts on empty canvas is a pan, not a click: the selection stays
    const box = await drawing(page).boundingBox();
    if (box === null) throw new Error('the drawing has no box');
    await page.mouse.move(box.x + box.width - 20, box.y + box.height - 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 80, box.y + box.height - 60, { steps: 6 });
    await page.mouse.up();
    await expect(inspector(page).getByText(/^Selected: Aldehydes, class hub/)).toBeVisible();
    // a click on empty canvas (the corner of the drawing) clears it
    await page.mouse.click(box.x + 6, box.y + box.height - 6);
    await expect(inspector(page).getByText('Nothing is selected.')).toBeVisible();
    await expectClean(seen);
  });

  test('the overview does not expand: no Expand or Collapse, and a double click opens the family page without adding a node', async ({ page }) => {
    const seen = await watch(page);
    await openNavigator(page);
    await expect(page.getByRole('button', { name: 'Expand' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Collapse' })).toHaveCount(0);
    const before = await nodeCount(page);
    expect(before).toBe(16);
    await hubGroup(page, 'cls_aldehydes').dblclick();
    await expect(page.getByRole('region', { name: 'Family page: Aldehydes' })).toBeVisible();
    await page.getByRole('button', { name: 'Overview' }).click();
    await expect(drawing(page)).toBeVisible();
    expect(await nodeCount(page)).toBe(before);
    await expectClean(seen);
  });

  test('the toolbar opens the selected family, and says why when it cannot', async ({ page }) => {
    await openNavigator(page);
    const open = page.getByRole('button', { name: 'Open family' });
    await expect(open).toHaveAccessibleDescription('select a family first');
    await hubGroup(page, 'cls_alkenes').click();
    await expect(open).not.toHaveAttribute('aria-disabled', 'true');
    await open.click();
    await expect(page.getByRole('region', { name: 'Family page: Alkenes' })).toBeVisible();
  });

  test('the selection, the open family and the viewport survive a reload', async ({ page }) => {
    const seen = await watch(page);
    await openNavigator(page);
    await hubGroup(page, 'cls_aldehydes').click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(1500); // the viewport is still (400 ms), then the debounce (300 ms) and the write
    const view = await transformOf(page);
    await page.reload();
    await expect(drawing(page)).toBeVisible();
    await expect(inspector(page).getByText(/^Selected: Aldehydes, class hub/)).toBeVisible();
    await page.waitForTimeout(300);
    const again = await transformOf(page);
    expect(again.scale).toBeCloseTo(view.scale, 3);
    expect(again.x).toBeCloseTo(view.x, 0);
    expect(again.y).toBeCloseTo(view.y, 0);
    // an open family page comes back too
    await page.getByRole('button', { name: 'Open family' }).click();
    await expect(page.getByRole('region', { name: 'Family page: Aldehydes' })).toBeVisible();
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Family page: Aldehydes' })).toBeVisible();
    await expectClean(seen);
  });

  test('axe: nothing serious with a hub selected', async ({ page }) => {
    const seen = await watch(page);
    await openNavigator(page);
    await hubGroup(page, 'cls_aldehydes').click();
    await zoomInTo(page, 2);
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });
});

test.describe('ADV-012 part 1: a hub with 1,000 reactions', () => {
  test('the initial-tier hub_explosion file with anchors stays inside the render budget and its pair shows its full total', async ({ page }) => {
    test.setTimeout(240_000);
    const seen = await watch(page);
    const parsed = documentToState(generateTier('initial', 'hub_explosion', 1));
    if (!parsed.ok) throw new Error('the generator document has duplicate IDs');
    const state = withNavigatorAnchors(parsed.state);
    const projection = navigatorProjection.build(
      { state, indexes: indexEngine.build(state, 1), scopeOf: () => 'unmapped' },
      { view: 'navigator', focus: [], expansion: { expanded: [], collapsedEdgeIds: [] }, filters: { scopes: [], topicIds: [], reagentFamilies: [] }, limits: { ...DEFAULT_TRAVERSAL_LIMITS, maxNodes: NAVIGATOR_MAX_NODES, maxEdges: NAVIGATOR_MAX_EDGES } },
    );
    const biggest = [...projection.bundles].sort((a, b) => b.total - a.total || (a.id < b.id ? -1 : 1))[0];
    if (biggest === undefined) throw new Error('the generated overview has no pair');
    expect(biggest.total, 'the file really has a pair of many reactions').toBeGreaterThan(100);

    await openApp(page);
    await chooseFile(page, generatedFileWithAnchors('initial', 'hub_explosion'));
    await expect(page.getByRole('heading', { name: 'Import summary' })).toBeVisible({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/^Imported \d+ records from generated-initial-hub_explosion-anchored\.orn\.json\./)).toBeVisible({ timeout: 90_000 });
    await expect(drawing(page)).toBeVisible({ timeout: 60_000 });
    const checkBudget = async (): Promise<void> => {
      expect(await nodeCount(page)).toBeLessThanOrEqual(400);
      expect(await page.locator('svg [data-edge-id]').count()).toBeLessThanOrEqual(800);
    };
    await checkBudget();
    await expect(page.locator(`svg [data-edge-id][aria-label*="${biggest.total} reactions"]`).first()).toBeAttached();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expectClean(seen);
  });
});
