/**
 * The user's own mechanism pictures end to end (step 6.5b part 4; ADR-038 addendum P1-P7), PRODUCTION build, every engine, through the UI only:
 *  (1) desktop: the demo SN2 mechanism is opened in its editor; a wrong-type file renamed .png is refused in words; a real PNG made here is
 *      added with alt text (saved at once, the draft untouched); the inspector's mechanism view shows it FIRST from a `blob:` URL; Open full
 *      size and Esc; a reload and it is still there; Remove detaches (the view has no picture, the asset stays);
 *  (2) phone (Pixel 7, iPhone 14): a picture is added through the file chooser and the sheet shows it first, inside the screen's width;
 *  (3) Chromium only: the dataset is exported with the pictures inside the file and imported into a FRESH browser context: the picture shows.
 * Axe on the dialog and the view; zero policy violations. Screenshots: screenshots/add-picture-dialog-1280x800.png,
 * mechanism-pictures-editor-1280x800.png, inspector-mechanism-pictures-1280x800.png, picture-full-size-1280x800.png,
 * phone-add-picture-pixel7.png, phone-inspector-mechanism-pictures-<pixel7|iphone14>.png.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, expectPreview, importDialog, openApp, openPhoneApp, watch, type UploadFile } from './kit';
import { editorDialog, openDemo, pane, searchFor, shotsDir, showRecord } from './editor-kit';
import { makePng } from './png-kit';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

const SN2 = 'SN2 substitution of a haloalkane';
const SN2_ID = 'mec_sn2-haloalkane';
const ALT = 'Hydroxide attacks the carbon from the side opposite the bromide, inverting it';
const CAPTION = 'My own sketch of the *backside* attack.';
const PNG = makePng(96, 64);
const png = (name = 'my-sketch.png'): UploadFile => ({ name, mimeType: 'image/png', buffer: PNG });
const NOT_A_PICTURE: UploadFile = { name: 'cheat.png', mimeType: 'image/png', buffer: Buffer.from('MZ this is a program, not a picture') };

/** Dismisses the open toasts when no modal dialog is open (a modal covers them and takes the clicks). */
async function dismissToasts(page: Page): Promise<void> {
  if ((await page.locator('dialog[open]').count()) > 0) return;
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
}

const pictures = (page: Page) => page.getByRole('region', { name: 'Pictures of this mechanism' });
const addDialog = (page: Page) => page.getByRole('dialog', { name: 'Add picture' });

/** The mechanism editor, then the picture dialog with a chosen file (through the file chooser). */
async function chooseInDialog(page: Page, file: UploadFile): Promise<void> {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), addDialog(page).getByLabel('Picture file').click()]);
  await chooser.setFiles(file);
}

/** Adds a picture to the mechanism whose editor is open: the dialog, a real PNG, alt text and caption, Add picture. */
async function addPicture(page: Page, editor: ReturnType<typeof editorDialog>, options: { shots?: boolean } = {}): Promise<void> {
  await editor.getByRole('button', { name: 'Add picture', exact: true }).click();
  await expect(addDialog(page)).toBeVisible();
  await chooseInDialog(page, png());
  await expect(addDialog(page).getByRole('img', { name: 'Preview of the chosen picture' })).toBeVisible();
  await addDialog(page).getByLabel('Alt text (required)').fill(ALT);
  await addDialog(page).getByLabel('Caption (optional)').fill(CAPTION);
  if (options.shots === true) {
    await dismissToasts(page);
    await expect(page.getByRole('img', { name: 'Preview of the chosen picture' })).toBeVisible();
    await expect(addDialog(page).getByRole('button', { name: 'Add picture', exact: true })).toHaveCSS('background-color', 'rgb(43, 79, 216)');
    await page.screenshot({ path: resolve(shotsDir(), 'add-picture-dialog-1280x800.png') });
    expect(await axeProblems(page, 10)).toEqual([]); // a modal dialog leaves fewer rules to run
  }
  await addDialog(page).getByRole('button', { name: 'Add picture', exact: true }).click();
  await expect(addDialog(page)).toBeHidden({ timeout: 60_000 });
}

async function openEditor(page: Page): Promise<ReturnType<typeof editorDialog>> {
  await pane(page).getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = editorDialog(page, SN2);
  await expect(editor).toBeVisible();
  return editor;
}

async function closeEditor(editor: ReturnType<typeof editorDialog>): Promise<void> {
  await editor.getByRole('button', { name: 'Close (keeps the draft)', exact: true }).click();
  await expect(editor).toBeHidden();
}

/** The picture shows in the view: an `<img>` from a blob URL that really decoded. */
async function expectPictureShown(region: ReturnType<typeof pictures>): Promise<void> {
  const img = region.getByRole('img', { name: ALT });
  await expect(img).toBeVisible({ timeout: 60_000 });
  await expect(img).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 30_000 }).toBe(true);
}

