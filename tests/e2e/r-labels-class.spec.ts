/**
 * Generic labels on a CLASS (step 7.3a A4), the STUDIO production build, every engine. A copy of the demo is imported as the visitor's own
 * data with the class "Alcohols" given a generic structure labelled with R', X and Ar (CXSMILES). The app draws a class's generic
 * structure in the INSPECTOR (Identity level, "Structure of Alcohols"); the picture is drawn (the labels' glyphs are not compared here;
 * they are proved per label and mode by tests/integration/chem-rgroup-labels.test.ts, real RDKit).
 * Screenshot: r-labels-class-1280x800.png. The older r-labels.spec.ts (two species on Precursors cards) stays.
 */
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { shotsDir } from './editor-kit';
import { changedDemo, importOwn, recordsOf } from './own-data-kit';

const LABELLED = "*C(*)(*)O |$R';;X;Ar$|";

test('a class\'s generic structure with R\', X and Ar labels is drawn in the inspector', async ({ page }) => {
  test.setTimeout(300_000);
  const seen = await watch(page);
  const file = changedDemo((records) => {
    const one = recordsOf<{ id: string; generic?: { structure?: { format: string; value: string } } }>(records, 'class').find((c) => c.id === 'cls_alcohols');
    if (one === undefined) throw new Error('the demo has no cls_alcohols');
    one.generic = { ...(one.generic ?? {}), structure: { format: 'cxsmiles', value: LABELLED } };
  });
  await importOwn(page, file);
  await page.locator('svg [data-node-id="cls_alcohols"]').click();
  const record = page.getByRole('complementary', { name: 'Inspector' }).getByRole('article', { name: 'Record' });
  await expect(record).toHaveAttribute('data-record-id', 'cls_alcohols');
  const image = record.getByRole('img', { name: 'Structure of Alcohols' });
  await expect(image).toBeVisible({ timeout: 60_000 });
  await expect(async () => {
    const box = await image.boundingBox();
    expect(box !== null && box.width > 20 && box.height > 20).toBe(true);
  }).toPass({ timeout: 30_000 });
  expect(await axeProblems(page)).toEqual([]);
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
  await image.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/r-labels-class-1280x800.png` });
  await expectClean(seen);
});
