/**
 * Step 8.3b (A1-A4): the map toolbar is ONE row (Zoom out, Zoom in, Fit, Chapter, Find, From A to B, Open family, Key, More); a narrow row moves
 * From A to B and Open family into More, and List (and Studio's Unanchored reactions) always live there. The legend is the Key popover and the
 * selection is a visually hidden live region plus the label inside the map. These helpers hide that from the specs. Test code only.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';

const toolbar = (page: Page): Locator => page.getByRole('toolbar', { name: 'Canvas tools' });

/** The action as a button of the row, or as an item of More (the row is narrow, or the action always lives there). Not clicked. */
export async function toolbarAction(page: Page, name: string | RegExp): Promise<Locator> {
  const inRow = toolbar(page).getByRole('button', { name });
  if ((await inRow.count()) > 0) return inRow.first();
  const item = page.getByRole('menuitem', { name });
  if ((await item.count()) === 0) await toolbar(page).getByRole('button', { name: 'More' }).click();
  return item.first();
}

/** Clicks a toolbar action wherever it is. */
export async function clickToolbar(page: Page, name: string | RegExp): Promise<void> {
  await (await toolbarAction(page, name)).click();
}

/** Opens the Key popover (the legend) and returns it. */
export async function openKey(page: Page): Promise<Locator> {
  const popover = page.getByRole('dialog', { name: 'Key' });
  if ((await popover.count()) === 0) await toolbar(page).getByRole('button', { name: 'Key' }).click();
  await expect(popover).toBeVisible();
  return popover;
}

/** Closes the Key popover with Esc. */
export async function closeKey(page: Page): Promise<void> {
  if ((await page.getByRole('dialog', { name: 'Key' }).count()) > 0) await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Key' })).toHaveCount(0);
}

/** The visually hidden live region that says what is selected on the map ("Nothing is selected." / "Selected: ..."). */
export const selectionLine = (page: Page): Locator => page.locator('[data-selection-line]');

/** The label inside the map's top-left corner: "Selected: A → B" with a ✕ (the hint when nothing is selected). */
export const cornerLabel = (page: Page): Locator => page.locator('[data-map-corner]');

/** Step 8.3b close, 3b: the hint in the map's top-left corner is not drawn over any box (Fit leaves its band free). Returns the overlaps found. */
export async function hintOverlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hint = document.querySelector('[data-map-corner]');
    if (hint === null) return ['the hint is not on screen'];
    const h = hint.getBoundingClientRect();
    const found: string[] = [];
    for (const node of document.querySelectorAll('[data-layer="nodes"] [data-node-id]')) {
      const b = node.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.left < h.right && b.right > h.left && b.top < h.bottom && b.bottom > h.top) found.push(`${node.getAttribute('data-node-id')} (${Math.round(b.left)},${Math.round(b.top)} to ${Math.round(b.right)},${Math.round(b.bottom)}) under the hint (${Math.round(h.left)},${Math.round(h.top)} to ${Math.round(h.right)},${Math.round(h.bottom)})`);
    }
    return found;
  });
}
