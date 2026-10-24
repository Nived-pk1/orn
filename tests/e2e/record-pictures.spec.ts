/**
 * Pictures on a record that is not a mechanism, end to end (step 7.1a; ADR-038 addendum Q1-Q6), STUDIO production build, every engine,
 * through the UI only. A demo CONCEPT (a record that could only hold text before) takes a picture:
 *  (1) desktop: its editor's Pictures section adds a real PNG made here (alt text, caption; saved at once); the inspector shows it from a
 *      `blob:` URL under "Pictures of this concept", BEFORE the level sections; Open full size, Escape (focus returns); Remove detaches in
 *      words, the inspector has none; Undo brings it back; axe on the dialog and the view;
 *  (2) phone (Pixel 7 in Chromium, iPhone 14 in WebKit): a picture is added through the file chooser and the full sheet shows it.
 * Study (no editing code) is covered in study-edition.spec.ts. Screenshots: screenshots/concept-pictures-editor-1280x800.png,
 * inspector-concept-pictures-1280x800.png, phone-inspector-concept-pictures-<pixel7|iphone14>.png.
 */
import { resolve } from 'node:path';
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, openPhoneApp, watch, type UploadFile } from './kit';
import { editorDialog, openDemo, palette, pane, record, searchFor, shotsDir } from './editor-kit';
import { makePng } from './png-kit';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

const CONCEPT = 'Carbocation stability';
const CONCEPT_ID = 'cpt_carbocation-stability';
const ALT = 'Tertiary, secondary and primary carbocations ranked by stability';
const CAPTION = 'My own *ranking* sketch.';
const PNG = makePng(96, 64);
const png = (): UploadFile => ({ name: 'ranking.png', mimeType: 'image/png', buffer: PNG });

/** Dismisses the open toasts when no modal dialog is open (a modal covers them and takes the clicks). */
async function dismissToasts(page: Page): Promise<void> {
  if ((await page.locator('dialog[open]').count()) > 0) return;
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
}

const pictures = (page: Page) => page.getByRole('region', { name: 'Pictures of this concept' });
const addDialog = (page: Page) => page.getByRole('dialog', { name: 'Add picture' });

/** The concept in the inspector, through the palette (a plain query; the exact record by its ID). */
async function showConcept(page: Page): Promise<void> {
  await page.keyboard.press('Control+K');
  await expect(palette(page)).toBeVisible();
  await searchFor(page, CONCEPT);
  const option = palette(page).locator(`[role="option"][data-record-id="${CONCEPT_ID}"]`);
  await expect(option).toBeVisible({ timeout: 60_000 });
  await option.click();
  await expect(record(page)).toHaveAttribute('data-record-id', CONCEPT_ID);
}

async function openEditor(page: Page): Promise<ReturnType<typeof editorDialog>> {
  await pane(page).getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = editorDialog(page, CONCEPT);
  await expect(editor).toBeVisible();
  return editor;
}

async function closeEditor(editor: ReturnType<typeof editorDialog>): Promise<void> {
  await editor.getByRole('button', { name: 'Close (keeps the draft)', exact: true }).click();
  await expect(editor).toBeHidden();
}

/** Adds a picture to the concept whose editor is open: the dialog, a real PNG, alt text and caption, Add picture. */
async function addPicture(page: Page, editor: ReturnType<typeof editorDialog>): Promise<void> {
  await editor.getByRole('button', { name: 'Add picture', exact: true }).click();
  await expect(addDialog(page)).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), addDialog(page).getByLabel('Picture file').click()]);
  await chooser.setFiles(png());
  await expect(addDialog(page).getByRole('img', { name: 'Preview of the chosen picture' })).toBeVisible();
  await addDialog(page).getByLabel('Alt text (required)').fill(ALT);
  await addDialog(page).getByLabel('Caption (optional)').fill(CAPTION);
  await expect(addDialog(page).getByRole('button', { name: 'Add picture', exact: true })).toHaveCSS('background-color', 'rgb(43, 79, 216)');
  expect(await axeProblems(page, 10)).toEqual([]); // a modal dialog leaves fewer rules to run
  await addDialog(page).getByRole('button', { name: 'Add picture', exact: true }).click();
  await expect(addDialog(page)).toBeHidden({ timeout: 60_000 });
}

/** The picture shows in the view: an `<img>` from a blob URL that really decoded. */
async function expectPictureShown(region: ReturnType<typeof pictures>): Promise<void> {
  const img = region.getByRole('img', { name: ALT });
  await expect(img).toBeVisible({ timeout: 60_000 });
  await expect(img).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 30_000 }).toBe(true);
}

