/**
 * Step 8.4b: selecting a family must not move the map's top edge or change its height (the "Selected:" label is an overlay INSIDE the map, never in
 * the page flow). In Firefox the map moved down 12.4 px; this spec logs the boxes of what lies above the map before and after (into the test's
 * annotations and the console, for the notes) and fails on any change of the map's y or height. Own-data layout fixture, Studio, 1280 x 800.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { clickNode, chipsSettled } from './map-focus-kit';
import { FAMILY_ONE, openMapDesktop } from './map-layout-kit';

async function boxes(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const of = (name: string, el: Element | null): [string, string] => {
      if (el === null) return [name, 'absent'];
      const b = el.getBoundingClientRect();
      return [name, `y=${b.y.toFixed(1)} h=${b.height.toFixed(1)} w=${b.width.toFixed(1)}`];
    };
    const main = document.querySelector('[class*="_main_"]');
    const corner = document.querySelector('[data-map-corner]');
    const layer = document.querySelector('[data-map-toolbar]'); // step 8.4e: the label sits in the floating layer, which is what is absolute
    return Object.fromEntries([
      of('header', document.querySelector('header')),
      of('notices band', document.querySelector('section[aria-label="Notices"]')),
      of('banners row', main?.previousElementSibling ?? null),
      of('main column', main),
      of('map toolbar', document.querySelector('[data-map-toolbar]')),
      of('selected label', corner),
      ['selected label position', corner === null || layer === null ? 'absent' : getComputedStyle(layer).position],
      of('map area', document.querySelector('svg[role="group"]')),
    ]);
  });
}

test('selecting a family does not move the map: its y and height stay, the label is absolute', async ({ page }, info) => {
  test.setTimeout(300_000);
  await openMapDesktop(page);
  const before = await boxes(page);
  await clickNode(page, page.locator(`svg [data-node-id="${FAMILY_ONE}"]`));
  await chipsSettled(page);
  await expect(page.locator('[data-map-corner]')).toBeVisible();
  const after = await boxes(page);
  const log = Object.keys(before).map((key) => `${key}: ${before[key]}  ->  ${after[key]}`).join('\n');
  info.annotations.push({ type: 'boxes', description: log });
  console.log(`BOXES (${info.project.name})\n${log}`);
  expect(after['selected label position']).toBe('absolute');
  const yh = (v: string | undefined): string => (v ?? '').split(' w=')[0] ?? '';
  expect(yh(after['map area']), log).toBe(yh(before['map area']));
});
