/**
 * "Show full equation" as a textbook scheme (equation step, part 5; before: phone mode B part 3), desktop 1280 x 800, PRODUCTION build,
 * three engines. The Lindlar card: three terms, hydrogen as the formula H2 (an H and a real subscript 2, no drawing), the two drawings at
 * the same bond length; Cannizzaro says "(both exclusive)" once; the Names switch survives a reload; no security-policy violation; axe.
 * Chromium also takes the screenshots: screenshots/equation-textbook-<lindlar|pcc|cannizzaro|ester-hydrolysis|grignard>-1280x800.png and
 * screenshots/equation-condensed-pcc-1280x800.png.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, loadDemo, openApp, watch } from './kit';

/** One bond in the chem module's own units (the nominal bond of the fixed scale, `FIXED_SCALE_BOND_UNITS`). */
const NOMINAL_BOND = 147.5;

async function openFamily(page: Page, node: string, name: RegExp): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await page.locator(`svg [data-node-id="${node}"]`).dblclick();
  await expect(page.getByRole('region', { name })).toBeVisible();
  await page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' }).click(); // the import notice would cover the card
}

const cardOf = (page: Page, title: RegExp): Locator => page.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name: title }) });

async function openEquation(card: Locator): Promise<Locator> {
  await expect(card).toBeVisible();
  await card.getByText('Show full equation').click();
  const scheme = card.getByRole('group', { name: 'Full equation' });
  await expect(scheme).toBeVisible();
  return scheme;
}

/** The bond length of each drawing in the scheme, in the chem module's units, from the size it is shown at and its own size. */
async function bondLengths(scheme: Locator): Promise<number[]> {
  return scheme.locator('img').evaluateAll(
    (images, nominal) =>
      (images as HTMLImageElement[]).map((img) => {
        const shown = img.getBoundingClientRect().width;
        return (shown / img.naturalWidth) * (nominal as number);
      }),
    NOMINAL_BOND,
  );
}

/** The partner buttons are in the header item at the top of the list: scroll back to it before using them again. */
async function toTop(page: Page): Promise<void> {
  await page.locator('[data-virtual-list]').first().evaluate((el) => void (el.scrollTop = 0));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

async function shot(page: Page, card: Locator, file: string): Promise<void> {
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `screenshots/${file}` });
}

test('Lindlar: three terms, hydrogen as the formula H2, the drawings at one bond length; Names survives a reload; policy and axe are clean', async ({ page, browserName }) => {
  test.setTimeout(300_000);
  const seen = await watch(page);
  await openApp(page);
  await loadDemo(page);
  await page.locator('svg [data-node-id="cls_alkenes"]').dblclick();
  await expect(page.getByRole('region', { name: 'Family page: Alkenes' })).toBeVisible();
  await page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' }).click();
  await page.getByRole('button', { name: /^Alkynes\s*\d+\s*reactions?$/ }).first().click();
  const card = cardOf(page, /Lindlar/);
  const scheme = await openEquation(card);

  // the old sentence is the description; the terms are columns
  await expect(scheme).toHaveAccessibleDescription(/ → /);
  await expect(scheme.locator('[data-equation-term]')).toHaveCount(3);
  const hydrogen = scheme.getByRole('group', { name: 'Hydrogen' });
  await expect(hydrogen.locator('sub')).toHaveText('2'); // H and a real subscript 2
  await expect(hydrogen).toContainText('H');
  await expect(hydrogen.locator('img')).toHaveCount(0); // a formula, not a drawing
  await expect(scheme.locator('[data-equation-arrow] [data-equation-above]')).toContainText('Lindlar');
  await expect(scheme.locator('[data-equation-arrow] [data-equation-below]')).not.toContainText(/H2|H₂/); // hydrogen is written once
  await expect(scheme.getByRole('img')).toHaveCount(2); // the alkyne and the alkene are drawn

  // the two drawings have the same bond length (within 1 px of the page: 1 px of 32 px is 4.6 units of 147.5)
  await expect.poll(async () => (await bondLengths(scheme)).length, { timeout: 30_000 }).toBe(2);
  const [a, b] = await bondLengths(scheme);
  expect(Math.abs((a as number) - (b as number)) / NOMINAL_BOND * 32, 'the bond of the two drawings differs by less than 1 px').toBeLessThan(1);

  if (browserName === 'chromium') await shot(page, card, 'equation-textbook-lindlar-1280x800.png');
  expect(await axeProblems(page), 'axe').toEqual([]);

  // Names: on by default; off hides the name lines only; the choice is saved and comes back after a reload
  await expect(scheme.locator('[data-equation-name]')).toHaveCount(3);
  await scheme.getByRole('checkbox', { name: 'Names' }).uncheck();
  await expect(scheme.locator('[data-equation-name]')).toHaveCount(0);
  await expect(hydrogen.locator('sub')).toHaveText('2'); // a formula-text term still shows its formula
  await page.waitForTimeout(1_000);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Family page: Alkenes' })).toBeVisible();
  await page.getByRole('button', { name: /^Alkynes\s*\d+\s*reactions?$/ }).first().click();
  const again = await openEquation(cardOf(page, /Lindlar/));
  await expect(again.getByRole('checkbox', { name: 'Names' })).not.toBeChecked();
  await expect(again.locator('[data-equation-name]')).toHaveCount(0);
  await again.getByRole('checkbox', { name: 'Names' }).check();
  await expect(again.locator('[data-equation-name]')).toHaveCount(3);
  await page.waitForTimeout(1_000);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Family page: Alkenes' })).toBeVisible();
  await page.getByRole('button', { name: /^Alkynes\s*\d+\s*reactions?$/ }).first().click();
  const back = await openEquation(cardOf(page, /Lindlar/));
  await expect(back.getByRole('checkbox', { name: 'Names' })).toBeChecked();
  await expectClean(seen);
});