test.describe('desktop', () => {
  test('add a picture to a concept: saved at once, shown under the header, full size, Remove detaches, Undo brings it back', async ({ page }) => {
    test.setTimeout(480_000);
    const seen = await watch(page);
    await openDemo(page);
    await dismissToasts(page);
    await showConcept(page);
    await expect(pictures(page)).toHaveCount(0);
    const editor = await openEditor(page);
    await expect(editor.getByText('No pictures yet.')).toBeVisible();
    await addPicture(page, editor);
    await expect(editor.getByRole('img', { name: ALT })).toBeVisible({ timeout: 60_000 });
    await expect(editor.getByRole('group', { name: 'Picture 1' })).toContainText(CAPTION);
    await dismissToasts(page);
    // the live findings follow an edit 300 ms later: wait for them before a screenshot
    await expect(editor.getByText('Must not be blank (name)')).toHaveCount(0);
    await editor.getByRole('heading', { name: /Pictures/ }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shotsDir(), 'concept-pictures-editor-1280x800.png') });
    await closeEditor(editor);

    // the inspector shows it before the level sections, from a blob URL
    const region = pictures(page);
    await expectPictureShown(region);
    await expect(region.locator('figcaption em')).toHaveText('ranking');
    const first = await region.boundingBox();
    const level = await pane(page).locator('section[data-level="2"]').first().boundingBox();
    expect((first?.y ?? 1e9) < (level?.y ?? 0), 'the pictures come before the level sections').toBe(true);
    await dismissToasts(page);
    await region.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shotsDir(), 'inspector-concept-pictures-1280x800.png') });
    expect(await axeProblems(page)).toEqual([]);

    // full size: a modal; Escape closes it and the focus goes back
    await region.getByRole('button', { name: 'Open full size' }).click();
    const big = page.getByRole('dialog', { name: ALT });
    await expect(big).toBeVisible();
    await expect(big.getByRole('img', { name: ALT })).toHaveAttribute('src', /^blob:/);
    await page.keyboard.press('Escape');
    await expect(big).toBeHidden();
    await expect(region.getByRole('button', { name: 'Open full size' })).toBeFocused();

    // Remove detaches in words; the inspector has none; Undo brings it back
    const again = await openEditor(page);
    await again.getByRole('button', { name: 'Remove picture 1 from this concept', exact: true }).click();
    await again.getByRole('button', { name: 'Remove from this concept', exact: true }).click();
    await expect(again.getByText('Removed from this concept. The picture stays in your data until you delete it.')).toBeVisible();
    await expect(again.getByText('No pictures yet.')).toBeVisible();
    await closeEditor(again);
    await expect(pictures(page)).toHaveCount(0);
    await dismissToasts(page);
    await page.getByRole('button', { name: /^Undo Remove picture from/ }).click();
    await expectPictureShown(pictures(page));
    await expectClean(seen);
  });
});

async function phoneWalk(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Search' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Search' });
  await expect(sheet).toBeVisible();
  await searchFor(page, CONCEPT);
  await sheet.locator(`[role="option"][data-record-id="${CONCEPT_ID}"]`).tap();
  await page.getByRole('button', { name: /Show the whole record/ }).tap();
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();
  const editor = editorDialog(page, CONCEPT);
  await expect(editor).toBeVisible();
  // a new section starts closed on a phone
  await editor.getByRole('button', { name: /Pictures/, expanded: false }).tap();
  await editor.getByRole('button', { name: 'Add picture', exact: true }).tap();
  await expect(addDialog(page)).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), addDialog(page).getByLabel('Picture file').tap()]);
  await chooser.setFiles(png());
  await expect(addDialog(page).getByRole('img', { name: 'Preview of the chosen picture' })).toBeVisible();
  await addDialog(page).getByLabel('Alt text (required)').fill(ALT);
  await expect(addDialog(page).getByRole('button', { name: 'Add picture', exact: true })).toHaveCSS('background-color', 'rgb(43, 79, 216)');
  await addDialog(page).getByRole('button', { name: 'Add picture', exact: true }).tap();
  await expect(addDialog(page)).toBeHidden({ timeout: 60_000 });
  await editor.getByRole('button', { name: 'Close (keeps the draft)', exact: true }).tap();
  await expect(editor).toBeHidden();
  // the full sheet shows it, inside the screen's width
  const region = pictures(page);
  await expectPictureShown(region);
  const viewport = page.viewportSize()?.width ?? 0;
  const box = await region.getByRole('img', { name: ALT }).boundingBox();
  expect(box !== null && box.x >= 0 && box.x + box.width <= viewport, 'the picture fits the screen').toBe(true);
  await dismissToasts(page);
  await region.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/phone-inspector-concept-pictures-${device}.png` });
  expect(await axeProblems(page)).toEqual([]);
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('add a picture to a concept through the file chooser; the full sheet shows it', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await phoneWalk(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('add a picture to a concept through the file chooser; the full sheet shows it', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await phoneWalk(page, 'iphone14');
  });
});
