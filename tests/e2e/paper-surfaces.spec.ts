/**
 * Step 8.5f: in dark, every structure drawing sits on the --paper surface. For every drawing (an `img[data-bond-px]` or the mechanism
 * `svg[data-bond-px]`) the FIRST ancestor with a non-transparent background has the computed --paper colour and black ink on it has a
 * contrast of at least 4.5:1. Every surface is visited and every failure is listed, not only the first. The same walk runs in light, where
 * the drawing has no backing by design (the card under it is the surface), so light checks the contrast only. Data: the demo plus the
 * awkward set (awkward-set.ts, a cholesterol box that scrolls on a phone).
 */
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { leaveChapters, openApp, openPhoneApp } from './kit';
import { pane, showRecord } from './editor-kit';
import { AWKWARD, reactionId, reactionName } from './awkward-set';
import { importAwkward, reveal } from './size-rule-kit';

const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const DRAWING = 'img[data-bond-px], svg[data-bond-px]';

test.use({ actionTimeout: 60_000 });

async function wrongOn(page: Page, surface: string, dark: boolean): Promise<string[]> {
  await expect(page.locator(DRAWING).filter({ visible: true }).first(), `${surface}: a drawing`).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Drawing the structure…').filter({ visible: true })).toHaveCount(0, { timeout: 60_000 });
  return page.evaluate(
    ({ selector, surface, dark }) => {
      const rgba = (value: string): number[] => (value.match(/[\d.]+/g) ?? []).map(Number);
      const luminance = (value: string): number =>
        rgba(value)
          .slice(0, 3)
          .map((c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4))
          .reduce((sum, c, i) => sum + c * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
      const probe = document.createElement('i');
      probe.style.background = 'var(--paper)';
      document.body.append(probe);
      const paper = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const out: string[] = [];
      for (const drawing of document.querySelectorAll(selector)) {
        if (!drawing.checkVisibility({ visibilityProperty: true })) continue;
        let up = drawing.parentElement;
        while (up !== null && (rgba(getComputedStyle(up).backgroundColor)[3] ?? 1) === 0) up = up.parentElement;
        const behind = up === null ? 'rgb(255, 255, 255)' : getComputedStyle(up).backgroundColor;
        const kind = drawing.closest('figure[data-substance-id]') !== null ? 'card box' : drawing.closest('[data-hero-equation]') !== null ? 'hero' : drawing.closest('[data-equation-rep]') !== null ? 'equation' : 'mechanism step';
        const contrast = (luminance(behind) + 0.05) / 0.05;
        const name = drawing.getAttribute('alt') ?? drawing.getAttribute('aria-label') ?? drawing.closest('[data-step]')?.textContent?.slice(0, 40) ?? drawing.tagName;
        if (contrast < 4.5) out.push(`${surface}: ${kind}: ${name}: black ink contrast ${contrast.toFixed(2)} on ${behind}`);
        else if (dark && behind !== paper) out.push(`${surface}: ${kind}: ${name}: on ${behind}, not --paper ${paper}`);
        // a box that fades its edge must not fade the paper with it: no mask on the painted element or above it
        if (dark && up !== null) {
          for (let at: Element | null = up; at !== null; at = at.parentElement) {
            if (getComputedStyle(at).maskImage !== 'none') out.push(`${surface}: ${kind}: ${name}: the paper itself fades into the card (mask on or above it)`);
          }
        }
      }
      return [...new Set(out)];
    },
    { selector: DRAWING, surface, dark },
  );
}

const view = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

/** The inspector's picture and, on the family page it came from, a card and its full equation. */
async function familyAndEquation(page: Page, found: string[], dark: boolean, tap: boolean): Promise<void> {
  await expect(page.getByRole('region', { name: /^Family page: Aldehydes/ })).toBeVisible();
  const cholesterol = AWKWARD.find((item) => item.n === 7);
  if (cholesterol === undefined) throw new Error('no cholesterol');
  found.push(...(await wrongOn(page, 'family page cards', dark)));
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: reactionName(cholesterol) }) }).last();
  await reveal(page, card);
  await card.scrollIntoViewIfNeeded();
  found.push(...(await wrongOn(page, 'family card (cholesterol, wide box)', dark)));
  const summary = card.getByText('Show full equation');
  await (tap ? summary.tap() : summary.click());
  await expect(card.getByRole('group', { name: 'Full equation' }).locator('img[data-bond-px]').first()).toBeVisible({ timeout: 60_000 });
  found.push(...(await wrongOn(page, 'full equation', dark)));
}

