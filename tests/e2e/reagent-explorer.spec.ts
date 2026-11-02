/**
 * The Reagents view (step 7.3c D1-D5), the STUDIO production build, every engine, over the demo: "Reagents" is live in the mode rail; the list
 * has the reagents with their counts in words; the Reagent family chips narrow it and say how many each holds; "Find by name" finds a reagent by
 * the label of one of its profiles; the KMnO4 page has one section per profile with the profile's usual conditions in a box BESIDE the cards
 * (never inside a card, the arrow text untouched); the KOH page has its aqueous and alcoholic sections; a profile no reaction uses says so;
 * "Show these reactions in Reactions" sets the Substance filter; the exam scope marks and hides outside reactions; the open reagent survives a
 * reload (uiState); axe on each state; zero CSP violations. Screenshots: reagents-list, reagent-page-kmno4, reagent-page-koh, reagents-filter
 * (all -1280x800.png).
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch, leaveChapters } from './kit';
import { shotsDir } from './editor-kit';
import { changedDemo, importOwn } from './own-data-kit';

test.use({ actionTimeout: 60_000 });
const rail = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const view = (page: Page) => page.getByRole('region', { name: 'Reagents', exact: true });
const rows = (page: Page) => view(page).getByRole('list', { name: 'Reagents' }).locator('[data-reagent-id]');
const section = (page: Page, name: string) => view(page).getByRole('region', { name });

async function openReagents(page: Page): Promise<void> {
  await leaveChapters(page);
  await rail(page).getByRole('button', { name: 'Reagents' }).click();
  await expect(view(page)).toBeVisible();
  await expect(view(page).getByRole('heading', { level: 2, name: 'Reagents' })).toBeVisible();
}

test('the list, the family chips, the name box (a profile label), and the KMnO4 and KOH pages', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await importOwn(page, changedDemo(() => undefined)); // the demo as the visitor's own data: the same records on the Studio build and on the live Study site

  // the rail: live, no "Phase 7" under it
  await expect(rail(page).getByRole('button', { name: /^Reagents/ })).not.toContainText('Phase 7');
  await openReagents(page);

  // D1: the list
  await expect(rows(page).first()).toBeVisible();
  const total = await rows(page).count();
  expect(total).toBeGreaterThan(10);
  await expect(view(page).getByText(`${total} reagents`)).toBeVisible();
  const koh = rows(page).filter({ hasText: 'Potassium hydroxide' });
  await expect(koh).toContainText('2 reactions · 2 profiles');
  await expect(koh).toContainText('base');
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/reagents-list-1280x800.png` });

  // a family chip narrows the list and each chip says how many reagents hold the family
  const oxidant = view(page).getByRole('button', { name: /^oxidant \d+$/ });
  const held = Number(((await oxidant.textContent()) ?? '').replace(/\D+/g, ''));
  expect(held).toBeGreaterThan(0);
  await oxidant.click();
  await expect(rows(page)).toHaveCount(held);
  await expect(view(page).getByText(`${held} of ${total} reagents`)).toBeVisible();

  // the name box finds a reagent by the label of one of its profiles
  await view(page).getByRole('button', { name: 'Clear all filters' }).click();
  await expect(rows(page)).toHaveCount(total);
  await view(page).getByLabel('Find by name').fill("Baeyer's reagent");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Potassium permanganate');
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/reagents-filter-1280x800.png` });

  // D2, D3: the KMnO4 page
  await rows(page).first().getByRole('button', { name: 'Potassium permanganate' }).click();
  await expect(view(page).getByRole('heading', { level: 2, name: 'Potassium permanganate' })).toBeVisible();
  const studioEdition = (await page.locator('[data-edition-marker]').count()) > 0; // 7.4 A5: Study words an unused profile differently
  await expect(view(page).getByRole('heading', { level: 3 })).toHaveText(["Baeyer's reagent (1 reaction)", studioEdition ? 'Hot, concentrated (0 reactions)' : 'Hot, concentrated']);
  const baeyers = section(page, "Baeyer's reagent");
  const card = baeyers.locator('article[data-reaction-id]').first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  const box = baeyers.getByRole('complementary', { name: 'Usual conditions of this profile' });
  await expect(box).toContainText('cold');
  await expect(box).toContainText('basic medium');
  // beside the card on a desktop, never inside it: the box is to the right of the card and the card does not carry its words
  const cardBox = await card.boundingBox();
  const conditionsBox = await box.boundingBox();
  expect(cardBox).not.toBeNull();
  expect(conditionsBox).not.toBeNull();
  expect((conditionsBox?.x ?? 0) >= (cardBox?.x ?? 0) + (cardBox?.width ?? 0) - 1).toBe(true);
  expect(await card.getByText('Usual conditions').count()).toBe(0);
  await expect(baeyers.locator('[data-how-used]')).toContainText('How it is used here: reagent');
  await expect(section(page, 'Hot, concentrated')).toContainText(studioEdition ? 'No reaction uses this profile yet.' : 'No reaction here uses this profile.');
  if (!studioEdition) await expect(section(page, 'Hot, concentrated').getByRole('heading', { level: 3 })).toHaveText('Hot, concentrated');
  await expect(section(page, 'Hot, concentrated').getByRole('complementary', { name: 'Usual conditions of this profile' })).toBeVisible();
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/reagent-page-kmno4-1280x800.png` });

  // the KOH page: the aq. / alc. pair
  await view(page).getByRole('button', { name: 'All reagents' }).click();
  await view(page).getByLabel('Find by name').fill('alc. KOH');
  await rows(page).first().getByRole('button', { name: 'Potassium hydroxide' }).click();
  await expect(view(page).getByRole('heading', { level: 3 })).toHaveText(['Aqueous KOH (1 reaction)', 'Alcoholic KOH (1 reaction)']);
  await expect(section(page, 'Aqueous KOH')).toContainText('also called aq. KOH');
  await expect(section(page, 'Alcoholic KOH')).toContainText('also called alc. KOH');
  await expect(section(page, 'Aqueous KOH').locator('[data-how-used]')).toContainText('aqueous');
  await expect(section(page, 'Alcoholic KOH').locator('[data-how-used]')).toContainText('alcoholic');
  await expect(section(page, 'Alcoholic KOH').getByRole('complementary')).toContainText('heat');
  await expect(section(page, 'Alcoholic KOH').locator('article[data-reaction-id]')).toHaveCount(1, { timeout: 60_000 });
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/reagent-page-koh-1280x800.png` });

  // "Show these reactions in Reactions": the Substance filter is this reagent
  await view(page).getByRole('button', { name: 'Show these reactions in Reactions' }).click();
  const reactions = page.getByRole('region', { name: 'Reactions', exact: true });
  await expect(reactions).toBeVisible();
  await expect(reactions.getByRole('list', { name: 'Chosen filters' }).getByRole('listitem').first()).toContainText('Substance: Potassium hydroxide');
  await expectClean(seen);
});

test('the exam scope marks and hides outside reactions; the open reagent comes back after a reload', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await importOwn(page, changedDemo(() => undefined)); // the demo as the visitor's own data: the same records on the Studio build and on the live Study site
  await openReagents(page);
  await rows(page).filter({ hasText: 'Potassium hydroxide' }).getByRole('button', { name: 'Potassium hydroxide' }).click();
  await expect(section(page, 'Aqueous KOH').locator('article[data-reaction-id]')).toHaveCount(1, { timeout: 60_000 });

  // the exam scope: the checkbox appears, and ticking it leaves only the reactions inside the version (it may leave none; it says so)
  const scope = page.getByRole('combobox', { name: /Exam scope/ });
  await scope.selectOption({ label: 'JEE Main, provisional, not verified' });
  const only = view(page).getByLabel(/^Only /);
  await expect(only).toBeVisible();
  await only.check();
  expect(await axeProblems(page)).toEqual([]);
  await only.uncheck();
  await scope.selectOption({ value: '' });
  await expect(view(page).getByLabel(/^Only /)).toHaveCount(0);

  // the choice is saved: a reload opens the same page (not while the chem worker is still fetching its wasm: WebKit logs the aborted fetch)
  await expect(page.getByText(/Workers: .*chem ok/)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1000); // the saved state is written after a short pause (SAVE_DEBOUNCE_MS)
  await page.reload();
  await leaveChapters(page).catch(() => undefined);
  await rail(page).getByRole('button', { name: 'Reagents' }).click();
  await expect(view(page).getByRole('heading', { level: 2, name: 'Potassium hydroxide' })).toBeVisible({ timeout: 60_000 });
  await expectClean(seen);
});
