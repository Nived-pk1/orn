/**
 * The family page on a phone (phone mode B, part 2; ADR-039), PRODUCTION build, as a visitor on two touch devices: Playwright's "iPhone 14"
 * (WebKit) and "Pixel 7" (Chromium; Firefox has no touch emulation and skips). From the Families tab: the page uses the whole width in one
 * column, a back button "< Families" (no "Overview", no "Selected:" line), a reaction drawn top to bottom (reactant, a downward arrow of about
 * 48 px, products; each structure at most 45% of the width), a card tapped at the bottom of the list is brought above the peek of the sheet and
 * the last card can be scrolled fully above it (the page keeps the sheet's height at its bottom), no auto-close on scroll, a tap on the
 * record's name toggles peek and full. axe on the page and at peek. Screenshots: screenshots/phone3-<device>-<n>-<stop>.png.
 */
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, openPhoneApp, watch } from './kit';

const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const sheet = (page: Page) => page.locator('aside[data-sheet]');
const list = (page: Page) => page.locator('[data-virtual-list]');
const box = async (locator: ReturnType<Page['locator']>) => {
  const found = await locator.boundingBox();
  if (found === null) throw new Error('no box');
  return found;
};

async function shot(page: Page, device: string, n: number, name: string): Promise<void> {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `screenshots/phone3-${device}-${n}-${name}.png` });
}

/** The arrow is centred on the column, at least 48 px and as tall as its text + 16 px; the text is right of it, inside the card. */
async function expectArrowLayout(card: ReturnType<Page['locator']>, viewport: number): Promise<void> {
  const cardBox = await box(card);
  for (const arrow of await card.locator('[data-arrow][data-direction="down"]').all()) {
    const row = await box(arrow);
    const shaft = await box(arrow.locator('[data-arrow-line]'));
    const text = await box(arrow.locator('[data-arrow-text]'));
    expect(shaft.height, 'the arrow is at least 48 px').toBeGreaterThanOrEqual(47.5);
    expect(shaft.height, 'the arrow is as tall as its text block (text + 16 px of padding)').toBeGreaterThanOrEqual(text.height - 0.5);
    expect(Math.abs(shaft.x + shaft.width / 2 - (row.x + row.width / 2)), 'the arrow is centred on the column').toBeLessThanOrEqual(1.5);
    expect(text.x, 'the text is right of the arrow').toBeGreaterThanOrEqual(shaft.x + shaft.width - 0.5);
    expect(text.x + text.width, 'nothing overflows the card').toBeLessThanOrEqual(Math.min(cardBox.x + cardBox.width, viewport) + 0.5);
    const middle = shaft.y + shaft.height / 2;
    expect(Math.abs(text.y + text.height / 2 - middle), 'the text is vertically centred on the arrow').toBeLessThanOrEqual(2);
  }
}

