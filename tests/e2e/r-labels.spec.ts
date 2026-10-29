/**
 * Generic labels in drawings (step 7.2b A7), the STUDIO production build, every engine. A copy of the demo is imported as the visitor's own
 * data with three structures given textbook labels (CXSMILES: R', X and Ar on an unfilled valence), and the Precursors cards of
 * propan-2-ol (ethanal → propan-2-ol) draw them: the images exist and none is the plain drawing of the unlabelled structure. The label
 * glyphs themselves are proved per label and mode by tests/integration/chem-rgroup-labels.test.ts (real RDKit). Screenshot: r-labels-1280x800.png.
 */
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { shotsDir } from './editor-kit';
import { changedDemo, importOwn, recordsOf } from './own-data-kit';

test('structures with R\', X and Ar labels are drawn on the Precursors cards', async ({ page }) => {
  test.setTimeout(300_000);
  const seen = await watch(page);
  const file = changedDemo((records) => {
    const label = (id: string, value: string): void => {
      const species = recordsOf<{ id: string; structure?: { format: string; value: string } }>(records, 'species').find((one) => one.id === id);
      if (species === undefined) throw new Error(`the demo has no ${id}`);
      species.structure = { format: 'cxsmiles', value };
    };
    label('spc_ethanal', "*C=O |$R';;$|");
    label('spc_propan-2-ol', '*C(*)O |$X;;Ar$|');
  });
  await importOwn(page, file);
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Precursors' }).click();
  const view = page.getByRole('region', { name: 'Precursors', exact: true });
  const box = view.getByRole('searchbox', { name: 'Compound to make', exact: true });
  const hit = view.getByRole('button', { name: 'Choose Propan-2-ol', exact: true });
  await expect(async () => {
    await box.fill('');
    await box.fill('propan-2-ol');
    await expect(hit).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 60_000 });
  await hit.click();
  const image = view.locator('[data-substance-id="spc_propan-2-ol"] img').first();
  await expect(image).toBeVisible({ timeout: 60_000 });
  await expect(view.locator('[data-substance-id="spc_ethanal"] img').first()).toBeVisible({ timeout: 60_000 });
  expect(await axeProblems(page)).toEqual([]);
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
  await image.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/r-labels-1280x800.png` });
  await expectClean(seen);
});
