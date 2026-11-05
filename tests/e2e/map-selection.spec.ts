/**
 * The map has ONE selection (step 8.2b-fix, S1 to S4; ADR-044 addendum), the STUDIO build over the own-data layout fixture with Unclassified
 * shown. The user's three sequences, by click on a desktop (1280 x 800) and by tap on a Pixel 7: the inspector's header names the family, the
 * ARROW ("<from> → <to>") or the bucket ("Compounds not in a family yet") that was picked last, never an earlier one. Also the arrow's end cards,
 * the bucket's chips and rows, and a small chapter whose two-way pair is ONE line with a head and a chip at each end. Screenshots go to screenshots/.
 */
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectClean, watch } from './kit';
import { shotsDir } from './editor-kit';
import { showUnclassified } from './map-focus-kit';
import { FAMILY_ONE, openMapDesktop, openMapPhone } from './map-layout-kit';

const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const BUCKET_ID = 'virtual:unclassified:hub';
const BUCKET_WORDS = 'Not in a family yet';
const edges = (page: Page) => page.locator('svg [data-layer="edges"] [data-edge-id]');
const node = (page: Page, id: string) => page.locator(`svg [data-node-id="${id}"]`);
const heading = (page: Page, name: string | RegExp) => page.getByRole('heading', { level: 3, name });
const familyName = (id: string): string => `Family ${id.replace('cls_family-', '')}`;

/** A screen point ON the arrow's own line that nothing else covers (a box or another arrow can lie over its middle), found with elementFromPoint. */
async function middleOf(page: Page, edgeId: string): Promise<{ x: number; y: number } | null> {
  const found = await page.evaluate((id) => {
    const path = document.querySelector(`svg [data-edge-id="${id}"] path[data-hit="true"]`) as SVGPathElement;
    const m = path.getScreenCTM() as DOMMatrix;
    const length = path.getTotalLength();
    for (const t of [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7, 0.25, 0.75, 0.2, 0.8, 0.15, 0.85]) {
      const at = path.getPointAtLength(length * t);
      const x = at.x * m.a + at.y * m.c + m.e;
      const y = at.x * m.b + at.y * m.d + m.f;
      const top = document.elementFromPoint(x, y)?.closest('[data-edge-id]');
      if (top !== null && top !== undefined && top.getAttribute('data-edge-id') === id) return { x, y };
    }
    return null;
  }, edgeId);
  return found;
}

/** The ids of the drawn arrows that match (from, to, stroke). */
async function drawn(page: Page, test: (from: string, to: string, stroke: string) => boolean): Promise<string[]> {
  const all = await edges(page).evaluateAll((gs) => gs.map((g) => [g.getAttribute('data-edge-id') ?? '', g.getAttribute('data-from') ?? '', g.getAttribute('data-to') ?? '', g.getAttribute('data-stroke') ?? '']));
  return all.filter(([, from, to, stroke]) => test(from as string, to as string, stroke as string)).map(([id]) => id as string);
}

/** The first of these arrows that has a point nothing covers, twice in a row (the phone's sheet may still be moving). */
async function uncovered(page: Page, ids: readonly string[]): Promise<string> {
  for (const id of ids) {
    if ((await middleOf(page, id)) === null) continue;
    await page.waitForTimeout(300);
    if ((await middleOf(page, id)) !== null) return id;
  }
  throw new Error('no arrow has a point that nothing covers');
}

async function pickArrow(page: Page, id: string, phone: boolean): Promise<void> {
  const holder: { at: { x: number; y: number } | null } = { at: null };
  await expect.poll(async () => ((holder.at = await middleOf(page, id)) === null ? 'covered' : 'free'), { message: `a point of arrow ${id} that nothing covers`, timeout: 10_000 }).toBe('free');
  const at = holder.at;
  if (at === null) throw new Error(`no uncovered point on arrow ${id}`);
  if (phone) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(450); // the double-click window (300 ms) before the inspector opens
}

async function pickNode(page: Page, id: string, phone: boolean): Promise<void> {
  if (phone) await node(page, id).tap();
  else await node(page, id).click();
  await page.waitForTimeout(450);
}

/** On a phone the legend is a sheet: Show brings Unclassified in. */
async function showUnclassifiedPhone(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Legend' }).tap();
  await page.getByRole('button', { name: 'Show', exact: true }).tap();
  await page.getByRole('button', { name: /^Close/ }).first().tap();
  await expect(page.locator('svg [data-box="unclassified"]')).toHaveCount(1);
}

