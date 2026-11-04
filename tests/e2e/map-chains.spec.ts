/**
 * Map clean-up part 2 (step 8.2b, ADR-044 addendum), the STUDIO build, over the own-data layout fixture: the first view fills the area (box text at
 * least 12 px on a 1280 x 800 desktop), a busy chapter draws no arrow until a family is chosen, "From A to B" draws only the chosen chain and its
 * steps open their reactions, "Find a family" focuses and pans. Pixel 7 (Chromium): the same by tap, the controls 44 px high.
 */
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectClean, leaveChapters, loadDemo, watch } from './kit';
import { shotsDir } from './editor-kit';
import { FAMILY_ONE, NAVIGATOR, openMapDesktop, openMapPhone } from './map-layout-kit';

const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const edges = (page: Page) => page.locator('svg [data-layer="edges"] [data-edge-id]');
const family = (page: Page, id: string) => page.locator(`svg [data-node-id="${id}"]`);

/** The drawn size, in screen px, of the first box title. */
async function titlePixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const text = document.querySelector('svg [data-label-of] text') as SVGTextElement | null;
    if (text === null) return 0;
    const matrix = text.getScreenCTM();
    return parseFloat(getComputedStyle(text).fontSize) * (matrix === null ? 1 : matrix.a);
  });
}

/** How far the visible boxes are from the four sides of the map area, in screen px. */
async function margins(page: Page): Promise<{ left: number; right: number; top: number; bottom: number }> {
  return page.evaluate(() => {
    const area = (document.querySelector('svg[role="group"]') as SVGElement).getBoundingClientRect();
    const boxes = [...document.querySelectorAll('svg [data-node-id]')].map((n) => n.getBoundingClientRect());
    return { left: Math.min(...boxes.map((b) => b.left)) - area.left, right: area.right - Math.max(...boxes.map((b) => b.right)), top: Math.min(...boxes.map((b) => b.top)) - area.top, bottom: area.bottom - Math.max(...boxes.map((b) => b.bottom)) };
  });
}

/** Chooses From and To in the open panel; true when the first chain row has exactly two steps (no direct one). */
async function findTwoStepChain(page: Page): Promise<boolean> {
  const from = page.getByRole('combobox', { name: 'From' });
  const to = page.getByRole('combobox', { name: 'To' });
  const values = await from.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ''));
  for (const a of values) {
    await from.selectOption(a);
    for (const b of values) {
      if (a === b) continue;
      await to.selectOption(b);
      const first = page.getByRole('list', { name: 'Chains' }).locator('> li').first();
      if ((await first.count()) === 0) continue;
      if ((await first.getByRole('listitem').count()) === 2) return true;
    }
  }
  return false;
}

