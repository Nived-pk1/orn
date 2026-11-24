/**
 * Step 8.5d: ONE size rule for structure drawings, formulas and names. The awkward set (awkward-set.ts: methane, bromide, a C20 chain, dimethyl
 * hexanedioate with and without all atoms, a text formula, glucose, cholesterol, a three-product equation, a long name, an ion pair) is drawn in
 * the family page's Structure boxes, the full equation and the inspector (desktop 1280 x 800 and Pixel 7, light and dark), and nothing may be
 * clipped (a box that scrolls carries `data-scrolls`), every drawing carries `data-bond-px` between the floor (70 %) and the standard (56 px) and no
 * label is under 11 px (a capital letter is 15.5 px high at 54 px). The test's own data; the demo is never edited.
 */
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { chooseFile, expectClean, expectPreview, openApp, openPhoneApp, watch } from './kit';
import { pane, palette, shotsDir, showRecord } from './editor-kit';
import { AWKWARD, awkwardFile, reactionId, reactionName, type Awkward } from './awkward-set';

const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const STANDARD = 56;
const FLOOR = 0.7;
const LABEL_PER_BOND = 15.5 / 54;

/** What is wrong inside `root`: a drawing without a bond length or outside floor and standard, a label under 11 px, anything clipped. */
async function problemsIn(root: Locator): Promise<string[]> {
  return root.evaluate(
    (element, k) => {
      const out: string[] = [];
      const boxes = [...element.querySelectorAll<HTMLElement>('figure[data-substance-id], [data-equation-rep], [data-hero-equation]')];
      for (const img of element.querySelectorAll<HTMLImageElement>('figure[data-substance-id] img, [data-equation-rep] img, [data-hero-equation] img')) {
        const bond = Number(img.getAttribute('data-bond-px'));
        if (!(bond > 0)) out.push(`a drawing has no data-bond-px (${img.alt})`);
        else {
          if (bond < k.standard * k.floor - 0.06 || bond > k.standard + 0.06) out.push(`bond ${bond} outside ${k.standard * k.floor}..${k.standard} (${img.alt})`);
          if (bond * k.label < 11 - 0.06) out.push(`labels under 11 px at bond ${bond} (${img.alt})`);
        }
      }
      const clips = (el: HTMLElement): boolean => /hidden|clip/.test(getComputedStyle(el).overflowX) || /hidden|clip/.test(getComputedStyle(el).overflowY) || /paint/.test(getComputedStyle(el).contain);
      for (const item of [...element.querySelectorAll<HTMLElement>('figure[data-substance-id] img, figure[data-substance-id] span, [data-equation-rep] img, [data-equation-rep] span, [data-equation-name], figcaption span')]) {
        const r = item.getBoundingClientRect();
        if (r.width === 0 || item.closest('[aria-hidden="true"]') !== null) continue; // the hero keeps a hidden copy of its row to measure
        for (let up: HTMLElement | null = item.parentElement; up !== null && up !== element; up = up.parentElement) {
          if (up.hasAttribute('data-scrolls')) break;
          if (!clips(up) && !/auto|scroll/.test(getComputedStyle(up).overflowX)) continue;
          const c = up.getBoundingClientRect();
          if (r.right > c.right + 1 || r.left < c.left - 1 || r.bottom > c.bottom + 1 || r.top < c.top - 1) out.push(`clipped by ${up.className || up.tagName} [${Math.round(c.left)}..${Math.round(c.right)} x ${Math.round(c.top)}..${Math.round(c.bottom)}] item [${Math.round(r.left)}..${Math.round(r.right)} x ${Math.round(r.top)}..${Math.round(r.bottom)}]: ${(item.textContent || (item as HTMLImageElement).alt || item.tagName).slice(0, 40)}`);
          break;
        }
      }
      for (const box of boxes) if (box.hasAttribute('data-scrolls') === false && box.scrollWidth > box.clientWidth + 1 && /hidden|clip/.test(getComputedStyle(box).overflowX)) out.push(`scrollWidth > clientWidth on ${box.className}`);
      return out;
    },
    { standard: STANDARD, floor: FLOOR, label: LABEL_PER_BOND },
  );
}

const cardOf = (page: Page, item: Awkward): Locator => page.getByRole('article').filter({ has: page.getByRole('heading', { name: reactionName(item) }) }).last();