test.describe('desktop', () => {
  test('add a picture to the demo SN2 mechanism: refused when it is not a picture, shown first, full size, Remove detaches', async ({ page }) => {
    test.setTimeout(480_000);
    const seen = await watch(page);
    await openDemo(page);
    await dismissToasts(page);
    await showRecord(page, 'm', SN2, SN2_ID);
    const editor = await openEditor(page);

    // a file that is not a picture is refused in words and nothing is saved
    await editor.getByRole('button', { name: 'Add picture', exact: true }).click();
    await expect(addDialog(page)).toBeVisible();
    await chooseInDialog(page, NOT_A_PICTURE);
    await expect(addDialog(page).getByRole('alert')).toHaveText('This file is not a picture the app can show: PNG, JPEG, WebP, GIF or SVG.');
    await expect(addDialog(page).getByRole('img', { name: 'Preview of the chosen picture' })).toHaveCount(0);
    await addDialog(page).getByLabel('Alt text (required)').fill('x');
    await expect(addDialog(page).getByRole('button', { name: 'Add picture', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await addDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(addDialog(page)).toBeHidden();
    await expect(editor.getByText('No pictures yet.')).toBeVisible();

    // a real picture: saved at once
    await addPicture(page, editor, { shots: true });
    await expect(editor.getByRole('img', { name: ALT })).toBeVisible({ timeout: 60_000 });
    // the caption is drawn through the rich-text preview (7.1b F1): emphasis, not asterisks
    await expect(editor.getByRole('group', { name: 'Picture 1' })).toContainText('My own sketch of the backside attack.');
    await expect(editor.getByRole('group', { name: 'Picture 1' }).locator('em')).toHaveText('backside');
    await dismissToasts(page);
    // the live findings follow an edit 300 ms later (review F7): wait for them before a screenshot
    await expect(editor.getByText('Must not be blank (name)')).toHaveCount(0);
    await editor.getByRole('heading', { name: /Pictures/ }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shotsDir(), 'mechanism-pictures-editor-1280x800.png') });
    await closeEditor(editor);

    // the inspector's view shows it FIRST, from a blob URL
    const region = pictures(page);
    await expectPictureShown(region);
    await expect(region.locator('figcaption em')).toHaveText('backside');
    const first = await region.boundingBox();
    const summary = await pane(page).locator('section[data-level="2"]').first().boundingBox();
    expect((first?.y ?? 1e9) < (summary?.y ?? 0), 'the pictures come before the level sections').toBe(true);
    await dismissToasts(page);
    await region.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(shotsDir(), 'inspector-mechanism-pictures-1280x800.png') });
    expect(await axeProblems(page)).toEqual([]);

    // full size: a modal; Esc closes it and the focus goes back
    await region.getByRole('button', { name: 'Open full size' }).click();
    const big = page.getByRole('dialog', { name: ALT });
    await expect(big).toBeVisible();
    await expect(big.getByRole('img', { name: ALT })).toHaveAttribute('src', /^blob:/);
    await dismissToasts(page);
    await page.screenshot({ path: resolve(shotsDir(), 'picture-full-size-1280x800.png') });
    await page.keyboard.press('Escape');
    await expect(big).toBeHidden();
    await expect(region.getByRole('button', { name: 'Open full size' })).toBeFocused();

    // Remove detaches: the view has no picture
    const again = await openEditor(page);
    await again.getByRole('button', { name: 'Remove picture 1 from this mechanism', exact: true }).click();
    await again.getByRole('button', { name: 'Remove from this mechanism', exact: true }).click();
    await expect(again.getByText('Removed from this mechanism. The picture stays in your data until you delete it.')).toBeVisible();
    await expect(again.getByText('No pictures yet.')).toBeVisible();
    await closeEditor(again);
    await expect(pictures(page)).toHaveCount(0);
    await expectClean(seen);
  });

  // a reload starts a new document, so this test takes no screenshot (WebKit's screenshot styles are counted per document, see kit.ts `watch`)
  test('a picture is still there after a reload (bytes included); Remove detaches and the asset record stays', async ({ page }) => {
    test.setTimeout(480_000);
    const seen = await watch(page);
    await openDemo(page);
    await dismissToasts(page);
    await showRecord(page, 'm', SN2, SN2_ID);
    const editor = await openEditor(page);
    await addPicture(page, editor);
    await closeEditor(editor);
    await expectPictureShown(pictures(page));

    await page.reload();
    await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible({ timeout: 90_000 });
    await showRecord(page, 'm', SN2, SN2_ID);
    await expectPictureShown(pictures(page));

    const again = await openEditor(page);
    await again.getByRole('button', { name: 'Remove picture 1 from this mechanism', exact: true }).click();
    await again.getByRole('button', { name: 'Remove from this mechanism', exact: true }).click();
    await closeEditor(again);
    await expect(pictures(page)).toHaveCount(0);
    // the asset record is still in the data, attached to nothing (AST-001, an INFO finding)
    await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: /Dataset/ }).click();
    await expect(page.getByText(/^Findings: E \d+ \/ W \d+ \/ I \d+ \/ Review \d+$/)).toBeVisible();
    await expectClean(seen);
  });
});

