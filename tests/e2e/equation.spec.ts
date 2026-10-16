/**
 * "Show full equation" on the Lindlar card (phone mode B, part 3), Chromium, desktop 1280 x 800, PRODUCTION build: the arrow is DRAWN (a line
 * and a head, no "→" character in it), as wide as the longer of the texts over and under it with both centred; hydrogen is written on the
 * left only (the H2 atmosphere is not repeated under the arrow); the product carries the card's own selectivity word. Screenshot:
 * screenshots/equation-1280x800.png.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { loadDemo, openApp } from './kit';

async function openLindlarCard(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await page.locator('svg [data-node-id="cls_alkenes"]').dblclick();
  await expect(page.getByRole('region', { name: 'Family page: Alkenes' })).toBeVisible();
  await page.getByRole('button', { name: /^Alkynes\s*\d+\s*reactions?$/ }).first().click();
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name: /Lindlar/ }) });
  await expect(card).toBeVisible();
  return card;
}

test('the full equation of the Lindlar card: a drawn arrow, hydrogen once, the card\'s word', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough for the screenshot; the DOM is asserted by the component tests');
  test.setTimeout(120_000);
  const card = await openLindlarCard(page);
  await card.getByText('Show full equation').click();
  const line = card.getByLabel(/^Full equation:/);
  await expect(line).toBeVisible();
  const arrow = line.locator('[data-equation-arrow]');
  await expect(arrow.locator('svg')).toBeVisible();
  await expect(arrow).not.toContainText('→');
  await expect(line).toContainText('Hydrogen');
  await expect(arrow.locator('[data-equation-below]')).not.toContainText(/H2|H₂/);
  await expect(arrow.locator('[data-equation-above]')).toContainText('Lindlar');
  await expect(line).toContainText(/\((exclusive|major|minor|trace|mixture component)\)/);
  // the drawn line is as wide as the longer of the two texts
  const widths = await arrow.evaluate((el) => {
    const w = (selector: string): number => (el.querySelector(selector) as HTMLElement).scrollWidth;
    return { arrow: el.getBoundingClientRect().width, above: w('[data-equation-above]'), below: w('[data-equation-below]'), line: (el.querySelector('[aria-hidden="true"]') as HTMLElement).getBoundingClientRect().width };
  });
  expect(widths.line).toBeGreaterThanOrEqual(Math.max(widths.above, widths.below) - 1);
  await page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' }).click(); // the import notice would cover the card
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/equation-1280x800.png' });
});
