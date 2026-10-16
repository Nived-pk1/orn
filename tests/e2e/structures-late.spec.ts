/**
 * Phone mode B, part 1: a family page opened right after "Load demo dataset" while the RDKit wasm is still on its way (a slow phone) draws
 * its structures BY ITSELF when the engine becomes ready, without reopening the page. The wasm request is held for 14 s (longer than the
 * depiction manager's 8 s timeout, so the first requests fail as "not ready"); the cards keep their name and formula and say "Drawing the
 * structure…" (no error look) meanwhile. Chromium only: a request made by a worker is routed by the context there.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { loadDemo, openApp } from './kit';

const WASM_HELD_MS = 14_000;

test.describe('structures asked for before the engine is ready', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the held wasm request is made by a worker; only Chromium routes those through the context');

  test('open Alcohols right after the demo loads: the structures appear without reopening the page', async ({ page, context }) => {
    test.setTimeout(150_000);
    let held = 0;
    await context.route('**/*.wasm', async (route) => {
      held += 1;
      await new Promise((resolve) => setTimeout(resolve, WASM_HELD_MS));
      await route.continue().catch(() => undefined);
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await loadDemo(page);
    await openAlcohols(page);
    await page.getByRole('button', { name: /^Aldehydes\s*3\s*reactions$/ }).click();
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name: 'Ethanol → ethanal (PCC)' }) });
    await expect(card).toBeVisible();
    // not drawn yet: the wasm is held; the card says so, in words, without an error look
    await expect(card.getByText('Drawing the structure…').first()).toBeVisible();
    await expect(card.locator('[title="The structure could not be drawn"]')).toHaveCount(0);
    await expect(card.locator('img[alt^="Structure of"]')).toHaveCount(0);
    // then, by itself
    await expect(card.locator('img[alt^="Structure of"]').first()).toBeVisible({ timeout: 90_000 });
    expect(held).toBeGreaterThan(0);
  });
});

async function openAlcohols(page: Page): Promise<void> {
  await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
  await expect(page.getByRole('region', { name: 'Family page: Alcohols' })).toBeVisible();
}
