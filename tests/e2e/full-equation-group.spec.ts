/**
 * The full equation of a card holds the WHOLE condition group (step 7.2b A5), the STUDIO production build, every engine. The demo's
 * "Propene + HBr" is changed in a copy imported as the visitor's own data: its minor outcome now makes Ethanol, so the reaction has a card in
 * two family sections. Each card's scheme shows only its section's product, but "Show full equation" on EACH card holds propene and both
 * products. Axe; zero CSP violations. Screenshot: full-equation-all-products-1280x800.png.
 */
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { cardOf } from './outcome-kit';
import { shotsDir } from './editor-kit';
import { changedDemo, importOwn, recordsOf } from './own-data-kit';

test('"Show full equation" shows every product of the group on each of the two cards', async ({ page }) => {
  test.setTimeout(300_000);
  const seen = await watch(page);
  const file = changedDemo((records) => {
    const reaction = recordsOf<{ name: string; outcomes: { id: string; products: { ref: { kind: string; id: string } }[] }[] }>(records, 'reaction').find((one) => one.name === 'Propene + HBr');
    const minor = reaction?.outcomes.find((one) => one.id === 'out_propene-hbr-2');
    if (minor?.products[0] === undefined) throw new Error('the demo has no Propene + HBr minor outcome');
    minor.products[0].ref = { kind: 'species', id: 'spc_ethanol' };
  });
  await importOwn(page, file);
  await page.locator('svg [data-node-id="cls_alkenes"]').dblclick();
  await expect(page.getByRole('region', { name: /^Family page: Alkenes/ })).toBeVisible();
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
  const cards = cardOf(page, /^Propene \+ HBr$/);
  await expect(async () => {
    await page.locator('[data-virtual-list]').first().evaluate((element) => element.scrollBy(0, 300));
    expect(await cards.count()).toBe(2);
  }).toPass({ timeout: 60_000 });
  for (let i = 0; i < 2; i += 1) {
    const card = cards.nth(i);
    await card.scrollIntoViewIfNeeded();
    // the scheme: one product only (the section's)
    expect(await card.locator('[data-outcome-id] [data-substance-id]').count()).toBe(1);
    await card.getByText('Show full equation').click();
    const scheme = card.locator('details[data-equation-panel]').getByRole('group', { name: 'Full equation' });
    await expect(scheme).toBeVisible();
    await expect(scheme.getByRole('group', { name: '2-Bromopropane', exact: true })).toHaveCount(1);
    await expect(scheme.getByRole('group', { name: 'Ethanol', exact: true })).toHaveCount(1);
    await expect(scheme.getByRole('group', { name: 'Propene', exact: true })).toHaveCount(1);
  }
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/full-equation-all-products-1280x800.png` });
  await expectClean(seen);
});