async function importAwkward(page: Page): Promise<void> {
  await chooseFile(page, awkwardFile());
  await expectPreview(page);
  await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 120_000 });
}

async function setStructures(page: Page, mode: 'Skeletal' | 'Full'): Promise<void> {
  await page.keyboard.press('Control+K');
  await expect(palette(page)).toBeVisible();
  await palette(page).getByRole('combobox').fill(`>Structures: ${mode}`);
  await palette(page).getByRole('option', { name: new RegExp(`Structures: ${mode}`) }).click();
  await expect(palette(page)).toBeHidden();
}

/** The family page's list is virtual: wheel down (then back up) until the card is drawn. */
async function reveal(page: Page, card: Locator): Promise<void> {
  for (let i = 0; i < 60 && (await card.count()) === 0; i += 1) {
    await page.evaluate((dy) => {
      for (const el of document.querySelectorAll<HTMLElement>('*')) if (el.scrollHeight > el.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop += dy;
      window.scrollBy(0, dy);
    }, i < 30 ? 500 : -500);
    await page.waitForTimeout(120);
  }
}

async function walkFamily(page: Page, tag: string, tap: boolean): Promise<string[]> {
  const found: string[] = [];
  for (const item of AWKWARD) {
    const card = cardOf(page, item);
    await reveal(page, card);
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByText('Drawing the structure…')).toHaveCount(0, { timeout: 60_000 });
    for (const p of await problemsIn(card)) found.push(`${tag} family ${item.label}: ${p}`);
    const summary = card.getByText('Show full equation');
    if ((await summary.count()) > 0) {
      await (tap ? summary.first().tap() : summary.first().click());
      const scheme = card.getByRole('group', { name: 'Full equation' });
      await expect(scheme).toBeVisible();
      await expect(scheme.getByText('Drawing the structure…')).toHaveCount(0, { timeout: 60_000 });
      for (const p of await problemsIn(scheme)) found.push(`${tag} equation ${item.label}: ${p}`);
    }
  }
  return found;
}

test('desktop 1280 x 800: the awkward set obeys the one size rule (family page, full equation)', async ({ page }) => {
  test.setTimeout(280_000);
  const seen = await watch(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await importAwkward(page);
  await page.locator('svg [data-node-id="cls_aldehydes"]').dblclick();
  await expect(page.getByRole('region', { name: /^Family page: Aldehydes/ })).toBeVisible();
  const found = await walkFamily(page, 'skeletal', false);
  await setStructures(page, 'Full');
  found.push(...(await walkFamily(page, 'all atoms', false)));
  await page.screenshot({ path: `${shotsDir()}/8.5d/awkward-desktop-light.png` });
  expect(found).toEqual([]);
  await expectClean(seen);
});

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('the awkward set obeys the one size rule (family page, stacked equation)', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(280_000);
    const seen = await watch(page);
    await openPhoneApp(page);
    await importAwkward(page);
    await page.getByRole('button', { name: /^Aldehydes/ }).tap();
    await expect(page.getByRole('region', { name: /^Family page: Aldehydes/ })).toBeVisible();
    const found = await walkFamily(page, 'phone', true);
    await page.screenshot({ path: `${shotsDir()}/8.5d/awkward-pixel7-light.png` });
    expect(found).toEqual([]);
    await expectClean(seen);
  });
});


for (const scheme of ['light', 'dark'] as const) {
  test(`desktop ${scheme}: the inspector's picture (hero) obeys the one size rule for every awkward reaction`, async ({ page }) => {
    test.setTimeout(280_000);
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await importAwkward(page);
    const found: string[] = [];
    for (const item of AWKWARD) {
      await showRecord(page, 'r', reactionName(item), reactionId(item));
      const hero = pane(page).locator('[data-hero-equation]:not([data-compact])');
      await expect(hero).toBeVisible();
      await expect(hero.getByText('Drawing the structure…')).toHaveCount(0, { timeout: 60_000 });
      await page.waitForTimeout(600);
      for (const p of await problemsIn(hero)) found.push(`inspector ${item.label}: ${p}`);
      if ([4, 5, 7, 9].includes(item.n)) await page.screenshot({ path: `${shotsDir()}/8.5d/awkward-inspector-${item.n}-${scheme}.png` });
    }
    expect(found).toEqual([]);
  });
}
