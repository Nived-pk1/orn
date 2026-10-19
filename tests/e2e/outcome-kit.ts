/** Shared by the outcome-group specs (desktop and phone). */
import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';

export const cardOf = (page: Page, title: RegExp): Locator => page.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name: title }) });

/** The family page lists its cards in a virtual list: scroll until the card is there. */
export async function findCard(page: Page, title: RegExp): Promise<Locator> {
  const card = cardOf(page, title).first();
  for (let step = 0; step < 60 && (await cardOf(page, title).count()) === 0; step += 1) {
    await page.locator('[data-virtual-list]').first().evaluate((element) => element.scrollBy(0, 400));
    await page.waitForTimeout(120);
  }
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  return card;
}

export const box = async (locator: Locator) => {
  const found = await locator.boundingBox();
  if (found === null) throw new Error('no box');
  return found;
};

export async function shot(page: Page, card: Locator, file: string): Promise<void> {
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `screenshots/${file}` });
}

