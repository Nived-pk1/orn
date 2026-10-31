/**
 * "As written in this reaction" (step 7.3b A5), the STUDIO production build, every engine: a generic Hinsberg-style reaction whose class
 * product has `originalText` "C₆H₅–SO₂–NHR". Its card (here on the chapter page) draws that text in the product's box and keeps the class
 * name under it; the open full equation does the same; the inspector says "as written: ..."; the editor labels the field "As written in
 * this reaction". Axe, zero CSP violations. Screenshot: hinsberg-as-written-1280x800.png.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { record, shotsDir } from './editor-kit';
import { importOwn } from './own-data-kit';
import { CHAPTER_A, chaptersDemo, HINSBERG, WRITTEN } from './chapters-kit';

test.use({ actionTimeout: 60_000 });
const view = (page: Page) => page.getByRole('region', { name: 'Chapters', exact: true });

test('the class boxes show the text as written, the class name stays, the inspector says "as written"', async ({ page }) => {
  test.setTimeout(300_000);
  const seen = await watch(page);
  await importOwn(page, chaptersDemo());
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Chapters' }).click();
  await view(page).getByRole('button', { name: CHAPTER_A }).click();
  await view(page).getByLabel('Find in this chapter').fill('hinsberg');
  const card = view(page).locator('article[data-reaction-id="rxn_zz-hinsberg"]');
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card.getByRole('heading', { level: 4, name: HINSBERG })).toBeVisible();
  const boxes = card.locator('[data-written-as]');
  await expect(boxes).toHaveCount(2);
  await expect(boxes.first()).toHaveText('R–NH₂');
  await expect(boxes.last()).toHaveText(WRITTEN);
  await expect(card.locator('figcaption', { hasText: 'Sulfonamides' })).toBeVisible(); // the class name stays under the box
  await card.getByText('Show full equation').click();
  await expect(card.getByRole('group', { name: 'Full equation' })).toContainText(WRITTEN);
  expect(await axeProblems(page)).toEqual([]);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/hinsberg-as-written-1280x800.png` });

  // the inspector lists it as written
  await card.getByRole('button', { name: HINSBERG }).click();
  await expect(record(page)).toHaveAttribute('data-record-id', 'rxn_zz-hinsberg');
  const closed = record(page).getByRole('button', { name: /^Level/, expanded: false });
  for (let left = await closed.count(); left > 0; left = await closed.count()) await closed.first().click();
  await expect(record(page)).toContainText(`as written: ${WRITTEN}`);
  await expectClean(seen);
});
