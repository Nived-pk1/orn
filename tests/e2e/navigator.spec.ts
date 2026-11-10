/**
 * The navigator end to end (step 5.5a), Chromium against the PRODUCTION build: the demo's hubs and arrows are on screen and equal the
 * projection's; no label is wider than its box (real fonts, the real measurer); axe; pan and zoom render nothing but the world group's
 * transform; a toolbar command followed by a wheel gesture continues from the command's transform. Zero policy violations, console
 * errors and foreign requests everywhere (notes E3, E10, E13).
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { clickToolbar, closeKey, openKey, selectionLine, toolbarAction } from './map-toolbar-kit';
import { DEFAULT_TRAVERSAL_LIMITS, navigatorProjection, UNCLASSIFIED_HUB_ID } from '@/core/graph';
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
function expectedCounts(): { nodes: number; paths: number; ends: readonly { from: string; to: string }[] } {
  const state = demoState();
  const projection = navigatorProjection.build(
    { state, indexes: indexEngine.build(state, 1), scopeOf: () => 'unmapped' },
    { view: 'navigator', focus: [], expansion: { expanded: [], collapsedEdgeIds: [] }, filters: { scopes: [], topicIds: [], reagentFamilies: [] }, limits: { ...DEFAULT_TRAVERSAL_LIMITS, maxNodes: NAVIGATOR_MAX_NODES, maxEdges: NAVIGATOR_MAX_EDGES } },
  );
  const paths = drawnPaths(projection);
  return { nodes: projection.nodes.length, paths: paths.length, ends: paths.map((p) => ({ from: p.from, to: p.to })) };
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
  test('shows its hubs; the quiet map draws no arrow, a focused family draws its own; the counts equal the projection; nothing leaves the origin', async ({ page }) => {
    const seen = await watch(page);
    await openNavigator(page);
    const expected = expectedCounts();
    expect(expected.nodes).toBe(16);
    // step 8.2a: Unclassified is hidden unless shown, and nothing is focused, so no arrow is drawn
    await expect(page.locator('svg [data-node-id]')).toHaveCount(expected.nodes - 1);
    await expect(page.locator('svg [data-edge-id]')).toHaveCount(0);
    await expect(page.getByText('Tap or click a family to see what it makes and what it is made from.')).toBeVisible();
    // a focused family draws the arrows that leave it and enter it, as many as the projection has paths at it (no loop, none to Unclassified)
    await hubGroup(page, 'cls_alcohols').click();
    const own = expected.ends.filter((e) => e.from !== e.to && e.from !== UNCLASSIFIED_HUB_ID && e.to !== UNCLASSIFIED_HUB_ID && (e.from === 'cls_alcohols' || e.to === 'cls_alcohols')).length;
    expect(own).toBeGreaterThan(0);
    await expect(page.locator('svg [data-edge-id]')).toHaveCount(own);
    await expect(page.getByText('Tap or click a family to see what it makes and what it is made from.')).toHaveCount(0);
    // Show brings Unclassified in
    await (await openKey(page)).getByRole('button', { name: 'Show', exact: true }).click();
    await closeKey(page);
    await expect(page.locator('svg [data-node-id]')).toHaveCount(expected.nodes);
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

  test('the inspector says in words what to pick', async ({ page }) => {
    await openNavigator(page);
    // closed by default (step 5.5a review, item g); open it to read
    await page.getByRole('button', { name: 'Show inspector' }).click();
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    await expect(inspector.getByText(/Select a family, an arrow or a reaction card/)).toBeVisible();
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
    // step 8.2a: resting on a family previews its arrows (a DOM change by design), so the gesture starts on an empty point of the drawing
    const free = await page.evaluate(({ x0, y0, w, h }) => {
      for (let y = y0 + h - 20; y > y0 + 20; y -= 20) for (let x = x0 + 20; x < x0 + w - 20; x += 20) {
        const hit = document.elementFromPoint(x, y);
        if (hit !== null && hit.closest('[data-node-id], [data-edge-id]') === null && hit.closest('svg[role="group"]') !== null) return { x, y };
      }
      return null;
    }, { x0: box.x, y0: box.y, w: box.width, h: box.height });
    if (free === null) throw new Error('no empty point on the drawing');
    const cx = free.x;
    const cy = free.y;
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
    // step 8.4b (A): one more write per frame, the zoom as a CSS variable on the svg, by which marks are sized in screen pixels
    expect([...new Set(mutations)].sort()).toEqual(['attributes:style:svg', 'attributes:transform:g#world']);
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
    // The pointer goes to whole page pixels (the browser rounds a mouse position), and the invariant is read from where it really is:
    // the drawing's own top is not on a whole pixel (step 5.5d: the legend has a second row), so the nominal offset was up to half a pixel off.
    const pointerX = Math.round(box.x + 300);
    const pointerY = Math.round(box.y + 200);
    const px = pointerX - box.x;
    const py = pointerY - box.y;
    await page.mouse.move(pointerX, pointerY);
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

const hubGroup = (page: Page, id: string) => page.locator(`svg [data-node-id="${id}"]`);
const nodeCount = (page: Page): Promise<number> => page.locator('svg [data-node-id]').count();

test.describe('selection and opening a family', () => {
  test('a click selects a hub and the inspector names it; a click on empty canvas, not a drag, clears it', async ({ page }) => {
    const seen = await watch(page);
    await openNavigator(page);
    await hubGroup(page, 'cls_aldehydes').click();
    await expect(selectionLine(page)).toHaveText(/^Selected: Aldehydes, class hub/);
    // a drag that starts on empty canvas is a pan, not a click: the selection stays
    const box = await drawing(page).boundingBox();
    if (box === null) throw new Error('the drawing has no box');
    await page.mouse.move(box.x + box.width - 20, box.y + box.height - 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 80, box.y + box.height - 60, { steps: 6 });
    await page.mouse.up();
    await expect(selectionLine(page)).toHaveText(/^Selected: Aldehydes, class hub/);
    // a click on empty canvas (the corner of the drawing) clears it
    await page.mouse.click(box.x + 6, box.y + box.height - 6);
    await expect(selectionLine(page)).toHaveText('Nothing is selected.');
    await expectClean(seen);
  });

  test('the overview does not expand: no Expand or Collapse, and a double click opens the family page without adding a node', async ({ page }) => {
    const seen = await watch(page);
    await openNavigator(page);
    await expect(page.getByRole('button', { name: 'Expand' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Collapse' })).toHaveCount(0);
    const before = await nodeCount(page);
    expect(before).toBe(15); // Unclassified is hidden unless shown (step 8.2a)
    await hubGroup(page, 'cls_aldehydes').dblclick();
    await expect(page.getByRole('region', { name: 'Family page: Aldehydes' })).toBeVisible();
    await page.getByRole('button', { name: 'Overview' }).click();
    await expect(drawing(page)).toBeVisible();
    expect(await nodeCount(page)).toBe(before);
    await expectClean(seen);
  });

  test('the toolbar opens the selected family, and says why when it cannot', async ({ page }) => {
    await openNavigator(page);
    // step 8.4e (A1): Open family lives in the Selected bar; with nothing selected the bar is the hint, so there is no button to disable
    await expect(page.getByRole('button', { name: /^Open family/ })).toHaveCount(0);
    await hubGroup(page, 'cls_alkenes').click();
    const open = await toolbarAction(page, /^Open family/);
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
    await expect(selectionLine(page)).toHaveText(/^Selected: Aldehydes, class hub/);
    await page.waitForTimeout(300);
    const again = await transformOf(page);
    expect(again.scale).toBeCloseTo(view.scale, 3);
    expect(again.x).toBeCloseTo(view.x, 0);
    expect(again.y).toBeCloseTo(view.y, 0);
    // an open family page comes back too
    await clickToolbar(page, /^Open family/);
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
    // step 8.2a: the biggest pair is a family's reactions inside itself, which no loop draws any more: the box says it in words, with the full total
    expect(biggest.from, 'the biggest pair of the generated file is a family with itself').toBe(biggest.to);
    await expect(page.locator(`svg [data-node-id="${biggest.from}"]`)).toHaveAttribute('aria-label', new RegExp(`, ${biggest.total} reactions? within the family$`));
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expectClean(seen);
  });
});
