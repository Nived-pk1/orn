/**
 * Studio (step 8.1 Part F): the same layout on top, then a closed "For authors" holding the old levels, the provenance and the raw record.
 * STUDIO build. Screenshot: inspector-studio-for-authors-1280x800.png.
 */
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { openAuthors, openDemo, record, shotsDir, showRecord } from './editor-kit';

test('"For authors" is closed, then holds the levels, provenance and the raw record', async ({ page }) => {
  test.setTimeout(240_000);
  const seen = await watch(page);
  await openDemo(page);
  await showRecord(page, 'r', 'Ethanol → ethanal (PCC)', 'rxn_ethanol-to-ethanal-pcc');
  await expect(record(page).getByRole('button', { name: /For authors/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(record(page).getByText(/Level 2/)).toHaveCount(0);
  await expect(record(page).locator('[data-hero]').first()).toBeVisible();
  await openAuthors(page);
  await expect(record(page).getByRole('button', { name: /Level 2: What happens/ })).toBeVisible();
  await expect(record(page).getByRole('list', { name: 'Participants' })).toBeVisible();
  await record(page).getByRole('button', { name: /Level 5/ }).click();
  await expect(record(page).getByLabel('Raw record')).toBeVisible();
  expect(await axeProblems(page, 10)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/inspector-studio-for-authors-1280x800.png` });
  await expectClean(seen);
});