/** Closes the inspector: the desktop pane's Hide button, the phone sheet's Close (the sheet covers the lower part of the map). */
async function closeInspector(page: Page, phone: boolean): Promise<void> {
  const close = page.getByRole('button', { name: phone ? 'Close inspector' : 'Hide inspector' });
  if ((await close.count()) === 0) return;
  if (phone) await close.first().tap();
  else await close.click();
  await page.waitForTimeout(500);
}

async function sequences(page: Page, phone: boolean, shots: { arrow: string; arrowBucket: string; bucket: string }): Promise<void> {
  // S-bug 1: a family is open, the inspector is closed, then Unclassified is picked: the bucket opens, not the old family
  await pickNode(page, FAMILY_ONE, phone);
  await expect(heading(page, familyName(FAMILY_ONE))).toBeVisible();
  await closeInspector(page, phone);
  await pickNode(page, BUCKET_ID, phone);
  await expect(heading(page, 'Compounds not in a family yet')).toBeVisible();
  await expect(heading(page, familyName(FAMILY_ONE))).toHaveCount(0);
  await page.screenshot({ path: shots.bucket });

  // S-bug 2: with the bucket in focus, a DASHED arrow into it: the header names the arrow; then a SOLID arrow out of it: the header changes
  await expect.poll(() => edges(page).count()).toBeGreaterThan(0);
  await closeInspector(page, phone); // the phone's sheet would cover the lower part of the map
  const intos = await drawn(page, (from, to, stroke) => to === BUCKET_ID && from !== BUCKET_ID && stroke === 'dashed');
  const outs = await drawn(page, (from, to, stroke) => from === BUCKET_ID && to !== BUCKET_ID && stroke === 'solid');
  expect(intos.length, 'an arrow into the bucket is dashed').toBeGreaterThan(0);
  expect(outs.length, 'an arrow out of the bucket is solid').toBeGreaterThan(0);
  const into = await uncovered(page, intos);
  const out = await uncovered(page, outs);
  const intoFrom = await page.locator(`svg [data-edge-id="${into}"]`).getAttribute('data-from');
  const outTo = await page.locator(`svg [data-edge-id="${out}"]`).getAttribute('data-to');
  await pickArrow(page, into as string, phone);
  await expect(heading(page, `${familyName(intoFrom as string)} → ${BUCKET_WORDS}`)).toBeVisible();
  await page.screenshot({ path: shots.arrowBucket });
  await closeInspector(page, phone);
  await pickArrow(page, out as string, phone);
  await expect(heading(page, `${BUCKET_WORDS} → ${familyName(outTo as string)}`)).toBeVisible();
  await expect(heading(page, familyName(intoFrom as string))).toHaveCount(0);

  // S-bug 3: a family, then the bucket, a compound opened from its list, then a solid arrow out of the bucket: its reactions show
  await pickNode(page, outTo as string, phone);
  await expect(heading(page, familyName(outTo as string))).toBeVisible();
  await pickNode(page, BUCKET_ID, phone);
  await expect(heading(page, 'Compounds not in a family yet')).toBeVisible();
  const row = page.getByRole('list', { name: 'Compounds in no family' }).getByRole('button').first();
  if (phone) await row.tap();
  else await row.click();
  await expect(page.getByRole('article', { name: 'Record' }).first()).toBeVisible();
  await expect.poll(() => drawn(page, (from, _to, stroke) => from === BUCKET_ID && stroke === 'solid').then((ids) => ids.length)).toBeGreaterThan(0);
  await closeInspector(page, phone);
  const again = await uncovered(page, await drawn(page, (from, to, stroke) => from === BUCKET_ID && to !== BUCKET_ID && stroke === 'solid'));
  const againTo = await page.locator(`svg [data-edge-id="${again}"]`).getAttribute('data-to');
  await pickArrow(page, again, phone);
  await expect(heading(page, `${BUCKET_WORDS} → ${familyName(againTo as string)}`)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Reactions on this arrow' }).first()).toBeVisible();

  // a family to family arrow is an arrow too (S2)
  await pickNode(page, FAMILY_ONE, phone);
  await expect.poll(() => drawn(page, (from, to) => from !== BUCKET_ID && to !== BUCKET_ID).then((ids) => ids.length)).toBeGreaterThan(0);
  await closeInspector(page, phone);
  const plain = await uncovered(page, await drawn(page, (from, to) => from !== BUCKET_ID && to !== BUCKET_ID));
  const [plainFrom, plainTo] = [await page.locator(`svg [data-edge-id="${plain}"]`).getAttribute('data-from'), await page.locator(`svg [data-edge-id="${plain}"]`).getAttribute('data-to')];
  await pickArrow(page, plain, phone);
  await expect(heading(page, `${familyName(plainFrom as string)} → ${familyName(plainTo as string)}`)).toBeVisible();
  await expect(page.getByText('Arrow', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: shots.arrow });
}

test.describe('the map selection on a desktop', () => {
  test.use({ actionTimeout: 60_000 });

  test('the three sequences: the inspector names the arrow or the bucket that was picked last', async ({ page }) => {
    test.setTimeout(400_000);
    const seen = await watch(page);
    await openMapDesktop(page);
    await showUnclassified(page);
    await sequences(page, false, {
      arrow: `${shotsDir()}/inspector-arrow-1280x800.png`,
      arrowBucket: `${shotsDir()}/inspector-arrow-bucket-1280x800.png`,
      bucket: `${shotsDir()}/inspector-bucket-1280x800.png`,
    });
    await expectClean(seen);
  });

  test('the bucket view: compounds with made-from and goes-on-to chips; a chip focuses a family, a row opens the compound; Back walks the selections', async ({ page }) => {
    test.setTimeout(400_000);
    const seen = await watch(page);
    await openMapDesktop(page);
    await showUnclassified(page);
    await pickNode(page, BUCKET_ID, false);
    const list = page.getByRole('list', { name: 'Compounds in no family' });
    await expect(list.getByRole('button', { name: /^Made from:/ }).first()).toBeVisible();
    await expect(page.getByText('Give these compounds a family in the content data')).toBeVisible();
    const chip = list.getByRole('button', { name: /^Made from:/ }).first();
    const chipFamily = ((await chip.textContent()) ?? '').replace(/^Made from: /, '').replace(/ \(\d+\)$/, '');
    await chip.click();
    await expect(heading(page, chipFamily)).toBeVisible();
    await page.getByRole('group', { name: 'History' }).getByRole('button', { name: 'Back' }).click();
    await expect(heading(page, 'Compounds not in a family yet')).toBeVisible();
    await expectClean(seen);
  });

  test('a small chapter: a two-way pair is ONE line with a head and a chip at each end', async ({ page }) => {
    test.setTimeout(400_000);
    const seen = await watch(page);
    await openMapDesktop(page);
    await page.getByRole('combobox', { name: 'Chapter' }).selectOption({ label: 'Chapter 4' });
    await expect.poll(() => edges(page).count()).toBe(3);
    const pair = page.locator('svg [data-edge-id][data-role="pair"]');
    await expect(pair).toHaveCount(1);
    await expect(pair.locator('path[marker-start]')).toHaveCount(1);
    await expect(pair.locator('path[marker-end]')).toHaveCount(1);
    const id = (await pair.getAttribute('data-edge-id')) as string;
    await expect(page.locator(`svg [data-count-of="${id}"]`)).toHaveCount(1);
    await expect(page.locator(`svg [data-count-extra-of="${id}"]`)).toHaveCount(1);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${shotsDir()}/map-merged-pair-1280x800.png` });
    await expectClean(seen);
  });
});

test.describe('the map selection on a phone (Pixel 7)', () => {
  test.use({ ...PIXEL, actionTimeout: 60_000 });

  test('the three sequences by tap: the sheet names the arrow or the bucket picked last', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(400_000);
    const seen = await watch(page);
    await openMapPhone(page);
    await showUnclassifiedPhone(page);
    await sequences(page, true, {
      arrow: `${shotsDir()}/inspector-arrow-pixel7.png`,
      arrowBucket: `${shotsDir()}/inspector-arrow-bucket-pixel7.png`,
      bucket: `${shotsDir()}/inspector-bucket-pixel7.png`,
    });
    await expectClean(seen);
  });

  test('Find is a 44 px button that opens the box over the row; the chapter select keeps the room', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(400_000);
    const seen = await watch(page);
    await openMapPhone(page);
    const find = page.getByRole('button', { name: 'Find a family' });
    const box = await find.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    const select = await page.getByRole('combobox', { name: 'Chapter' }).boundingBox();
    expect(select?.width ?? 0).toBeGreaterThan(110);
    await find.tap();
    const input = page.getByRole('combobox', { name: 'Find a family' });
    await expect(input).toBeFocused();
    const wide = await input.boundingBox();
    expect(wide?.width ?? 0).toBeGreaterThan(200);
    await input.press('Escape');
    await expect(find).toBeVisible();
    await page.screenshot({ path: `${shotsDir()}/map-find-family-pixel7.png` });
    await expectClean(seen);
  });
});
