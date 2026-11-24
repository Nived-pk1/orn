/**
 * Step 8.5c C0 (owner, live site): every arrow the map draws STARTS on the border of its from-family's box and ENDS on the border of its to-family's
 * box (within 3 px), in every view the owner can reach: All chapters and each chapter, no selection and a family selected, before and after pan and zoom.
 * An arrow whose end family is not a drawn box is a failure (the old arrow spec skipped it silently). Test code only.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { chooseFile, expectPreview, leaveChapters, loadDemo, openApp } from './kit';
import { showUnclassified } from './map-focus-kit';
import { measure } from './readability';

const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const TOLERANCE = 3;
const NL = String.fromCharCode(10);

export interface Failure {
  readonly edge: string;
  readonly from: string;
  readonly to: string;
  readonly end: 'start' | 'end';
  readonly off: number | 'no box';
}

/** Every drawn arrow's two ends against the boxes of its two families, in world coordinates. */
export async function arrowEndFailures(page: Page): Promise<{ checked: number; failures: Failure[] }> {
  const m = await measure(page);
  const parts = new Map<string, typeof m.segments>();
  for (const s of m.segments) parts.set(s.id, [...(parts.get(s.id) ?? []), s]);
  const failures: Failure[] = [];
  let checked = 0;
  for (const [edge, list] of parts) {
    const first = list[0] as (typeof m.segments)[number];
    const last = list[list.length - 1] as (typeof m.segments)[number];
    if (first.from === first.to) continue;
    for (const [end, nodeId, x, y] of [['start', first.from, first.x1, first.y1], ['end', first.to, last.x2, last.y2]] as const) {
      checked += 1;
      const box = m.nodes.find((n) => n.id === nodeId);
      if (box === undefined) {
        failures.push({ edge, from: first.from, to: first.to, end, off: 'no box' });
        continue;
      }
      // the distance from the point to the BORDER of the rectangle (inside or outside)
      const dx = Math.max(box.x - x, 0, x - (box.x + box.width));
      const dy = Math.max(box.y - y, 0, y - (box.y + box.height));
      const outside = Math.hypot(dx, dy);
      const inside = Math.min(x - box.x, box.x + box.width - x, y - box.y, box.y + box.height - y);
      const off = outside > 0 ? outside : Math.abs(inside);
      if (off > TOLERANCE) failures.push({ edge, from: first.from, to: first.to, end, off: Math.round(off * 10) / 10 });
    }
  }
  return { checked, failures };
}

const DATA = process.env.ORN_ARROW_DATA;
async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  if (DATA === undefined) await loadDemo(page);
  else {
    await chooseFile(page, { name: (DATA.split('/').at(-1) ?? 'data').split(String.fromCharCode(92)).at(-1) as string, mimeType: 'application/octet-stream', buffer: readFileSync(DATA) });
    await expectPreview(page);
    await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 120_000 });
    await leaveChapters(page);
  }
  await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(800);
}

async function report(page: Page, label: string, out: string[]): Promise<void> {
  const r = await arrowEndFailures(page);
  out.push(`${label}: ${r.checked} ends checked, ${r.failures.length} off`);
  for (const f of r.failures) out.push(`   ${f.edge} (${f.from} -> ${f.to}) ${f.end}: ${f.off}`);
}

async function everyFamily(page: Page, label: string, lines: string[]): Promise<void> {
  const ids = await page.evaluate(() => [...document.querySelectorAll('svg [data-node-id][data-box="hub"], svg [data-node-id][data-box="unclassified"]')].map((el) => el.getAttribute('data-node-id') ?? ''));
  for (const id of ids) {
    await page.locator(`svg [data-node-id="${id}"]`).click({ force: true });
    await page.waitForTimeout(450);
    await report(page, `${label}, selected ${id}`, lines);
  }
}
const failing = (lines: string[]): string[] => lines.filter((l) => /ends checked/.test(l) && !/, 0 off$/.test(l));

test('every arrow end of the map is on the border of its family box: all chapters and each chapter, a selected family, after pan, zoom and resize, the bucket shown', async ({ page }) => {
  test.setTimeout(280_000);
  await open(page);
  const lines: string[] = [];
  await report(page, 'overview', lines);
  await everyFamily(page, 'all chapters', lines);
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(500);
  await report(page, 'after zoom', lines);
  await page.mouse.down();
  await page.mouse.move(520, 340, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await report(page, 'after pan', lines);
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForTimeout(800);
  await report(page, 'after resize', lines);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(600);
  await showUnclassified(page);
  await everyFamily(page, 'bucket shown', lines);
  const chapter = page.getByRole('combobox', { name: 'Chapter' });
  const options = await chapter.locator('option').evaluateAll((all) => all.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ''));
  for (const value of options.slice(0, 6)) {
    await chapter.selectOption(value);
    await page.waitForTimeout(700);
    await report(page, `chapter ${value}`, lines);
    await everyFamily(page, `chapter ${value}`, lines);
  }
  console.log(lines.join(NL));
  expect(failing(lines), lines.join(NL)).toEqual([]);
});

test('phone: every arrow end is on the border of its family box (Pixel 7 size), a family selected', async ({ page }) => {
  test.setTimeout(200_000);
  await open(page);
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(800);
  const lines: string[] = [];
  await report(page, 'phone overview', lines);
  await everyFamily(page, 'phone', lines);
  expect(failing(lines), lines.join(NL)).toEqual([]);
});
