/**
 * Step 8.2a: the map draws a focus, not every arrow. The readability and arrow-geometry specs used to measure the whole overview at once; they now
 * visit every family in turn (a click focuses it: its arrows in and out are drawn), measure what is drawn, and join the measurements.
 * Test code only.
 */
import type { Page } from '@playwright/test';
import { expect } from './fixtures';
import { closeKey, openKey } from './map-toolbar-kit';
import { measure, type Measured } from './readability';

/** The ids of the family boxes that are drawn (Unclassified included when it is shown). */
export async function familyIds(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll('svg [data-node-id][data-box="hub"], svg [data-node-id][data-box="unclassified"]')].map((el) => el.getAttribute('data-node-id') ?? '').sort());
}

/** Shows the Unclassified box (the legend's Show), so its arrows can be focused too. */
export async function showUnclassified(page: Page): Promise<void> {
  const show = (await openKey(page)).getByRole('button', { name: 'Show', exact: true }); // the legend is the Key popover (step 8.3b, A3)
  if ((await show.count()) > 0) await show.click();
  await closeKey(page);
  await expect(page.locator('svg [data-box="unclassified"]')).toHaveCount(1);
}

/** Focuses a family by clicking its box, and waits until the drawing has settled on it. */
export async function focusFamily(page: Page, id: string): Promise<void> {
  await page.locator(`svg [data-node-id="${id}"]`).click();
  await page.waitForTimeout(350); // the hover preview (150 ms) and the fade (150 ms) have settled
}

/** Visits every family in turn and calls `each` with what is drawn for it. */
export async function eachFocus(page: Page, each: (id: string, drawn: Measured) => void | Promise<void>): Promise<void> {
  for (const id of await familyIds(page)) {
    await focusFamily(page, id);
    await each(id, await measure(page));
  }
}

/** The union of several measurements: every drawn route once (by edge id), every chip and label once, the boxes of the first. */
export function joined(parts: readonly Measured[]): Measured {
  const first = parts[0];
  if (first === undefined) throw new Error('nothing was measured');
  const seen = new Set<string>();
  const labels: Measured['labels'] = [];
  const segments: Measured['segments'] = [];
  const edges = new Set<string>();
  for (const part of parts) {
    for (const label of part.labels) {
      if (seen.has(label.id)) continue;
      seen.add(label.id);
      labels.push(label);
    }
    const mine = new Set<string>();
    for (const s of part.segments) {
      if (edges.has(s.id)) continue;
      mine.add(s.id);
      segments.push(s);
    }
    for (const id of mine) edges.add(id);
  }
  return { labels, nodes: first.nodes, bounds: first.bounds, segments };
}

/**
 * The same walk at any zoom, by keyboard: the drawing takes the focus, Tab moves to the next family (and brings it into the window), Enter
 * focuses it (its arrows are drawn). A click cannot reach a family that is out of the window at LOD 2; the keyboard can.
 */
export async function eachFocusByKeyboard(page: Page, each: (id: string, drawn: Measured) => void | Promise<void>): Promise<void> {
  const total = (await familyIds(page)).length;
  const svg = page.locator('svg[role="group"]');
  // a key press tells the drawing the next focus is the keyboard's (after a mouse press it names no family and draws no ring)
  await svg.focus();
  await page.keyboard.press('Shift');
  await svg.blur();
  await svg.focus();
  // go back to the first family (the drawing may remember the last one a click focused): Shift+Tab until it leaves the drawing, then take the focus again
  for (let i = 0; i < total + 1; i += 1) {
    if ((await svg.getAttribute('aria-activedescendant')) === null) break;
    await page.keyboard.press('Shift+Tab');
  }
  await svg.focus();
  for (let i = 0; i < total; i += 1) {
    if (i > 0) await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(350);
    const id = await page.locator('svg[role="group"]').getAttribute('aria-activedescendant');
    await each(id ?? `family ${i + 1}`, await measure(page));
  }
}
