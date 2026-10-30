/**
 * Numbered stages on the arrow (step 7.3a D1 to D3), the STUDIO production build, every engine. A changed copy of the demo is imported as the
 * visitor's own data (it adds a THREE-stage Grignard reaction). In the Reactions view:
 *  (1) the demo's two-stage Grignard card reads "(i) CH3MgBr (ii) H3O+" above the arrow (CH3MgBr is a reactant the card does not draw) and
 *      "(i) ... (ii) acidic medium" under it;
 *  (2) the three-stage card numbers (i), (ii), (iii) on both sides, and each condition keeps the numeral of its stage;
 *  (3) the full equation draws the reactants itself, so its arrow numbers only what it does not draw;
 *  (4) a one-stage reaction is unchanged (no numerals); axe; zero policy violations.
 * Screenshots: stages-arrow-grignard-1280x800.png, stages-arrow-three-1280x800.png.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { shotsDir } from './editor-kit';
import { importOwn } from './own-data-kit';
import { demoWithExamplesAndStages, THREE_STAGE } from './examples-kit';

test.use({ actionTimeout: 60_000 });
const view = (page: Page) => page.getByRole('region', { name: 'Reactions', exact: true });

async function cardFor(page: Page, filter: string, title: RegExp) {
  const box = view(page).getByRole('searchbox', { name: 'Find by name' });
  await box.fill(filter);
  const card = view(page).locator('article[data-reaction-id]').filter({ has: page.getByRole('heading', { level: 4, name: title }) }).first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  return card;
}

async function toastsAway(page: Page): Promise<void> {
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
}

test('the arrow numbers the stages (i), (ii), (iii); the full equation numbers what it does not draw', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await importOwn(page, demoWithExamplesAndStages());
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Reactions' }).click();
  await expect(view(page).locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });

  // (1) the demo Grignard, two stages
  const grignard = await cardFor(page, 'CH₃MgBr + ethanal', /^CH₃MgBr \+ ethanal, then H₃O⁺$/);
  const arrow = grignard.locator('[data-arrow]');
  await expect(arrow).toContainText(/\(i\)\s*CH\S*MgBr[\s\S]*\(ii\)\s*H\S*O\S*/);
  await expect(arrow.locator('[class*="arrowBelow"]')).toContainText(/\(i\)[\s\S]*\(ii\)\s*acidic medium/);
  expect(await axeProblems(page)).toEqual([]);
  await toastsAway(page);
  await page.screenshot({ path: `${shotsDir()}/stages-arrow-grignard-1280x800.png` });

  // (3) the full equation: the reactants are drawn on the left, so only the work-up is written above
  await grignard.getByText('Show full equation').click();
  const above = grignard.locator('[data-equation-arrow] [data-equation-above]');
  await expect(above).toContainText(/\(ii\)\s*H\S*O\S*/);
  await expect(above).not.toContainText('(i)');
  await expect(grignard.locator('[data-equation-arrow] [data-equation-below]')).toContainText(/\(i\)[\s\S]*\(ii\)\s*acidic medium/);

  // (2) three stages
  const three = await cardFor(page, 'Zz three-stage', new RegExp(`^${THREE_STAGE}$`));
  const threeArrow = three.locator('[data-arrow]');
  await expect(threeArrow).toContainText(/\(i\)[\s\S]*\(ii\)[\s\S]*\(iii\)/);
  await expect(threeArrow.locator('[class*="arrowBelow"]')).toContainText(/\(i\)[\s\S]*\(ii\)\s*acidic medium[\s\S]*\(iii\)\s*basic medium/);
  await toastsAway(page);
  await three.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/stages-arrow-three-1280x800.png` });

  // (4) one stage: unchanged
  const single = await cardFor(page, 'Acid-catalysed hydration', /^Acid-catalysed hydration of ethene$/);
  await expect(single.locator('[data-arrow]')).not.toContainText('(i)');
  expect(await axeProblems(page)).toEqual([]);
  await expectClean(seen);
});