async function phoneWalk(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Search' }).tap();
  const palette = page.getByRole('dialog', { name: 'Search' });
  await expect(palette).toBeVisible();
  await searchFor(page, 'm: sn2');
  await palette.getByRole('option', { name: new RegExp(SN2) }).tap();
  await page.getByRole('button', { name: /Show the whole record/ }).tap();
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();
  const editor = editorDialog(page, SN2);
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Add picture', exact: true }).tap();
  await expect(addDialog(page)).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), addDialog(page).getByLabel('Picture file').tap()]);
  await chooser.setFiles(png());
  await expect(addDialog(page).getByRole('img', { name: 'Preview of the chosen picture' })).toBeVisible();
  await addDialog(page).getByLabel('Alt text (required)').fill(ALT);
  await dismissToasts(page);
  if (device === 'pixel7') await page.screenshot({ path: resolve(shotsDir(), 'phone-add-picture-pixel7.png') });
  // the enabled button fades from its dimmed look: axe reads the colour as it is at that moment, so wait for the accent
  await expect(addDialog(page).getByRole('button', { name: 'Add picture', exact: true })).toHaveCSS('background-color', 'rgb(43, 79, 216)');
  expect(await axeProblems(page, 10)).toEqual([]);
  await addDialog(page).getByRole('button', { name: 'Add picture', exact: true }).tap();
  await expect(addDialog(page)).toBeHidden({ timeout: 60_000 });
  await editor.getByRole('button', { name: 'Close (keeps the draft)', exact: true }).tap();
  await expect(editor).toBeHidden();
  // the sheet shows it first, inside the screen's width
  const region = pictures(page);
  await expectPictureShown(region);
  const viewport = page.viewportSize()?.width ?? 0;
  const box = await region.getByRole('img', { name: ALT }).boundingBox();
  expect(box !== null && box.x >= 0 && box.x + box.width <= viewport, 'the picture fits the screen').toBe(true);
  expect(box?.width ?? 0, 'never enlarged past its natural size').toBeLessThanOrEqual(96 + 2); // the natural width and the 1 px border
  await dismissToasts(page);
  await region.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/phone-inspector-mechanism-pictures-${device}.png` });
  expect(await axeProblems(page)).toEqual([]);
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('add a picture through the file chooser; the sheet shows it first', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await phoneWalk(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('add a picture through the file chooser; the sheet shows it first', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await phoneWalk(page, 'iphone14');
  });
});

test.describe('export and import', () => {
  test.use({ acceptDownloads: true });
  test('the dataset exported with its pictures inside the file, imported into a FRESH browser context: the picture shows', async ({ makeContext, browserName }) => {
    test.skip(browserName !== 'chromium', 'the export round trip runs in Chromium (step 5.9b)');
    test.setTimeout(600_000);
    const open = async (): Promise<Page> => {
      const context = await makeContext({ acceptDownloads: true, baseURL: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 800 } });
      return context.newPage();
    };
    const a = await open();
    const seenA = await watch(a);
    await openDemo(a);
    await dismissToasts(a);
    await showRecord(a, 'm', SN2, SN2_ID);
    const editor = await openEditor(a);
    await addPicture(a, editor);
    await closeEditor(editor);
    await expectPictureShown(pictures(a));

    await a.getByRole('button', { name: 'File' }).click();
    await a.getByRole('menuitem', { name: /Export\.\.\./ }).click();
    const exportDialog = a.getByRole('dialog', { name: 'Export your data' });
    await expect(exportDialog.getByRole('group', { name: 'What to include' })).toBeVisible();
    await exportDialog.getByRole('radio', { name: /Inside the file/ }).check();
    const [download] = await Promise.all([a.waitForEvent('download'), exportDialog.getByRole('button', { name: 'Export', exact: true }).click()]);
    const path = await download.path();
    const exported: UploadFile = { name: download.suggestedFilename(), mimeType: 'application/json', buffer: readFileSync(path) };
    expect(exported.buffer.toString('utf8')).toContain('"embeddedAssets"');
    await expectClean(seenA);
    await a.context().close();

    const b = await open();
    const seenB = await watch(b);
    await openApp(b);
    const [chooser] = await Promise.all([b.waitForEvent('filechooser'), b.getByRole('button', { name: 'Import a file' }).click()]);
    await chooser.setFiles(exported);
    await expectPreview(b);
    const summary = importDialog(b);
    await expect(summary.getByRole('radio', { name: /Replace all/ })).toBeChecked();
    await summary.getByRole('button', { name: 'Confirm' }).click();
    await expect(b.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 90_000 });
    await dismissToasts(b);
    await showRecord(b, 'm', SN2, SN2_ID);
    await expectPictureShown(pictures(b));
    await expectClean(seenB);
    await b.context().close();
  });
});
