/**
 * Step 8.5e: what 8.5d left out of the size-rule specs, and the acceptance numbers of the second pass. (1) Pixel 7 in DARK: the awkward set in the family
 * page and the stacked equation obeys the rule; the sodium propan-2-olate term in the full equation is at most 45 % of the screen width and the acetic
 * (ethanoic) acid card picture at most 40 %. (2) The inspector's picture (hero) on a phone, in the full sheet. (3) Three of the set (cholesterol,
 * glucose, sodium propan-2-olate) in one mechanism step: the drawing is at the mechanism's bond length (36 px) or between it and the floor, never
 * clipped. The checks are in size-rule-kit.ts.
 */
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectClean, leaveChapters, openPhoneApp, watch } from './kit';
import { shotsDir } from './editor-kit';
import { AWKWARD, reactionName } from './awkward-set';
import { cardOf, importAwkward, problemsIn, reveal, walkFamily } from './size-rule-kit';
import { changedDemo, importOwn, recordsOf } from './own-data-kit';

const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

test.describe('phone: Pixel 7 (Chromium), dark', () => {
  test.use({ ...PIXEL, colorScheme: 'dark' });

  test('the awkward set in dark: the rule holds, and the two acceptance sizes', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(280_000);
    const seen = await watch(page);
    await openPhoneApp(page);
    await importAwkward(page);
    await page.getByRole('button', { name: /^Aldehydes/ }).tap();
    await expect(page.getByRole('region', { name: /^Family page: Aldehydes/ })).toBeVisible();
    const found = await walkFamily(page, 'phone dark', true);
    const width = page.viewportSize()?.width ?? 393;
    // the ion pair (AW10) in its full equation, then the demo's ethanoic acid card
    const ion = AWKWARD.find((item) => item.n === 10);
    if (ion === undefined) throw new Error('no ion pair');
    const card = cardOf(page, ion);
    await reveal(page, card);
    await card.scrollIntoViewIfNeeded();
    const term = card.getByRole('group', { name: 'Full equation' }).getByRole('group', { name: 'Sodium propan-2-olate' });
    await expect(term).toBeVisible();
    const termWidth = (await term.boundingBox())?.width ?? 9999;
    await page.screenshot({ path: `${shotsDir()}/8.5e/pixel7-equation-dark.png` });
    const acetic = page.getByRole('article').filter({ has: page.getByRole('heading', { name: /ethanal.*ethanoic acid/i }) }).last();
    await reveal(page, acetic);
    await acetic.scrollIntoViewIfNeeded();
    const picture = acetic.getByRole('img', { name: /^Structure of Ethanoic acid/i }).first();
    await expect(picture).toBeVisible({ timeout: 60_000 });
    const pictureWidth = (await picture.boundingBox())?.width ?? 9999;
    await page.screenshot({ path: `${shotsDir()}/8.5e/pixel7-family-dark.png` });
    expect(found).toEqual([]);
    expect(termWidth, `sodium propan-2-olate in the full equation, ${termWidth} of ${width} px`).toBeLessThanOrEqual(width * 0.45);
    expect(pictureWidth, `acetic acid card picture, ${pictureWidth} of ${width} px`).toBeLessThanOrEqual(width * 0.4);
    await expectClean(seen);
  });
});

test.describe('phone: Pixel 7 (Chromium), the inspector hero', () => {
  test.use({ ...PIXEL });

  test('the hero of the full sheet obeys the rule for every awkward reaction', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(280_000);
    await openPhoneApp(page);
    await importAwkward(page);
    const found: string[] = [];
    for (const item of AWKWARD.filter((one) => [3, 4, 7, 9, 10].includes(one.n))) {
      await openReaction(page, reactionName(item));
      await page.getByRole('button', { name: 'Show the whole record' }).tap();
      const sheet = page.locator('[data-sheet="full"]');
      await expect(sheet).toBeVisible();
      const hero = sheet.locator('[data-hero-equation]:not([data-compact])').first();
      await expect(hero).toBeVisible();
      await expect(hero.getByText('Drawing the structure…')).toHaveCount(0, { timeout: 60_000 });
      await page.waitForTimeout(600);
      for (const p of await problemsIn(hero)) found.push(`phone hero ${item.label}: ${p}`);
      if (item.n === 7) await page.screenshot({ path: `${shotsDir()}/8.5e/pixel7-hero.png` });
      await page.goBack().catch(() => undefined);
      await page.reload();
      await expect(page.getByRole('navigation', { name: 'Home' })).toBeVisible({ timeout: 90_000 });
    }
    expect(found).toEqual([]);
  });
});

