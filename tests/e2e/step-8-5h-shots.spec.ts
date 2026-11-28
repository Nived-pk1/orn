/**
 * Step 8.5h Part A (screenshots for the reviewer; the review project, on demand; Chromium, demo data, Studio build): aldol steps 1 to 3 and the
 * SN2 step, desktop 1280 x 800 light and dark; the DNP hydrazone and phorone in Full on a family card (swapped into a copy of the demo).
 * The BEFORE pictures are the 8.5g "after" ones and the owner's two.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { exampleCard, leaveChapters } from './kit';
import { changedDemo, importOwn, recordsOf } from './own-data-kit';
import { paintSettled } from './settled-kit';
import { setStructures } from './size-rule-kit';

test.use({ actionTimeout: 60_000, deviceScaleFactor: 2 });
const rail = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const view = (page: Page) => page.getByRole('region', { name: 'Mechanisms', exact: true });

async function both(page: Page, target: Locator, name: string): Promise<void> {
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await paintSettled(page);
    await target.screenshot({ path: `screenshots/8.5h/after-${name}-${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

async function openMechanism(page: Page, name: string): Promise<void> {
  if (!(await view(page).isVisible())) {
    await leaveChapters(page);
    await rail(page).getByRole('button', { name: 'Mechanisms' }).click();
  }
  await view(page).getByRole('list', { name: 'Mechanisms' }).locator('[data-mechanism-id]').filter({ hasText: name }).getByRole('button', { name }).click();
  await expect(view(page).getByRole('heading', { level: 2, name })).toBeVisible();
}
const drawn = (scope: Locator): Locator => scope.getByRole('img', { name: /^Drawing of step \d+; the details are below\.$/ });

test('desktop: aldol steps 1 to 3 and the SN2 step', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'screenshots are taken in Chromium');
  test.setTimeout(480_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await importOwn(page, changedDemo(() => undefined));
  await openMechanism(page, 'Aldol addition of ethanal');
  for (const [title, name] of [['Hydroxide removes an α-hydrogen to give the enolate', 'aldol-1-desktop'], ['Enolate carbon attacks a second ethanal', 'aldol-2-desktop'], ['Alkoxide is protonated by water', 'aldol-3-desktop']] as const) {
    const one = view(page).locator('[data-step]').filter({ hasText: title }).first();
    await expect(drawn(one)).toBeVisible({ timeout: 90_000 });
    await one.scrollIntoViewIfNeeded();
    await both(page, one, name);
  }
  await view(page).getByRole('button', { name: 'All mechanisms' }).click();
  await openMechanism(page, 'SN2 substitution of a haloalkane');
  const sn2 = view(page).locator('[data-step]').first();
  await expect(drawn(sn2)).toBeVisible({ timeout: 90_000 });
  await both(page, sn2, 'sn2-desktop');
});

test('desktop: the DNP hydrazone and phorone with all atoms', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'screenshots are taken in Chromium');
  test.setTimeout(480_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const swapped = changedDemo((records) => {
    const species = recordsOf<{ id: string; structure?: unknown }>(records, 'species');
    for (const [id, value, called] of [['spc_ethanal', 'CC(C)=NNc1ccc([N+](=O)[O-])cc1[N+](=O)[O-]', 'Propanone 2,4-DNP hydrazone'], ['spc_ethanol', 'CC(C)=CC(=O)C=C(C)C', 'Phorone']] as const) {
      const found = species.find((s) => s.id === id) as { structure?: unknown; names?: { canonical: string } } | undefined;
      if (found === undefined) throw new Error(`no ${id}`);
      found.structure = { format: 'smiles', value };
      found.names = { ...found.names, canonical: called };
    }
  });
  await importOwn(page, swapped);
  await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
  await page.getByRole('button', { name: /^Aldehydes\s*\d+\s*reactions?$/ }).last().click();
  await setStructures(page, 'Full');
  const card = await exampleCard(page, /ethanal \(PCC\)/);
  await card.scrollIntoViewIfNeeded();
  for (const [name, file] of [['Structure of Propanone 2,4-DNP hydrazone', 'full-dnp-hydrazone'], ['Structure of Phorone', 'full-phorone']] as const) {
    const picture = card.getByRole('img', { name }).first();
    await expect(picture).toBeVisible({ timeout: 90_000 });
    await both(page, picture.locator('xpath=ancestor::figure[1]'), file);
  }
});
