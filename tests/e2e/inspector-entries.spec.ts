/**
 * Step 8.1 RR4: the inspector buttons "Show in Reagents" and "Show in Named reactions" open the matching page for that record
 * (Studio build, the demo imported as the visitor's own data; zero CSP violations).
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectClean, watch } from './kit';
import { palette, pane, searchFor } from './editor-kit';
import { changedDemo, importOwn } from './own-data-kit';

test.use({ actionTimeout: 60_000 });

async function show(page: Page, prefix: 'g' | 'n', name: string): Promise<void> {
  await page.keyboard.press('Control+K');
  await expect(palette(page)).toBeVisible();
  await searchFor(page, `${prefix}: ${name}`);
  const option = palette(page).getByRole('option', { name: new RegExp(`^${name}`, 'i') }).first();
  await expect(option).toBeVisible({ timeout: 60_000 });
  await option.click();
}

test('"Show in Reagents" and "Show in Named reactions" open that record\'s page', async ({ page }) => {
  test.setTimeout(240_000);
  const seen = await watch(page);
  await importOwn(page, changedDemo(() => undefined));

  await show(page, 'g', 'PCC');
  await pane(page).getByRole('button', { name: 'Show in Reagents' }).click();
  await expect(page.getByRole('region', { name: 'Reagents', exact: true }).getByRole('heading', { name: /PCC/ }).first()).toBeVisible();

  await show(page, 'n', 'Aldol reaction');
  await pane(page).getByRole('button', { name: 'Show in Named reactions' }).click();
  await expect(page.getByRole('region', { name: 'Named reactions', exact: true }).getByRole('heading', { name: /Aldol reaction/ }).first()).toBeVisible();
  await expectClean(seen);
});
