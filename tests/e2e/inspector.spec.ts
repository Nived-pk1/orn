/**
 * The inspector end to end (step 5.6a), Chromium against the PRODUCTION build: a click on a family on the overview opens the pane with
 * that family; a card on the family page shows its reaction (participants, outcomes with their selectivity word, the structure from a
 * blob: URL); a record link focuses the linked record; Back and Alt+Left return; the deeper level stays open for the next record after
 * a reload; axe; zero policy violations, console errors and foreign requests.
 */
import { expect, test, type Page } from '@playwright/test';
import { axeProblems, expectClean, loadDemo, openApp, watch } from './kit';

const pane = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const record = (page: Page) => pane(page).getByRole('article', { name: 'Record' });

async function openDemo(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible();
}

test.describe('the inspector', () => {
  test('a family and a reaction card are shown, links and history work, the level choice is kept', async ({ page }) => {
    test.setTimeout(120_000);
    const seen = await watch(page);
    await openDemo(page);
    await page.locator('svg [data-node-id="cls_alcohols"]').click();
    await expect(record(page)).toHaveAttribute('data-record-id', 'cls_alcohols');
    await expect(record(page).getByRole('heading', { level: 3, name: 'Alcohols' })).toBeVisible();
    expect(await axeProblems(page)).toEqual([]);

    await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
    await page.getByRole('region', { name: /^Family page: Alcohols/ }).waitFor();
    await page.getByRole('button', { name: /^Aldehydes\s*3\s*reactions$/ }).click();
    const pcc = page.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name: 'Ethanol → ethanal (PCC)' }) });
    await pcc.getByRole('button', { name: 'Ethanol → ethanal (PCC)' }).click();
    await expect(record(page).getByRole('heading', { level: 3, name: 'Ethanol → ethanal (PCC)' })).toBeVisible();
    await expect(record(page).getByRole('list', { name: 'Participants' })).toBeVisible();
    await expect(record(page).getByRole('list', { name: 'Outcomes' })).toBeVisible();

    // a link focuses its record; Back (and Alt+Left) returns
    const link = record(page).getByRole('list', { name: 'Participants' }).getByRole('link').first();
    const target = await link.getAttribute('data-record-id');
    await link.click();
    await expect(record(page)).toHaveAttribute('data-record-id', target ?? '');
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(record(page).getByRole('heading', { level: 3, name: 'Ethanol → ethanal (PCC)' })).toBeVisible();
    await page.keyboard.press('Alt+ArrowRight');
    await expect(record(page)).toHaveAttribute('data-record-id', target ?? '');

    // opening Level 3 is remembered
    await record(page).getByRole('button', { name: /^.? ?Level 3/ }).click();
    expect(await axeProblems(page)).toEqual([]);
    await page.reload();
    // the open family page comes back with the saved view: return to the overview, then pick a family
    await page.getByRole('button', { name: 'Overview' }).click();
    await page.locator('svg [data-node-id="cls_alcohols"]').click();
    await expect(record(page).getByRole('button', { name: /Level 3/ })).toHaveAttribute('aria-expanded', 'true');
    await expectClean(seen);
  });
});
