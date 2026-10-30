/**
 * The "Structures" setting (equation step, part 4), PRODUCTION build, three engines: a Skeletal | Condensed | Full control in the family
 * page header; switching to Condensed changes the PCC card's ethanol drawing (it gains the CH3 / CH2 labels) and the choice comes back on
 * reload; the palette has the same commands; no security-policy violation; axe finds nothing serious.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, loadDemo, openApp, watch, exampleCard } from './kit';

async function openAlcohols(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
  await showPccCard(page);
}

async function showPccCard(page: Page): Promise<void> {
  await expect(page.getByRole('region', { name: /^Family page: Alcohols/ })).toBeVisible();
  // the PCC card is in the group "Aldehydes" (Turns into): the "Turns into" partner button (the last of the two) brings the reader to it
  await page.getByRole('button', { name: /^Aldehydes\s*\d+\s*reactions?$/ }).last().click();
  await exampleCard(page, /ethanal \(PCC\)/); // the PCC reaction is folded under the general oxidation (7.3a C1): its disclosure is opened
  await expect(pccCard(page)).toBeVisible();
}

const pccCard = (page: Page) => page.locator('details[data-examples]').getByRole('article').filter({ has: page.getByRole('heading', { level: 5, name: /ethanal \(PCC\)/ }) });

/**
 * What the ethanol picture of the PCC card looks like: the picture is an `<img>` with a blob URL (the page policy lets no script fetch it), so
 * it is drawn on a canvas and the dark pixels are counted and hashed: "count:hash". The same drawing gives the same text.
 */
async function ethanolDrawing(page: Page): Promise<string> {
  const image = pccCard(page).getByRole('img', { name: 'Structure of Ethanol' }).first();
  await expect(image).toBeVisible();
  return image.evaluate(async (el) => {
    const img = el as HTMLImageElement;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 160;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 256, 160);
    context.drawImage(img, 0, 0, 256, 160);
    const data = context.getImageData(0, 0, 256, 160).data;
    let dark = 0;
    let hash = 0;
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i] as number) + (data[i + 1] as number) + (data[i + 2] as number) < 600) {
        dark += 1;
        hash = (hash * 31 + i) | 0;
      }
    }
    return `${dark}:${hash}`;
  });
}

const darkOf = (drawing: string): number => Number(drawing.split(':')[0]);

test('Condensed changes the PCC card\'s ethanol drawing, the choice survives a reload, and nothing breaks the policy', async ({ page }) => {
  test.setTimeout(240_000);
  const seen = await watch(page);
  await openApp(page);
  await loadDemo(page);
  await openAlcohols(page);

  const group = page.getByRole('radiogroup', { name: 'Structures' });
  await expect(group.getByRole('radio', { name: 'Skeletal' })).toBeChecked();
  const skeletal = await ethanolDrawing(page);

  await group.getByRole('radio', { name: 'Condensed' }).check({ force: true });
  await expect(group.getByRole('radio', { name: 'Condensed' })).toBeChecked();
  await expect(page.getByRole('status').filter({ hasText: 'Structures: Condensed' })).toHaveCount(1);
  await expect.poll(async () => ethanolDrawing(page), { timeout: 30_000 }).not.toBe(skeletal);
  const condensed = await ethanolDrawing(page);
  expect(darkOf(condensed), 'the CH3 and CH2 labels are drawn').toBeGreaterThan(darkOf(skeletal));

  expect(await axeProblems(page), 'axe').toEqual([]);

  // saved (the panels entry is written after a short pause), and back after a reload
  await page.waitForTimeout(1_000);
  await page.reload(); // the family page is restored (it is saved with the rest of the navigator's state)
  await showPccCard(page);
  await expect(page.getByRole('radiogroup', { name: 'Structures' }).getByRole('radio', { name: 'Condensed' })).toBeChecked();
  await expect.poll(async () => ethanolDrawing(page), { timeout: 30_000 }).toBe(condensed);

  // back to Skeletal: the first drawing again (a switch never shows a drawing of the other mode)
  await page.getByRole('radiogroup', { name: 'Structures' }).getByRole('radio', { name: 'Skeletal' }).check({ force: true });
  await expect.poll(async () => ethanolDrawing(page), { timeout: 30_000 }).toBe(skeletal);
  await expectClean(seen);
});

test('the palette has "Structures: Full", and Full draws the hydrogens', async ({ page }) => {
  test.setTimeout(240_000);
  const seen = await watch(page);
  await openApp(page);
  await loadDemo(page);
  await openAlcohols(page);
  const skeletal = await ethanolDrawing(page);
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Search' });
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox').fill('> structures full');
  await palette.getByRole('option', { name: /Structures: Full/ }).click();
  await expect(page.getByRole('radiogroup', { name: 'Structures' }).getByRole('radio', { name: 'Full' })).toBeChecked();
  await expect.poll(async () => darkOf(await ethanolDrawing(page)), { timeout: 30_000 }).toBeGreaterThan(darkOf(skeletal));
  await expectClean(seen);
});
