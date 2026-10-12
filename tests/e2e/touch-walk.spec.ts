/**
 * The touch walk (step 5.10a; the Phase 5 definition of done), Chromium and WebKit with touch emulation, against the PRODUCTION build,
 * with taps only (`touchscreen.tap`, the one touch call both engines have): from the first-run screen load the demo, tap a family (it is
 * selected and the inspector opens), tap twice (its page opens), tap a card's name (the inspector shows the reaction), return with the
 * Overview button, switch to the List view and back, open the palette from its button, run a search, and open the export dialog from
 * the File menu. Multi-touch (a pinch, a drag) needs CDP and is covered in Chromium by canvas-touch.spec.ts; Playwright's WebKit has no
 * call for it. Zero policy violations, console errors, dialogs and foreign requests.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectClean, openApp, watch } from './kit';

test.use({ hasTouch: true, viewport: { width: 1280, height: 800 } });

const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const record = (page: Page) => page.getByRole('complementary', { name: 'Inspector' }).getByRole('article', { name: 'Record' });

/** The middle of a hub once the page has stopped moving (the pane opens and the drawing shifts): two equal reads in a row. */
async function centreOf(page: Page, id: string): Promise<{ x: number; y: number }> {
  let previous = '';
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const box = await page.locator(`svg [data-node-id="${id}"]`).boundingBox();
    if (box === null) throw new Error(`${id} is not drawn`);
    const now = `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)}`;
    if (now === previous) return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    previous = now;
    await page.waitForTimeout(250);
  }
  throw new Error(`${id} keeps moving`);
}

test.describe('the touch walk', () => {
  test('taps reach the whole product: load, select, open a family, a card, the List view, the palette and the export dialog', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'the step specifies the touch walk for Chromium and WebKit');
    test.setTimeout(240_000);
    const seen = await watch(page);
    await openApp(page);
    await page.getByRole('button', { name: 'Load demo dataset' }).tap();
    await expect(page.getByText(/^Imported \d+ records from demo\.orn\.json\./)).toBeVisible();
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();

    const alcohols = await centreOf(page, 'cls_alcohols');
    await page.touchscreen.tap(alcohols.x, alcohols.y);
    await expect(record(page)).toHaveAttribute('data-record-id', 'cls_alcohols', { timeout: 30_000 });
    const again = await centreOf(page, 'cls_alcohols');
    await page.touchscreen.tap(again.x, again.y);
    await page.touchscreen.tap(again.x, again.y);
    await expect(page.getByRole('region', { name: 'Family page: Alcohols' })).toBeVisible();

    await page.getByRole('button', { name: /^Aldehydes\s*3\s*reactions$/ }).tap();
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name: 'Ethanol → ethanal (PCC)' }) });
    await card.getByRole('button', { name: 'Ethanol → ethanal (PCC)' }).tap();
    await expect(record(page)).toHaveAttribute('data-record-id', 'rxn_ethanol-to-ethanal-pcc');

    await page.getByRole('button', { name: 'Overview' }).tap();
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
    const list = page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button', { name: 'List' });
    await list.tap();
    await expect(page.getByRole('table', { name: 'Families' })).toBeVisible();
    await list.tap();
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();

    await page.getByRole('button', { name: 'Search' }).tap();
    const palette = page.getByRole('dialog', { name: 'Search' });
    await expect(palette).toBeVisible();
    await palette.getByRole('combobox').fill('ethanol');
    await expect(palette.getByRole('status')).not.toHaveText('Search is starting');
    await expect(palette.getByRole('option').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();

    await page.getByRole('button', { name: 'File' }).tap();
    await page.getByRole('menuitem', { name: /Export\.\.\./ }).tap();
    await expect(page.getByRole('dialog', { name: 'Export your data' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Export your data' }).getByRole('button', { name: 'Cancel' }).tap();
    await expect(page.getByRole('dialog', { name: 'Export your data' })).toBeHidden();
    await expectClean(seen);
  });
});
