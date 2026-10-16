/**
 * The inspector's remaining kinds end to end (step 5.6b), Chromium against the PRODUCTION build: open Cannizzaro from its card, read
 * its related reactions, follow the stored "commonly confused with" link to the Aldol reaction, open that reaction's mechanism at its
 * variant, Back; axe at each view and zero policy violations; the inspector as the overlay drawer (1100 px) and the bottom sheet
 * (700 px) with keyboard and Esc; a class with 1,000 reactions keeps the DOM at most 60 rows. Screenshots (1280 x 800) go to
 * `screenshots/` (git-ignored).
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
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
const SHOTS = resolve(process.cwd(), 'screenshots');
const pane = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const record = (page: Page) => pane(page).getByRole('article', { name: 'Record' });

/** Opens a level only when it is closed (the deepest level opened is remembered for the next record). */
async function openLevel(page: Page, level: number): Promise<void> {
  const button = record(page).getByRole('button', { name: new RegExp(`Level ${level}`) });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
}

async function openDemo(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await openApp(page);
  await loadDemo(page);
  await expect(drawing(page)).toBeVisible();
}

test.describe('the inspector, remaining kinds', () => {
  test('Cannizzaro from its card: related reactions, the stored link to Aldol, its mechanism at a variant, Back', async ({ page }) => {
    test.setTimeout(180_000);
    mkdirSync(SHOTS, { recursive: true });
    const seen = await watch(page);
    await openDemo(page, 1280, 800);
    await page.locator('svg [data-node-id="cls_aldehydes"]').dblclick();
    await page.getByRole('region', { name: /^Family page: Aldehydes/ }).waitFor();
    await page.getByRole('button', { name: /Cannizzaro/ }).first().click();
    await expect(record(page)).toHaveAttribute('data-record-id', 'rxn_benzaldehyde-cannizzaro');
    expect(await axeProblems(page)).toEqual([]);

    await openLevel(page, 3);
    const related = record(page).getByRole('region', { name: 'Related reactions' });
    await expect(related).toBeVisible();
    const stored = related.getByRole('region', { name: 'Relationships written by a person' });
    await expect(stored.getByText(/commonly confused with/)).toBeVisible();
    await expect(related.getByRole('region', { name: 'Leads on to' })).toBeVisible();
    await related.scrollIntoViewIfNeeded();
    expect(await axeProblems(page)).toEqual([]);
    await page.screenshot({ path: resolve(SHOTS, 'inspector-related-1280x800.png') });

    await stored.getByRole('link', { name: /Aldol reaction of ethanal/ }).click();
    await expect(record(page)).toHaveAttribute('data-record-id', 'rxn_ethanal-aldol');
    await openLevel(page, 3);
    // the outcome's own link opens the mechanism at its variant (the reaction's mechanism line, in L2, names the mechanism without one)
    const mechanismLink = record(page).locator('[aria-label^="Outcome"] a[data-record-id^="mec_"]').first();
    await mechanismLink.click();
    await expect(record(page)).toHaveAttribute('data-record-id', 'mec_aldol-ethanal');
    const focused = record(page).locator('[data-variant-id][data-focused]');
    await expect(focused).toHaveCount(1);
    await expect(focused.getByRole('button', { expanded: true })).toBeVisible();
    await expect(focused.getByRole('list').first()).toBeVisible();
    expect(await axeProblems(page)).toEqual([]);
    await focused.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(SHOTS, 'inspector-mechanism-1280x800.png') });

    await record(page).getByRole('button', { name: 'Back' }).click();
    await expect(record(page)).toHaveAttribute('data-record-id', 'rxn_ethanal-aldol');
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(record(page)).toHaveAttribute('data-record-id', 'rxn_benzaldehyde-cannizzaro');
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });

  test('a curriculum record and its scope are shown in words', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page, 1280, 800);
    await page.locator('svg [data-node-id="cls_aldehydes"]').click();
    await expect(record(page)).toHaveAttribute('data-record-id', 'cls_aldehydes');
    await openLevel(page, 4);
    const curriculum = record(page).getByRole('region', { name: 'Curriculum' });
    await expect(curriculum).toBeVisible();
    await expect(curriculum.getByRole('list', { name: 'Scope under each exam version' }).getByRole('listitem').first()).toContainText(/Why: /);
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });

  for (const [width, kind] of [
    [1100, 'overlay drawer'],
    [700, 'bottom sheet'],
  ] as const) {
    test(`at ${width} px the inspector is the ${kind}: a pick opens it, the keyboard reaches its content, Esc closes it; axe`, async ({ page }) => {
      const seen = await watch(page);
      await openDemo(page, width, 800);
      await page.locator('svg [data-node-id="cls_alcohols"]').click();
      await expect(pane(page)).toBeVisible();
      await expect(record(page)).toHaveAttribute('data-record-id', 'cls_alcohols');
      expect(await page.locator('aside').evaluate((el) => getComputedStyle(el).position)).toMatch(width === 1100 ? /fixed/ : /fixed|absolute|sticky|relative/);
      expect(await page.locator('body').evaluate((b) => b.scrollWidth <= window.innerWidth)).toBe(true);
      // the keyboard reaches a record link in the pane and follows it
      const link = record(page).getByRole('link').first();
      await link.focus();
      await expect(link).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(record(page)).not.toHaveAttribute('data-record-id', 'cls_alcohols');
      await page.keyboard.press('Alt+ArrowLeft');
      await expect(record(page)).toHaveAttribute('data-record-id', 'cls_alcohols');
      expect(await axeProblems(page)).toEqual([]);
      await record(page).getByRole('button', { name: /Level 3/ }).focus();
      await page.keyboard.press('Escape');
      await expect(pane(page)).toHaveCount(0);
      await expectClean(seen);
    });
  }

  test('a class with 1,000 reactions keeps at most 60 rows in the DOM while its list scrolls', async ({ page }) => {
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
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await chooseFile(page, generatedFileWithAnchors('initial', 'hub_explosion'));
    await expect(page.getByRole('heading', { name: 'Import summary' })).toBeVisible({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/^Imported \d+ records from generated-initial-hub_explosion-anchored\.orn\.json\./)).toBeVisible({ timeout: 90_000 });
    await expect(drawing(page)).toBeVisible({ timeout: 60_000 });
    await page.locator(`svg [data-node-id="${biggest.from}"]`).click();
    await expect(record(page)).toHaveAttribute('data-record-id', biggest.from, { timeout: 60_000 });
    await openLevel(page, 3);
    const list = record(page).getByRole('list', { name: /^Reactions of this class \(\d+\)$/ });
    await list.scrollIntoViewIfNeeded();
    const total = Number(/\((\d+)\)/.exec((await list.getAttribute('aria-label')) ?? '')?.[1]);
    expect(total).toBeGreaterThanOrEqual(1000);
    let most = 0;
    for (let step = 0; step < 25; step += 1) {
      most = Math.max(most, await record(page).locator('[data-record-list] li').count());
      await record(page).locator('[data-record-list] [data-virtual-list]').last().evaluate((el) => el.scrollBy(0, Math.max(200, el.scrollHeight / 25)));
      await page.waitForTimeout(40);
    }
    expect(most, 'rows were on the page').toBeGreaterThan(0);
    expect(most, 'rows in the DOM at once').toBeLessThanOrEqual(60);
    await expectClean(seen);
  });
});