/** One of the mode views holding reaction cards, mechanism steps or route cards. `choose` goes to the mode. */
async function modeViews(page: Page, found: string[], dark: boolean, choose: (mode: string) => Promise<void>, press: (target: ReturnType<Page['locator']>) => Promise<void>): Promise<void> {
  await choose('Reactions');
  await expect(view(page, 'Reactions').locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
  found.push(...(await wrongOn(page, 'Reactions list', dark)));

  await choose('Named reactions');
  await press(view(page, 'Named reactions').getByRole('button', { name: 'Aldol reaction' }));
  await expect(view(page, 'Named reactions').locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
  found.push(...(await wrongOn(page, 'named-reaction page', dark)));

  await choose('Reagents');
  await press(view(page, 'Reagents').getByRole('list', { name: 'Reagents' }).getByRole('button', { name: 'Potassium permanganate' }));
  await expect(view(page, 'Reagents').locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
  found.push(...(await wrongOn(page, 'reagent page', dark)));

  await choose('Precursors');
  const precursors = view(page, 'Precursors');
  const pick = async (label: string, text: string, hit: string): Promise<void> => {
    const box = precursors.getByRole('searchbox', { name: label, exact: true });
    const option = precursors.getByRole('button', { name: hit, exact: true });
    await expect(async () => {
      await box.fill('');
      await box.fill(text);
      await expect(option).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 60_000 });
    await press(option);
  };
  await pick('Compound to make', 'propan-2-ol', 'Choose Propan-2-ol');
  await expect(precursors.locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
  found.push(...(await wrongOn(page, 'Precursors: made directly from', dark)));
  await pick('Start from (optional)', 'ethanol', 'Start from Ethanol');
  await press(precursors.getByRole('button', { name: 'Search', exact: true }));
  const first = precursors.getByRole('region', { name: 'Routes found' }).getByRole('list', { name: 'Routes' }).locator(':scope > li').first();
  await press(first.getByRole('button', { name: 'Show the reaction' }).first());
  await first.locator('article[data-reaction-id]').first().scrollIntoViewIfNeeded();
  await expect(first.locator('img[data-bond-px]').first()).toBeVisible({ timeout: 60_000 });
  found.push(...(await wrongOn(page, 'From A to B chain card', dark)));

  await choose('Mechanisms');
  const mechanisms = view(page, 'Mechanisms');
  await press(mechanisms.getByRole('button', { name: 'Aldol addition of ethanal' }));
  await expect(mechanisms.locator('svg[data-bond-px]').first()).toBeVisible({ timeout: 90_000 });
  found.push(...(await wrongOn(page, 'mechanism steps', dark)));
}

for (const scheme of ['dark', 'light'] as const) {
  const dark = scheme === 'dark';

  test(`desktop 1280, ${scheme}: every structure drawing is on a surface black ink reads on`, async ({ page }) => {
    test.setTimeout(480_000);
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await importAwkward(page);
    await leaveChapters(page);
    const found: string[] = [];
    await page.locator('svg [data-node-id="cls_aldehydes"]').dblclick();
    await familyAndEquation(page, found, dark, false);
    const item = AWKWARD.find((one) => one.n === 7);
    if (item === undefined) throw new Error('no cholesterol');
    await showRecord(page, 'r', reactionName(item), reactionId(item));
    await expect(pane(page).locator('[data-hero-equation]:not([data-compact]) img[data-bond-px]').filter({ visible: true }).first()).toBeVisible({ timeout: 60_000 });
    found.push(...(await wrongOn(page, 'inspector hero', dark)));
    const rail = page.getByRole('navigation', { name: 'Modes' });
    await modeViews(page, found, dark, (mode) => rail.getByRole('button', { name: new RegExp(`^${mode}`) }).click(), (target) => target.click());
    await rail.getByRole('button', { name: /^Chapters/ }).click();
    await view(page, 'Chapters').getByRole('list', { name: 'Chapters' }).locator('[data-chapter-id]').filter({ hasText: /Aldehydes/ }).getByRole('button').first().click();
    await expect(view(page, 'Chapters').locator('img[data-bond-px]').first()).toBeVisible({ timeout: 60_000 });
    found.push(...(await wrongOn(page, 'chapter page', dark)));
    expect(found).toEqual([]);
  });

  test.describe(`phone: Pixel 7 (Chromium), ${scheme}`, () => {
    test.use({ ...PIXEL, colorScheme: scheme });
    test('every structure drawing is on a surface black ink reads on', async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
      test.setTimeout(480_000);
      await openPhoneApp(page);
      await importAwkward(page);
      const found: string[] = [];
      await page.getByRole('button', { name: /^Aldehydes/ }).tap();
      await familyAndEquation(page, found, dark, true);
      await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Explore' }).tap();
      await modeViews(page, found, dark, async (mode) => void (await page.getByRole('combobox', { name: 'Show:' }).selectOption({ label: mode })), (target) => target.tap());
      expect(found).toEqual([]);
    });
  });
}
