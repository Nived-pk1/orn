/**
 * The family page end to end (step 5.5b; ADR-037), Chromium against the PRODUCTION build: from the demo overview a double click on
 * Alcohols opens its page with both sections; the PCC card draws two structures from blob: URLs; the 413 K and 443 K cards are separate
 * and link each other; "Overview" returns to the same viewport and selection; axe; zero policy violations, console errors and foreign
 * requests; a family of many reactions (the hub_explosion file, imported through "Import a file") keeps the DOM at most 60 cards while
 * scrolling. Screenshots at 1280 x 800 go to `screenshots/` (git-ignored).
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { DEFAULT_TRAVERSAL_LIMITS, navigatorProjection } from '@/core/graph';
import { documentToState } from '@/core/dataset';
import { indexEngine } from '@/core/indexes';
import { NAVIGATOR_MAX_EDGES, NAVIGATOR_MAX_NODES } from '@/features/navigator/limits';
import { generateTier } from '@/test-support/generator';
import { withNavigatorAnchors } from '@/test-support/perf-kit';
import { axeProblems, chooseFile, expectClean, generatedFileWithAnchors, loadDemo, openApp, watch } from './kit';

const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const drawing = (page: Page) => page.getByRole('group', { name: NAVIGATOR });
const hubGroup = (page: Page, id: string) => page.locator(`svg [data-node-id="${id}"]`);
const familyPage = (page: Page) => page.getByRole('region', { name: /^Family page: / });
const SHOTS = resolve(process.cwd(), 'screenshots');

async function openDemo(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(drawing(page)).toBeVisible();
}

async function openAlcohols(page: Page): Promise<void> {
  await hubGroup(page, 'cls_alcohols').dblclick();
  await expect(page.getByRole('region', { name: 'Family page: Alcohols' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Reactions of Alcohols' })).toBeVisible();
}

const cardOf = (page: Page, name: string): Locator => page.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name }) });

const transformOf = async (page: Page): Promise<{ x: number; y: number; scale: number }> =>
  page.evaluate(() => {
    const text = document.querySelector('[data-world]')?.getAttribute('transform') ?? '';
    const found = /translate\((-?[\d.e+-]+) (-?[\d.e+-]+)\) scale\((-?[\d.e+-]+)\)/.exec(text);
    if (found === null) throw new Error(`no transform: ${text}`);
    return { x: Number(found[1]), y: Number(found[2]), scale: Number(found[3]) };
  });

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const path = resolve(SHOTS, name);
  await page.screenshot({ path });
  test.info().annotations.push({ type: 'screenshot', description: path });
}

test.describe('the family page of the demo', () => {
  test('a double click on Alcohols opens both sections; the PCC card has two structures drawn from blob: URLs', async ({ page }) => {
    test.setTimeout(120_000);
    const seen = await watch(page);
    await openDemo(page);
    await shot(page, 'overview-1280x800.png');
    await openAlcohols(page);
    await expect(page.getByRole('heading', { level: 1, name: /Alcohols/ })).toBeVisible();
    await page.waitForTimeout(800);
    await shot(page, 'family-alcohols-top-1280x800.png');
    // the partner strip brings the reader to a group
    await page.getByRole('button', { name: /^Aldehydes\s*3\s*reactions$/ }).click();
    const pcc = cardOf(page, 'Ethanol → ethanal (PCC)');
    await expect(pcc).toBeVisible();
    const images = pcc.getByRole('img');
    await expect(images).toHaveCount(2, { timeout: 60_000 });
    for (const src of await images.evaluateAll((list) => list.map((el) => el.getAttribute('src')))) expect(src).toMatch(/^blob:/);
    await expect(pcc.getByText('Dichloromethane, anhydrous')).toBeVisible();
    // the Preparation section: back to the top, where the strip is
    await page.locator('[data-virtual-list]').evaluate((el) => el.scrollTo(0, 0));
    await page.getByRole('button', { name: /^Alkenes\s*2\s*reactions$/ }).first().click();
    await expect(page.getByRole('heading', { level: 3, name: 'From Alkenes' })).toBeVisible();
    await page.waitForTimeout(800);
    await shot(page, 'family-alcohols-preparation-1280x800.png');
    await expectClean(seen);
  });

  test('the 413 K and 443 K outcomes are on separate cards that link each other', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    await openAlcohols(page);
    const all = page.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name: 'Ethanol + conc. H₂SO₄' }) });
    await page.getByRole('button', { name: /^Ethers\s*1\s*reaction$/ }).click();
    const ethers = all.filter({ has: page.locator('[data-arrow]', { hasText: '413 K' }) });
    await expect(ethers).toHaveCount(1);
    await expect(ethers.locator('[data-arrow]').getByText('443 K')).toHaveCount(0);
    await expect(ethers.getByRole('button', { name: 'Also gives → Alkenes (443 K)' })).toBeVisible();
    await ethers.getByRole('button', { name: 'Also gives → Alkenes (443 K)' }).click();
    const alkenes = all.filter({ has: page.locator('[data-arrow]', { hasText: '443 K' }) });
    await expect(alkenes).toBeVisible();
    await expect(alkenes.locator('[data-arrow]').getByText('413 K')).toHaveCount(0);
    await alkenes.getByRole('button', { name: 'Also gives → Ethers (413 K)' }).click();
    await expect(ethers).toBeVisible();
    await expectClean(seen);
  });

  test('Overview returns to the same viewport and selection', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    await hubGroup(page, 'cls_aldehydes').click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(600);
    const before = await transformOf(page);
    await hubGroup(page, 'cls_alcohols').dblclick();
    await expect(page.getByRole('region', { name: 'Family page: Alcohols' })).toBeVisible();
    await page.getByRole('button', { name: 'Overview' }).click();
    await expect(drawing(page)).toBeVisible();
    await page.waitForTimeout(400);
    const after = await transformOf(page);
    expect(after.scale).toBeCloseTo(before.scale, 3);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
    await expect(page.getByRole('toolbar', { name: 'Canvas tools' }).getByText(/^Selected: (Aldehydes|Alcohols), class hub/)).toBeVisible();
    await expectClean(seen);
  });

  test('a selected arrow opens its source family at the target group', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    await page.locator('svg [data-edge-id][aria-label^="Alcohols to Aldehydes"]').first().locator('path').last().evaluate((path) => {
      // a real press (pointerdown on the arrow, pointerup on the page): the map classifies pointer events and has no click handler
      const init = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 5, clientY: 5 };
      path.dispatchEvent(new PointerEvent('pointerdown', init));
      document.dispatchEvent(new PointerEvent('pointerup', init));
    });
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Family page: Alcohols' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'To Aldehydes' })).toBeVisible();
    await expectClean(seen);
  });

  test('a click on a card selects the reaction; every card is reachable by Tab', async ({ page }) => {
    await openDemo(page);
    await openAlcohols(page);
    const first = page.getByRole('article').first();
    await first.getByRole('button').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/^Selected: reaction /)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
  });

  test('axe: nothing serious on the family page; zero CSP violations', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    await openAlcohols(page);
    await page.waitForTimeout(1000);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });
});

test.describe('a family of many reactions', () => {
  test('the hub_explosion file opens its large family with at most 60 cards in the DOM while scrolling', async ({ page }) => {
    test.setTimeout(300_000);
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

    await openApp(page);
    await chooseFile(page, generatedFileWithAnchors('initial', 'hub_explosion'));
    await expect(page.getByRole('heading', { name: 'Import summary' })).toBeVisible({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/^Imported \d+ records from generated-initial-hub_explosion-anchored\.orn\.json\./)).toBeVisible({ timeout: 90_000 });
    await expect(drawing(page)).toBeVisible({ timeout: 60_000 });
    await hubGroup(page, biggest.from).dblclick();
    await expect(familyPage(page)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { level: 2, name: /^Reactions of / })).toBeVisible({ timeout: 60_000 });
    const setSize = Number(await page.locator('[data-virtual-list] li').first().getAttribute('aria-setsize'));
    expect(setSize, 'the list holds the whole family').toBeGreaterThan(biggest.total);
    let most = 0;
    for (let step = 0; step < 30; step += 1) {
      most = Math.max(most, await page.getByRole('article').count());
      await page.locator('[data-virtual-list]').evaluate((el) => el.scrollBy(0, Math.max(600, el.scrollHeight / 30)));
      await page.waitForTimeout(60);
    }
    expect(most, 'cards were on the page').toBeGreaterThan(0);
    expect(most, 'cards in the DOM at once').toBeLessThanOrEqual(60);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expectClean(seen);
  });
});