test('Cannizzaro: "(both exclusive)" once, the coefficient 2 before benzaldehyde', async ({ page, browserName }) => {
  test.setTimeout(240_000);
  const seen = await watch(page);
  await openFamily(page, 'cls_aldehydes', /^Family page: Aldehydes/);
  const card = cardOf(page, /Cannizzaro/);
  const scheme = await openEquation(card);
  await expect(scheme.locator('[data-equation-word]')).toHaveCount(1);
  await expect(scheme.locator('[data-equation-word]')).toHaveText('(both exclusive)');
  await expect(scheme.locator('[data-equation-coefficient]')).toHaveText('2');
  await expect(scheme.getByRole('group', { name: '2 Benzaldehyde' })).toBeVisible();
  if (browserName === 'chromium') await shot(page, card, 'equation-textbook-cannizzaro-1280x800.png');
  await expectClean(seen);
});

test('the other textbook equations: PCC, an equilibrium (ester hydrolysis) and a two-stage reaction (Grignard), and Condensed', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one engine is enough for the screenshots; the DOM is asserted above and by the component tests');
  test.setTimeout(300_000);
  const seen = await watch(page);
  await openFamily(page, 'cls_alcohols', /^Family page: Alcohols/);

  await page.getByRole('button', { name: /^Aldehydes\s*\d+\s*reactions?$/ }).last().click();
  const pcc = cardOf(page, /ethanal \(PCC\)/);
  const pccScheme = await openEquation(pcc);
  await expect(pccScheme.locator('[data-equation-arrow] [data-equation-above]')).toContainText('PCC');
  await expect.poll(async () => (await bondLengths(pccScheme)).length, { timeout: 30_000 }).toBeGreaterThanOrEqual(0);
  await shot(page, pcc, 'equation-textbook-pcc-1280x800.png');

  // Condensed: the same equation, every chain carbon labelled with its hydrogens
  await page.getByRole('radiogroup', { name: 'Structures' }).getByRole('radio', { name: 'Condensed' }).check({ force: true });
  await expect(pccScheme).toBeVisible();
  await page.waitForTimeout(1_500);
  await shot(page, pcc, 'equation-condensed-pcc-1280x800.png');
  await page.getByRole('radiogroup', { name: 'Structures' }).getByRole('radio', { name: 'Skeletal' }).check({ force: true });

  await toTop(page);
  await page.getByRole('button', { name: /^Esters\s*\d+\s*reactions?$/ }).first().click();
  const ester = cardOf(page, /Ester hydrolysis/);
  const esterScheme = await openEquation(ester);
  await expect(esterScheme.locator('[data-equation-arrow]')).toHaveAttribute('data-equilibrium', '');
  await shot(page, ester, 'equation-textbook-ester-hydrolysis-1280x800.png');

  await toTop(page);
  await page.getByRole('button', { name: /^Ketones\s*\d+\s*reactions?$/ }).first().click();
  const grignard = cardOf(page, /CH₃MgBr \+ propanone, then/); // the demo scheme with showStageNumbers is the propanone one
  const grignardScheme = await openEquation(grignard);
  await expect(grignardScheme.locator('[data-equation-arrow] [data-equation-below]')).toContainText(/1\.[\s\S]*2\./); // the stages are numbered, as the card's arrow numbers them
  await shot(page, grignard, 'equation-textbook-grignard-1280x800.png');
  await expectClean(seen);
});