async function walk(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await page.getByRole('button', { name: /^Alcohols/ }).tap();
  const family = page.getByRole('region', { name: 'Family page: Alcohols' });
  await expect(family).toBeVisible();
  const width = page.viewportSize()?.width ?? 0;

  // the back button and no "Selected:" line
  await expect(family.getByRole('button', { name: '< Families' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Overview' })).toHaveCount(0);
  await expect(page.getByText(/^Selected: reaction /)).toHaveCount(0);
  await expect(page.getByText('Nothing is selected.')).toHaveCount(0);
  // the whole width, one column
  const pageBox = await box(family);
  expect(pageBox.width, 'the page uses the whole width').toBeGreaterThanOrEqual(width - 1);
  await shot(page, device, 1, 'family-top');
  expect(await axeProblems(page, 10), 'axe on the family page').toEqual([]);

  // a reaction scheme from top to bottom
  await page.getByRole('button', { name: /^Aldehydes\s*3\s*reactions$/ }).tap();
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name: 'Ethanol → ethanal (PCC)' }) });
  await expect(card).toBeVisible();
  const scheme = card.getByRole('group').first();
  const figures = scheme.locator('figure');
  const arrow = scheme.locator('[data-arrow]');
  await expect(arrow).toHaveAttribute('data-direction', 'down');
  const reactant = await box(figures.first());
  const down = await box(arrow);
  const product = await box(figures.last());
  expect(reactant.y + reactant.height, 'the reactant is above the arrow').toBeLessThanOrEqual(down.y + 1);
  expect(down.y + down.height, 'the arrow is above the products').toBeLessThanOrEqual(product.y + 1);
  await expectArrowLayout(card, width);
  for (const figure of await figures.all()) expect((await box(figure)).width, 'a structure is at most 45% of the width').toBeLessThanOrEqual(width * 0.45 + 1);
  expect((await box(card)).width, 'the card uses the width').toBeGreaterThanOrEqual(width - 40);
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: `screenshots/phone4-${device}-pcc-card.png` });
  await shot(page, device, 2, 'scheme');

  // a tapped card: its top just under the bar, as much of it as possible above the peek (the PCC card fits), the page runs behind the sheet
  await card.getByRole('heading', { level: 4 }).getByRole('button').tap();
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'peek');
  await page.waitForTimeout(1_000);
  {
    const peekBox = await box(sheet(page));
    const area = await box(list(page));
    const cardBox = await box(card);
    const viewport = page.viewportSize()?.height ?? 0;
    await page.screenshot({ path: `screenshots/phone4-${device}-peek-pcc-card.png` });
    expect(Math.abs(cardBox.y - area.y), 'the tapped card sits just under the bar (the top of the scroll area)').toBeLessThanOrEqual(2);
    // the card fits above the peek when the room allows it (a Pixel 7 does; an iPhone 14's room is shorter than the card): else its top is the area's top and the peek covers the rest
    const room = peekBox.y - area.y;
    if (device === 'pixel7') expect(cardBox.y + cardBox.height, 'the whole PCC card is above the peek on a Pixel 7').toBeLessThanOrEqual(peekBox.y + 1);
    else if (cardBox.height <= room) expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(peekBox.y + 1);
    else expect(cardBox.y, 'a card taller than the room: its top is at the top of the area').toBeLessThanOrEqual(area.y + 1);
    expect(area.y + area.height, 'the scroll area runs down to the bottom of the screen, behind the sheet').toBeGreaterThanOrEqual(viewport - 1);
    expect(peekBox.height, 'the peek is at most 35% of the screen').toBeLessThanOrEqual(viewport * 0.35 + 1);
    const body = await sheet(page).locator('div').filter({ has: page.locator('#inspector-record-title') }).first().evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight }));
    // the peek is as high as its content unless that is more than 35% of the screen (then its body scrolls)
    expect(body.scroll <= body.client + 1 || peekBox.height >= viewport * 0.35 - 1, 'the peek height follows its content').toBe(true);
  }

  // the sheet: a tapped card at the bottom of the list sits above the peek, the last card can be scrolled above it
  await list(page).evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(600);
  // the card by its id: a locator of "the last article" would find another mounted card once the list moves
  const lastId = await list(page).getByRole('article').last().getAttribute('data-reaction-id');
  const last = page.locator(`article[data-reaction-id="${lastId}"]`);
  await last.getByRole('heading', { level: 4 }).getByRole('button').tap();
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'peek');
  await page.waitForTimeout(1_000);
  let peek = await box(sheet(page));
  let lastBox = await box(last);
  // a card can be taller than the room above the peek (a vertical scheme is tall): then its top is brought to the top of that room, else all of it sits above the peek
  const listBox = await box(list(page));
  expect(lastBox.y, 'the tapped card is brought into the room above the peek').toBeGreaterThanOrEqual(listBox.y - 1);
  expect(lastBox.y, 'its top is above the peek').toBeLessThan(peek.y);
  // no blank band: the page's content reaches the sheet's top edge (the element just above the sheet belongs to the list), the area goes on behind it
  expect(listBox.y + listBox.height, 'the page runs behind the sheet, no blank band over it').toBeGreaterThanOrEqual(peek.y - 8);
  const above = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-virtual-list]') !== null, { x: (await box(list(page))).x + 20, y: peek.y - 4 });
  expect(above, 'the element just above the sheet is page content').toBe(true);
  await shot(page, device, 3, 'peek-last-card');
  await page.screenshot({ path: `screenshots/phone4-${device}-peek-last-card.png` });
  // scrolling does not close the sheet, and the end of the list can still be brought above it
  await list(page).evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(600);
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'peek');
  peek = await box(sheet(page));
  lastBox = await box(last);
  expect(lastBox.y + lastBox.height, 'the last card is fully visible above the peek').toBeLessThanOrEqual(peek.y + 1);
  expect(await axeProblems(page, 10), 'axe at peek on the family page').toEqual([]);

  // a tap on the record's name toggles peek <-> full (the handle does too)
  const title = sheet(page).locator('#inspector-record-title');
  await title.tap();
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'full');
  await title.tap();
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'peek');
  await sheet(page).getByRole('button', { name: 'Show the whole record' }).tap();
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'full');
  await sheet(page).getByRole('button', { name: 'Show less' }).tap();
  await expect(sheet(page)).toHaveAttribute('data-sheet', 'peek');
  await sheet(page).getByRole('button', { name: 'Close inspector' }).tap();
  await expect(sheet(page)).toBeHidden();

  // back
  await family.getByRole('button', { name: '< Families' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await shot(page, device, 4, 'back-to-families');

  // the ester hydrolysis card (long reagent text): the same arrow rules
  await page.getByRole('button', { name: /^Esters/ }).tap();
  const esters = page.getByRole('region', { name: 'Family page: Esters' });
  await expect(esters).toBeVisible();
  const hydrolysis = esters.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name: /hydrol|H₂O|water/i }) }).first();
  await hydrolysis.scrollIntoViewIfNeeded();
  await expectArrowLayout(hydrolysis, width);
  await hydrolysis.screenshot({ path: `screenshots/phone4-${device}-ester-hydrolysis-card.png` });
  await expectClean(seen);
}

test.describe('phone family page: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('vertical scheme, back button, the last card above the peek', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium; Firefox has no touch emulation');
    test.setTimeout(240_000);
    await walk(page, 'pixel7');
  });
});

test.describe('phone family page: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('vertical scheme, back button, the last card above the peek', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(240_000);
    await walk(page, 'iphone14');
  });
});