async function openReaction(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Search' }).first().tap();
  const dialog = page.getByRole('dialog', { name: 'Search' });
  await dialog.getByRole('combobox').fill(name.slice(0, 12));
  const option = dialog.getByRole('option').filter({ hasText: name }).first();
  await expect(option).toBeVisible({ timeout: 60_000 });
  await option.tap();
  await expect(page.locator('[data-sheet]')).toHaveAttribute('data-sheet', /peek|full/, { timeout: 30_000 });
}

const THREE = [
  { role: 'reactant', label: 'Cholesterol', structure: { format: 'smiles', value: 'CC(C)CCCC(C)C1CCC2C1(CCC3C2CC=C4C3(CCC(C4)O)C)C' } },
  { role: 'reagent', label: 'Glucose (open chain)', structure: { format: 'smiles', value: 'OCC(O)C(O)C(O)C(O)C=O' } },
  { role: 'product', label: 'Sodium propan-2-olate', structure: { format: 'smiles', value: '[Na+].CC(C)[O-]' } },
];

test('three of the set in one mechanism step: at the mechanism bond length (36 px) or down to the floor, never clipped', async ({ page }) => {
  test.setTimeout(280_000);
  const seen = await watch(page);
  await importOwn(
    page,
    changedDemo((records) => {
      const mechanism = recordsOf<{ id: string; variants: { steps: { id: string; species: unknown[]; electronMovements: unknown[]; bondsFormed: unknown[]; bondsBroken: unknown[] }[] }[] }>(records, 'mechanism').find((m) => m.id === 'mec_aldol-ethanal');
      const step = mechanism?.variants[0]?.steps[1];
      if (step === undefined) throw new Error('the demo has no aldol step 2');
      step.species = THREE;
      step.electronMovements = [];
      step.bondsFormed = [];
      step.bondsBroken = [];
    }),
  );
  await leaveChapters(page);
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Mechanisms' }).click();
  const view = page.getByRole('region', { name: 'Mechanisms', exact: true });
  await view.getByRole('list', { name: 'Mechanisms' }).locator('[data-mechanism-id]').filter({ hasText: 'Aldol addition of ethanal' }).getByRole('button', { name: 'Aldol addition of ethanal' }).click();
  const step = view.locator('[data-step]').filter({ hasText: 'Enolate carbon attacks a second ethanal' }).first();
  const svg = step.locator('svg[data-bond-px]').first();
  await expect(svg).toBeVisible({ timeout: 90_000 });
  await expect(step.locator('image')).toHaveCount(3, { timeout: 90_000 });
  await page.waitForTimeout(600);
  const standard = 36;
  const bond = Number(await svg.getAttribute('data-bond-px'));
  expect(bond).toBeGreaterThanOrEqual(standard * 0.85 - 0.06);
  expect(bond).toBeLessThanOrEqual(standard + 0.06);
  // the drawing is inside its box, or its box scrolls sideways (never clipped)
  const clipped = await step.locator('[data-drawing-scroll]').evaluate((box) => {
    const s = box.querySelector('svg') as SVGSVGElement;
    return getComputedStyle(box).overflowX === 'visible' && s.getBoundingClientRect().right > box.getBoundingClientRect().right + 1;
  });
  expect(clipped).toBe(false);
  await step.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/8.5e/mechanism-three.png` });
  await expectClean(seen);
});
