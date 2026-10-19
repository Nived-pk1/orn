/**
 * Outcome groups on the family card and in the full equation (outcome groups step, part 2), PRODUCTION build, three engines, desktop
 * 1280 x 800. The E2 reaction ((R)-2-bromobutane + alc. KOH, a major and a minor outcome under the same conditions) is ONE scheme: the
 * reactant and the arrow once, a tile for each product with its word under it ("major · Saytzeff"), ONE "Show full equation" whose open
 * panel has a border and its own tone and holds both products with their words. The aldol reaction (two variants) shows two bordered
 * groups headed by their conditions. No security-policy violation; axe. Chromium takes the screenshots:
 * screenshots/outcomes-e2-1280x800.png, outcomes-e2-equation-1280x800.png, outcomes-ethanol-h2so4-1280x800.png, outcomes-aldol-1280x800.png.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, loadDemo, openApp, watch } from './kit';
import { box, findCard, shot } from './outcome-kit';

async function openFamily(page: Page, node: string, name: RegExp): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await page.locator(`svg [data-node-id="${node}"]`).dblclick();
  await expect(page.getByRole('region', { name })).toBeVisible();
  await page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' }).click(); // the import notice would cover the card
}

test('E2: one scheme for the major and the minor outcome, the words under the tiles, one full equation in a bordered panel', async ({ page, browserName }) => {
  test.setTimeout(300_000);
  const seen = await watch(page);
  await openFamily(page, 'cls_haloalkanes', /^Family page: Haloalkanes/);
  const card = await findCard(page, /alc\. KOH/);

  // the reactant once, the arrow once, a tile for each product with its word under it, the major on top, right of the arrow
  await expect(card.locator('[data-substance-id="spc_r-2-bromobutane"]')).toHaveCount(1);
  await expect(card.locator('[data-arrow]')).toHaveCount(1);
  const major = card.locator('[data-outcome-id] [data-substance-id="spc_but-2-ene"]');
  const minor = card.locator('[data-outcome-id] [data-substance-id="spc_but-1-ene"]');
  await expect(major.locator('figcaption')).toContainText('major · Saytzeff');
  await expect(minor.locator('figcaption')).toContainText('minor · Hofmann');
  const [top, bottom, arrow] = [await box(major), await box(minor), await box(card.locator('[data-arrow]'))];
  expect(top.y, 'the major is above the minor').toBeLessThan(bottom.y);
  expect(Math.abs(top.x - bottom.x), 'one column').toBeLessThan(4);
  expect(top.x, 'right of the arrow').toBeGreaterThan(arrow.x + arrow.width - 1);
  await expect(card.getByText('Show full equation')).toHaveCount(1);
  if (browserName === 'chromium') await shot(page, card, 'outcomes-e2-1280x800.png');

  // the full equation: both products with their words, in a panel with a light border and its own tone
  await card.getByText('Show full equation').click();
  const panel = card.locator('details[data-equation-panel]');
  const scheme = panel.getByRole('group', { name: 'Full equation' });
  await expect(scheme).toBeVisible();
  await expect(scheme.locator('[data-equation-word]')).toHaveText(['(major · Saytzeff)', '(minor · Hofmann)']);
  await expect(scheme.locator('[data-equation-term]')).toHaveCount(3); // the reactant and the two products; KOH is on the arrow
  const look = await panel.evaluate((element) => {
    const style = getComputedStyle(element);
    const parent = getComputedStyle(element.parentElement as Element).backgroundColor;
    return { width: style.borderTopWidth, style: style.borderTopStyle, background: style.backgroundColor, around: parent, article: getComputedStyle(element.closest('article') as Element).backgroundColor };
  });
  expect(look.width).toBe('1px');
  expect(look.style).toBe('solid');
  expect(look.background, 'a paper tone of its own').not.toBe(look.article);
  const sentence = await scheme.evaluate((element) => document.getElementById(element.getAttribute('aria-describedby') as string)?.textContent);
  expect(sentence).toBe('(R)-2-bromobutane with alc. KOH, heat, basic medium gives But-2-ene (major) and But-1-ene (minor)');
  await expect(scheme.getByText('Drawing the structure…')).toHaveCount(0, { timeout: 60_000 });
  if (browserName === 'chromium') await shot(page, panel, 'outcomes-e2-equation-1280x800.png');
  expect(await axeProblems(page), 'axe').toEqual([]);
  await expectClean(seen);
});

test('aldol: two outcome groups, each in a bordered block headed by its conditions, each with its own arrow and equation', async ({ page, browserName }) => {
  test.setTimeout(300_000);
  const seen = await watch(page);
  await openFamily(page, 'cls_aldehydes', /^Family page: Aldehydes/);
  const card = await findCard(page, /Aldol/);
  const blocks = card.locator('section[data-outcome-group]');
  await expect(blocks).toHaveCount(2);
  await expect(blocks.locator('h5')).toHaveText(['Base-catalysed (dilute NaOH, cold)', 'Acid-catalysed']);
  for (const block of await blocks.all()) {
    await expect(block.locator('[data-substance-id="spc_ethanal"]')).toHaveCount(1);
    await expect(block.getByText('Show full equation')).toHaveCount(1);
    expect(await block.evaluate((element) => getComputedStyle(element).borderTopWidth), 'bordered').toBe('1px');
  }
  if (browserName === 'chromium') await shot(page, card, 'outcomes-aldol-1280x800.png');
  expect(await axeProblems(page), 'axe').toEqual([]);
  await expectClean(seen);
});

test('ethanol + conc. H2SO4: each temperature on its own card, joined by "Also gives"; the card is as before', async ({ page, browserName }) => {
  test.setTimeout(300_000);
  const seen = await watch(page);
  await openFamily(page, 'cls_alcohols', /^Family page: Alcohols/);
  const first = await findCard(page, /Ethanol \+ conc\. H/);
  await expect(first.locator('section[data-outcome-group]')).toHaveCount(0);
  await expect(first.locator('[data-outcome-id]')).toHaveCount(1);
  await expect(first.getByRole('button', { name: /^Also gives → (Alkenes|Ethers)/ })).toBeVisible();
  if (browserName === 'chromium') await shot(page, first, 'outcomes-ethanol-h2so4-1280x800.png');
  await first.getByText('Show full equation').click();
  await expect(first.locator('details[data-equation-panel]').getByRole('group', { name: 'Full equation' })).toBeVisible();
  await expectClean(seen);
});
