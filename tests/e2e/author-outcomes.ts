/**
 * The outcomes of a reaction, entered through the editor (step 6.9, Part 2): selectivity, "Holds under", regiochemistry, isomer group,
 * stereochemistry (with descriptors and note), rationale, the mechanism and its variant, and the products with their roles and fields.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';
import { substanceOrCreate } from './author-nested';
import type { DemoRecords } from './author-data';
import { asBag, asList, chooseText, exactly, nameOfDemo, spaced } from './author-helpers';

type Bag = Record<string, unknown>;
const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

async function product(dialog: Locator, page: Page, demo: DemoRecords, o: number, at: number, item: Bag): Promise<void> {
  const ref = asBag(item['ref']);
  await substanceOrCreate(dialog, page, demo, `Find a product of outcome ${o} by name`, `Products found for outcome ${o}`, String(ref['kind']), String(ref['id']));
  const n = at + 1;
  const roles = dialog.getByRole('group', { name: `Role of product ${n} of outcome ${o}`, exact: true });
  await roles.getByRole('radio', { name: new RegExp(`^${cap(String(item['role']))}`) }).check();
  const row = dialog.getByRole('group', { name: `Product ${n} of outcome ${o}`, exact: true });
  if (['coefficient', 'phase', 'originalText', 'note'].some((key) => item[key] !== undefined)) {
    const more = row.locator('details').first();
    if (!(await more.evaluate((element) => (element as HTMLDetailsElement).open))) await more.locator('summary').click();
  }
  const optional = [['Coefficient', 'coefficient'], ['Phase', 'phase'], ['Source wording', 'originalText'], ['Note', 'note']] as const;
  for (const [label, key] of optional) {
    if (item[key] === undefined) continue;
    const box = row.getByLabel(`${label} of product ${n} of outcome ${o}`, { exact: true });
    if (key === 'phase') await box.selectOption(String(item[key]));
    else await box.fill(String(item[key]));
  }
}

async function oneOutcome(dialog: Locator, page: Page, demo: DemoRecords, rxn: Bag, at: number, outcome: Bag): Promise<void> {
  const o = at + 1;
  const label = (what: string): Locator => dialog.getByLabel(`${what} of outcome ${o}`, { exact: true });
  await dialog.getByRole('button', { name: 'Add outcome', exact: true }).click();
  await expect(dialog.getByTestId('outcome-row')).toHaveCount(o);
  const open = dialog.getByRole('button', { name: `Edit outcome ${o}`, exact: true });
  if (await open.count()) await open.click();
  await label('Selectivity').selectOption(String(outcome['selectivity']));
  const variantIds = outcome['conditionVariantIds'] as string[];
  for (const id of variantIds) {
    const at2 = asList(rxn['conditionVariants']).findIndex((variant) => variant['id'] === id);
    const name = String(asList(rxn['conditionVariants'])[at2]?.['label']);
    await dialog.getByLabel(`${name}: outcome ${o}`, { exact: true }).check();
  }
  if (typeof outcome['regiochemistry'] === 'string') await label('Regiochemistry').fill(outcome['regiochemistry']);
  if (typeof outcome['isomerGroup'] === 'string') await label('Isomer group').fill(outcome['isomerGroup']);
  const stereo = asBag(outcome['stereochemistry']);
  if (typeof stereo['outcome'] === 'string') {
    await chooseText(label('Stereochemical outcome'), new RegExp(`^${spaced(stereo['outcome'])}$`, 'i'));
    for (const descriptor of (stereo['descriptors'] as string[]) ?? []) {
      await dialog.getByLabel('Add a descriptor (for example Z)').last().fill(descriptor);
      await dialog.getByRole('button', { name: `Add descriptor to outcome ${o}`, exact: true }).click();
    }
    if (typeof stereo['note'] === 'string') await label('Stereochemistry note').fill(stereo['note']);
  }
  if (typeof outcome['rationale'] === 'string') await label('Rationale').fill(outcome['rationale']);
  const link = asBag(outcome['mechanism']);
  if (typeof link['mechanismId'] === 'string') {
    await chooseText(label('Mechanism'), exactly(nameOfDemo(demo, 'mechanism', link['mechanismId'])));
    if (typeof link['variantId'] === 'string') {
      const variants = asList(asBag(demo['mechanism']?.[link['mechanismId']])['variants']);
      const wanted = String(variants.find((variant) => variant['id'] === link['variantId'])?.['label'] ?? '');
      await chooseText(label('Variant'), new RegExp(wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  }
  for (const [pAt, item] of asList(outcome['products']).entries()) await product(dialog, page, demo, o, pAt, item);
  const close = dialog.getByRole('button', { name: `Close outcome ${o}`, exact: true });
  if (await close.count()) await close.click();
}

export async function authorOutcomes(dialog: Locator, page: Page, demo: DemoRecords, rxn: Bag): Promise<void> {
  for (const [at, outcome] of asList(rxn['outcomes']).entries()) await oneOutcome(dialog, page, demo, rxn, at, outcome);
}