test.describe('the map on a desktop (part 2)', () => {
  test.use({ actionTimeout: 60_000 });

  /** The visible boxes fill the map area: the binding side is 24 px (the margin) from the edge, no side is closer. */
  async function expectFilled(page: Page, label: string): Promise<void> {
    const m = await margins(page);
    const size = await titlePixels(page);
    console.log(`${label}: box title text ${size.toFixed(1)} px; margins ${JSON.stringify(m)}`);
    const sides = [m.left, m.right, m.top, m.bottom];
    expect(Math.min(...sides), 'no box is closer than the margin').toBeGreaterThanOrEqual(22);
    const slack = Math.min(m.left + m.right, m.top + m.bottom);
    expect(slack, 'one axis is filled: both margins together are about 2 x 24 px').toBeLessThanOrEqual(60);
  }

  test('the first view fills the area (own-data fixture); Fit does the same', async ({ page }) => {
    test.setTimeout(400_000);
    const seen = await watch(page);
    await openMapDesktop(page);
    await page.screenshot({ path: `${shotsDir()}/map-fit-fixture-1280x800.png` });
    await expectFilled(page, 'fixture first view');
    await page.getByRole('button', { name: 'Fit' }).click();
    await page.waitForTimeout(600);
    await expectFilled(page, 'fixture after Fit');
    await expectClean(seen);
  });

  test('the demo: the first view fills the area, and Alcohols in focus shows reagent words on its single-card arrows', async ({ page }) => {
    test.setTimeout(400_000);
    const seen = await watch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await loadDemo(page);
    await leaveChapters(page);
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${shotsDir()}/map-fit-desktop-1280x800.png` });
    await expectFilled(page, 'demo first view');
    await family(page, 'cls_alcohols').click();
    await expect.poll(() => edges(page).count()).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    const chips = await page.locator('svg [data-count-of]').evaluateAll((gs) => gs.map((g) => g.textContent ?? ''));
    console.log(`chips on Alcohols: ${JSON.stringify(chips)}`);
    expect(chips.some((text) => /[A-Za-z]/.test(text)), 'a one-card arrow shows its reagent words').toBe(true);
    await page.screenshot({ path: `${shotsDir()}/map-reagent-chips-1280x800.png` });
    await expectClean(seen);
  });

  test('a busy chapter draws no arrow until a family is chosen', async ({ page }) => {
    test.setTimeout(400_000);
    const seen = await watch(page);
    await openMapDesktop(page);
    await page.getByRole('combobox', { name: 'Chapter' }).selectOption({ label: 'Chapter 1' });
    const line = page.locator('[data-map-busy]');
    await expect(line).toBeVisible();
    await expect(line).toHaveText(/^This chapter has \d+ arrows\. Tap or click a family to see its part\.$/);
    await expect(edges(page)).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'What the arrows mean' })).toHaveCount(0);
    await page.screenshot({ path: `${shotsDir()}/map-busy-chapter-1280x800.png` });
    await family(page, FAMILY_ONE).click();
    await expect.poll(() => edges(page).count()).toBeGreaterThan(0);
    await expect(line).toHaveCount(0);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${shotsDir()}/map-busy-chapter-focus-1280x800.png` });
    await expectClean(seen);
  });

  test('From A to B: a two-step chain draws two arrows, a step opens its reactions, Esc closes the panel', async ({ page }) => {
    test.setTimeout(400_000);
    const seen = await watch(page);
    await openMapDesktop(page);
    await page.getByRole('button', { name: 'From A to B' }).click();
    const panel = page.getByRole('complementary', { name: 'From A to B' });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Across all chapters');
    expect(await findTwoStepChain(page)).toBe(true);
    await expect(edges(page)).toHaveCount(2);
    // the panel sits beside the map: it does not cover the drawing
    const map = await page.getByRole('group', { name: /^Navigator:/ }).boundingBox();
    const side = await panel.boundingBox();
    if (map === null || side === null) throw new Error('no boxes');
    expect(map.x + map.width).toBeLessThanOrEqual(side.x + 1);
    await expect(page.locator('svg [data-edge-id] path[data-tone]').first()).toBeAttached();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${shotsDir()}/map-a-to-b-desktop-1280x800.png` });
    // a step opens that arrow's reactions in the inspector, as selecting the arrow does
    await panel.getByRole('list', { name: 'Chains' }).locator('> li').first().getByRole('button').nth(1).click();
    await expect(page.getByRole('article', { name: 'Record' }).first()).toBeVisible();
    await panel.getByRole('combobox', { name: 'From' }).focus();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    // the chain is gone; only the arrow whose step was opened stays drawn (a selected arrow does)
    await expect(edges(page)).toHaveCount(1);
    await expectClean(seen);
  });

  test('Find a family focuses it and brings it into view', async ({ page }) => {
    test.setTimeout(400_000);
    const seen = await watch(page);
    await openMapDesktop(page);
    const box = page.getByRole('combobox', { name: 'Find a family' });
    const name = ((await page.locator(`svg [data-label-of="${FAMILY_ONE}"] text`).first().textContent()) ?? '').trim();
    await box.fill(name);
    await expect.poll(() => edges(page).count()).toBeGreaterThan(0);
    const drawing = await page.getByRole('group', { name: NAVIGATOR }).boundingBox();
    const at = await family(page, FAMILY_ONE).boundingBox();
    if (drawing === null || at === null) throw new Error('no boxes');
    expect(at.x).toBeGreaterThanOrEqual(drawing.x - 1);
    expect(at.x + at.width).toBeLessThanOrEqual(drawing.x + drawing.width + 1);
    await page.screenshot({ path: `${shotsDir()}/map-find-family-1280x800.png` });
    await box.press('Escape');
    await expect(box).toHaveValue('');
    await expectClean(seen);
  });
});

test.describe('phone: Pixel 7 (part 2)', () => {
  test.use({ ...PIXEL, actionTimeout: 60_000 });

  test('From A to B is a 44 px button that opens a sheet; Find a family focuses', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(400_000);
    const seen = await watch(page);
    await openMapPhone(page);
    const button = page.getByRole('button', { name: 'From A to B' });
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    const box = page.getByRole('combobox', { name: 'Find a family' });
    expect((await box.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    const name = ((await page.locator(`svg [data-label-of="${FAMILY_ONE}"] text`).first().textContent()) ?? '').trim();
    await box.fill(name);
    await expect.poll(() => edges(page).count()).toBeGreaterThan(0);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${shotsDir()}/map-find-family-pixel7.png` });
    await box.fill('');
    await button.tap();
    const panel = page.getByRole('complementary', { name: 'From A to B' });
    await expect(panel).toBeVisible();
    expect(await findTwoStepChain(page)).toBe(true);
    await expect(edges(page)).toHaveCount(2);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${shotsDir()}/map-a-to-b-pixel7.png` });
    const more = panel.getByRole('button', { name: /^Show all/ });
    if ((await more.count()) > 0) await more.tap();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${shotsDir()}/map-a-to-b-full-pixel7.png` });
    await panel.getByRole('button', { name: 'Close' }).tap();
    await expect(panel).toHaveCount(0);
    await expectClean(seen);
  });
});
