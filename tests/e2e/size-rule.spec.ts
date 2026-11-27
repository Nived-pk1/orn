/**
 * Step 8.5d, second pass 8.5e: ONE size rule for structure drawings, formulas and names; the standards are per context (family 28, equation 34,
 * hero 40, mechanism 36 px per bond) and labels are 13 px in every context (never under 11 px), set apart from the bond length. The awkward set
 * (awkward-set.ts) is drawn in the family page's Structure boxes, the full equation and the inspector (desktop 1280 x 800 and Pixel 7), and nothing
 * may be clipped, every drawing carries `data-bond-px` between the floor (85 %) and its context's standard, no label is under 11 px. The test's own
 * data; the demo is never edited. The checks are in size-rule-kit.ts.
 */
import { devices } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectClean, openApp, openPhoneApp, watch } from './kit';
import { pane, shotsDir, showRecord } from './editor-kit';
import { AWKWARD, reactionId, reactionName } from './awkward-set';
import { importAwkward, problemsIn, setStructures, walkFamily } from './size-rule-kit';

const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

test('desktop 1280 x 800: the awkward set obeys the one size rule (family page, full equation)', async ({ page }) => {
  test.setTimeout(280_000);
  const seen = await watch(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await importAwkward(page);
  await page.locator('svg [data-node-id="cls_aldehydes"]').dblclick();
  await expect(page.getByRole('region', { name: /^Family page: Aldehydes/ })).toBeVisible();
  const found = await walkFamily(page, 'skeletal', false);
  await setStructures(page, 'Full');
  found.push(...(await walkFamily(page, 'all atoms', false, true)));
  await page.screenshot({ path: `${shotsDir()}/8.5e/awkward-desktop-light.png` });
  expect(found).toEqual([]);
  await expectClean(seen);
});

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('the awkward set obeys the one size rule (family page, stacked equation)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(280_000);
    const seen = await watch(page);
    await openPhoneApp(page);
    await importAwkward(page);
    await page.getByRole('button', { name: /^Aldehydes/ }).tap();
    await expect(page.getByRole('region', { name: /^Family page: Aldehydes/ })).toBeVisible();
    const found = await walkFamily(page, 'phone', true);
    await page.screenshot({ path: `${shotsDir()}/8.5e/awkward-pixel7-light.png` });
    expect(found).toEqual([]);
    await expectClean(seen);
  });
});


for (const scheme of ['light', 'dark'] as const) {
  test(`desktop ${scheme}: the inspector's picture (hero) obeys the one size rule for every awkward reaction`, async ({ page }) => {
    test.setTimeout(280_000);
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await importAwkward(page);
    const found: string[] = [];
    for (const item of AWKWARD) {
      await showRecord(page, 'r', reactionName(item), reactionId(item));
      const hero = pane(page).locator('[data-hero-equation]:not([data-compact])');
      await expect(hero).toBeVisible();
      await expect(hero.getByText('Drawing the structure…')).toHaveCount(0, { timeout: 60_000 });
      await page.waitForTimeout(600);
      for (const p of await problemsIn(hero)) found.push(`inspector ${item.label}: ${p}`);
      if ([4, 5, 7, 9].includes(item.n)) await page.screenshot({ path: `${shotsDir()}/8.5e/awkward-inspector-${item.n}-${scheme}.png` });
    }
    expect(found).toEqual([]);
  });
}
