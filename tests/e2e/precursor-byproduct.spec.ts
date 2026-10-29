/**
 * "Also formed as a by-product" in Precursors (step 7.2b A3), the STUDIO production build, every engine. The demo has no compound that
 * a reaction forms only as a by-product, so a copy is imported as the visitor's own data: the main product of "Ethanol → ethanal (PCC)"
 * becomes a by-product. Ethanal then has the line "Also formed as a by-product in 1 reaction" and the button opens Reactions filtered to
 * Ethanal as a Product. Axe; zero CSP violations.
 */
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { changedDemo, importOwn, recordsOf } from './own-data-kit';

test('the by-product line, and its button opens Reactions with Ethanal as a Product', async ({ page }) => {
  test.setTimeout(300_000);
  const seen = await watch(page);
  const file = changedDemo((records) => {
    const reaction = recordsOf<{ name: string; outcomes: { products: { ref: { id: string }; role: string }[] }[] }>(records, 'reaction').find((one) => one.name === 'Ethanol → ethanal (PCC)');
    const product = reaction?.outcomes[0]?.products.find((one) => one.ref.id === 'spc_ethanal');
    if (product === undefined) throw new Error('the demo has no ethanal product in the PCC reaction');
    product.role = 'byproduct';
  });
  await importOwn(page, file);
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Precursors' }).click();
  const view = page.getByRole('region', { name: 'Precursors', exact: true });
  const box = view.getByRole('searchbox', { name: 'Compound to make', exact: true });
  const hit = view.getByRole('button', { name: 'Choose Ethanal', exact: true });
  await expect(async () => {
    await box.fill('');
    await box.fill('ethanal');
    await expect(hit).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 60_000 });
  await hit.click();
  await expect(view.getByText('Also formed as a by-product in 1 reaction')).toBeVisible();
  expect(await axeProblems(page)).toEqual([]);
  await view.getByRole('button', { name: 'Show these reactions in Reactions' }).click();
  await expect(page.getByRole('heading', { name: 'Reactions', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Reactions', exact: true }).getByText('Ethanal').first()).toBeVisible();
  await expectClean(seen);
});
