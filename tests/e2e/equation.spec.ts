/**
 * "Show full equation" as a textbook scheme (equation step, parts 5 and 6; before: phone mode B part 3), desktop 1280 x 800, PRODUCTION
 * build, three engines. Part 6 (the look): every name directly under its drawing (at most 8 px), the Names switch on the summary line and
 * the scheme at most 12 px under it, the equation's drawing as big as the card's own drawing of the same molecule (within 10%).
 * The Lindlar card: three terms, hydrogen as the formula H2 (an H and a real subscript 2, no drawing), the two drawings at
 * the same bond length; Cannizzaro says "(both exclusive)" once; the Names switch survives a reload; no security-policy violation; axe.
 * Chromium also takes the screenshots: screenshots/equation-textbook-<lindlar|pcc|cannizzaro|ester-hydrolysis|grignard>-1280x800.png and
 * screenshots/equation-condensed-pcc-1280x800.png.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, loadDemo, openApp, watch, exampleCard } from './kit';

/** One bond in the chem module's own units (the nominal bond of the fixed scale, `FIXED_SCALE_BOND_UNITS`). */
const NOMINAL_BOND = 54;

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

/** Every name's top is within 8 px of the bottom of ITS drawing (or formula), never above it; the scheme starts at most 12 px under the summary line, and the Names switch is on that line, at its right. */
async function expectLook(card: Locator, scheme: Locator): Promise<void> {
  const box = async (locator: Locator) => {
    const found = await locator.boundingBox();
    if (found === null) throw new Error('no box');
    return found;
  };
  const columns = await scheme.locator('[data-equation-term] [role="group"]').all();
  let named = 0;
  for (const column of columns) {
    const name = column.locator('[data-equation-name]');
    if ((await name.count()) === 0) continue;
    named += 1;
    const gap = (await box(name)).y - ((await box(column.locator('[data-equation-rep]'))).y + (await box(column.locator('[data-equation-rep]'))).height);
    expect(gap, 'a name sits directly under its drawing').toBeLessThanOrEqual(8);
    expect(gap, 'and not over it').toBeGreaterThanOrEqual(-1);
  }
  expect(named, 'some names were checked').toBeGreaterThan(0);
  const summary = await box(card.getByText('Show full equation'));
  const top = (await box(scheme)).y - (summary.y + summary.height);
  expect(top, 'the scheme starts at most 12 px under the summary line').toBeLessThanOrEqual(12);
  const names = await box(card.getByRole('checkbox', { name: 'Names' }));
  expect(names.y + names.height / 2, 'the Names switch is on the summary line').toBeGreaterThan(summary.y);
  expect(names.y + names.height / 2, 'the Names switch is on the summary line').toBeLessThan(summary.y + summary.height);
  const line = await box(card.locator('[data-equation-names-line]'));
  expect(line.x + line.width, 'at the right end of the line').toBeGreaterThan(summary.x + summary.width - 4);
  expect(names.x, 'right of the summary text').toBeGreaterThan(summary.x + 120);
}

/** The width of the ink of an image (the part that is not transparent or white), in page px: the size of the molecule drawn. */
async function inkWidth(image: Locator): Promise<number> {
  return image.evaluate(async (element) => {
    const img = element as HTMLImageElement;
    await img.decode();
    const w = Math.round(img.getBoundingClientRect().width * 2);
    const h = Math.round(img.getBoundingClientRect().height * 2);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('no canvas');
    context.drawImage(img, 0, 0, w, h);
    const data = context.getImageData(0, 0, w, h).data;
    let left = w;
    let right = -1;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const at = (y * w + x) * 4;
        if ((data[at + 3] as number) > 128 && (data[at] as number) + (data[at + 1] as number) + (data[at + 2] as number) < 600) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    return (right - left + 1) / 2;
  });
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

  // the two drawings have the same bond length (within 2 px of the page: RDKit rounds the canvas, up to 2% of 54 px)
  await expect.poll(async () => (await bondLengths(scheme)).length, { timeout: 30_000 }).toBe(2);
  const [a, b] = await bondLengths(scheme);
  expect(Math.abs((a as number) - (b as number)), 'the bond of the two drawings differs by less than 2 px').toBeLessThan(2);
  expect(a as number, "the bond is the card's, about 54 px").toBeGreaterThan(48);
  await expectLook(card, scheme);

  if (browserName === 'chromium') await shot(page, card, 'equation-textbook-lindlar-1280x800.png');
  expect(await axeProblems(page), 'axe').toEqual([]);

  // Names: on by default; off hides the name lines only; the choice is saved and comes back after a reload
  await expect(scheme.locator('[data-equation-name]')).toHaveCount(3);
  await card.getByRole('checkbox', { name: 'Names' }).uncheck();
  await expect(scheme.locator('[data-equation-name]')).toHaveCount(0);
  await expect(hydrogen.locator('sub')).toHaveText('2'); // a formula-text term still shows its formula
  await page.waitForTimeout(1_000);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Family page: Alkenes' })).toBeVisible();
  await page.getByRole('button', { name: /^Alkynes\s*\d+\s*reactions?$/ }).first().click();
  const againCard = cardOf(page, /Lindlar/);
  const again = await openEquation(againCard);
  await expect(againCard.getByRole('checkbox', { name: 'Names' })).not.toBeChecked();
  await expect(again.locator('[data-equation-name]')).toHaveCount(0);
  await againCard.getByRole('checkbox', { name: 'Names' }).check();
  await expect(again.locator('[data-equation-name]')).toHaveCount(3);
  await page.waitForTimeout(1_000);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Family page: Alkenes' })).toBeVisible();
  await page.getByRole('button', { name: /^Alkynes\s*\d+\s*reactions?$/ }).first().click();
  const backCard = cardOf(page, /Lindlar/);
  await openEquation(backCard);
  await expect(backCard.getByRole('checkbox', { name: 'Names' })).toBeChecked();
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
  const pcc = await exampleCard(page, /ethanal \(PCC\)/);
  const pccScheme = await openEquation(pcc);
  await expect(pccScheme.locator('[data-equation-arrow] [data-equation-above]')).toContainText('PCC');
  await expect.poll(async () => (await bondLengths(pccScheme)).length, { timeout: 30_000 }).toBeGreaterThan(0);
  await expectLook(pcc, pccScheme);
  // the equation's ethanol is as big as the card's own drawing of ethanol (within 10%)
  const own = await inkWidth(pcc.locator('figure img[alt="Structure of Ethanol"]').first());
  const inEquation = await inkWidth(pccScheme.locator('img[alt="Structure of Ethanol"]'));
  console.log(`bond check (PCC ethanol): card drawing is ${own} px wide, equation drawing ${inEquation} px wide`);
  expect(Math.abs(inEquation - own) / own, "the equation's ethanol is within 10% of the card's").toBeLessThan(0.1);
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
  await expect(grignardScheme.locator('[data-equation-arrow] [data-equation-below]')).toContainText(/\(i\)[\s\S]*\(ii\)/); // the stages are numbered (i), (ii), as the card's arrow numbers them (7.3a D1)
  await shot(page, grignard, 'equation-textbook-grignard-1280x800.png');
  await expectClean(seen);
});
