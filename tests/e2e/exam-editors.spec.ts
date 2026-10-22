/**
 * The exam and exam version editors end to end (Exams step; ADR-040 addendum), the STUDIO production build, every engine:
 *  (1) a new exam and a new version made from scratch, with one unit covering two topics; the version is chosen in the exam scope
 *      selector and the dimming changes (the demo's Beckmann rearrangement is outside JEE Main and not outside the new version);
 *  (2) "Start from another version" on a new version of a demo exam copies the demo version's units and coverage;
 *  (3) phone (Pixel 7 in Chromium, iPhone 14 in WebKit): open a demo version from a reaction's facts, change a coverage row, Save.
 * Axe on both editors; zero CSP violations. Screenshots: exam-editor, exam-version-editor (a unit open), scope-selector (open),
 * about (-1280x800) and phone-exam-version-<pixel7|iphone14>.
 */
import { resolve } from 'node:path';
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, openPhoneApp, watch } from './kit';
import { editorDialog, openDemo, palette, searchFor, shotsDir } from './editor-kit';

const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

const selector = (page: Page) => page.getByRole('combobox', { name: /Exam scope/ });
const NEW_EXAM = 'Zz e2e board exam';

/** Dismisses every toast first, so a screenshot shows the editor and not the "Saved" of the step before. */
const quiet = async (page: Page): Promise<void> => {
  const dismiss = page.getByRole('button', { name: 'Dismiss' });
  while ((await dismiss.count()) > 0) await dismiss.first().evaluate((el) => (el as HTMLElement).click());
};
const shot = async (page: Page, name: string): Promise<void> => {
  await quiet(page);
  await page.screenshot({ path: resolve(shotsDir(), `${name}-1280x800.png`) });
};
const newRecord = async (page: Page, button: string): Promise<Locator> => {
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: /Workbench/ }).click();
  await page.getByRole('button', { name: button, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: button });
  await expect(dialog).toBeVisible();
  return dialog;
};
const openSection = async (dialog: Locator, name: RegExp): Promise<void> => {
  const toggle = dialog.getByRole('button', { name, expanded: false });
  if ((await toggle.count()) > 0) await toggle.first().click();
};
const save = async (dialog: Locator): Promise<void> => {
  await dialog.getByRole('button', { name: /^Save/ }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
};
/** The value of the option that shows a text (topics are listed in tree order, indented by depth). */
const optionValue = async (select: Locator, text: string): Promise<string> => (await select.locator('option', { hasText: text }).first().getAttribute('value', { timeout: 10_000 })) as string;

test.describe('the exam editors (Studio)', () => {
  test('a new exam and version with two topics; chosen in the selector the dimming changes; a version started from a demo version', async ({ page }) => {
    test.setTimeout(900_000);
    const seen = await watch(page);
    await openDemo(page);

    // (1) a new exam
    const exam = await newRecord(page, 'New exam');
    await exam.getByLabel('Name (required)').fill(NEW_EXAM);
    await exam.getByLabel('Authority').fill('Zz e2e authority');
    expect(await axeProblems(page)).toEqual([]);
    await shot(page, 'exam-editor');
    await save(exam);

    // a new version of it: one unit that covers two topics
    const version = await newRecord(page, 'New exam version');
    const examSelect = version.getByLabel('Exam', { exact: true });
    await examSelect.selectOption(await optionValue(examSelect, NEW_EXAM));
    await version.getByLabel('Label (required)').fill('Zz e2e board exam 2027');
    await version.getByLabel('Year').fill('2027');
    await version.getByLabel('Status', { exact: true }).selectOption('draft');
    await openSection(version, /Syllabus units/);
    await version.getByRole('button', { name: 'Add a unit' }).click();
    await version.getByLabel('Unit title (required)').fill('Zz e2e unit');
    await version.getByRole('button', { name: 'Add a topic' }).click();
    const first = version.getByLabel('Topic of row 1');
    await first.selectOption(await optionValue(first, 'Molecular rearrangements'));
    await version.getByLabel('Coverage of row 1').selectOption('included');
    await version.getByRole('button', { name: 'Add a topic' }).click();
    const second = version.getByLabel('Topic of row 2');
    await second.selectOption(await optionValue(second, 'Diazonium salts'));
    await version.getByLabel('Coverage of row 2').selectOption('partial');
    await version.getByLabel('Coverage of row 2').scrollIntoViewIfNeeded();
    expect(await axeProblems(page)).toEqual([]);
    await shot(page, 'exam-version-editor');
    await save(version);

    // chosen in the selector: Beckmann (a rearrangement) is outside JEE Main and not outside the new version
    const NEW_LABEL = `${NEW_EXAM}, draft, not verified`;
    await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Navigator' }).click();
    await expect(selector(page).locator('option', { hasText: NEW_LABEL })).toHaveCount(1, { timeout: 60_000 });
    await page.getByRole('button', { name: /^Unanchored reactions/ }).click();
    const panel = page.getByRole('region', { name: 'Unanchored reactions' });
    const beckmann = panel.locator('[data-reaction-id="rxn_cyclohexanone-oxime-beckmann"]');
    await selector(page).selectOption({ label: 'JEE Main, provisional, not verified' });
    await expect(beckmann).toHaveAttribute('data-outside', '');
    await selector(page).selectOption({ label: NEW_LABEL });
    await expect(beckmann).toBeVisible();
    await expect(beckmann).not.toHaveAttribute('data-outside', '');
    await panel.getByRole('button', { name: 'Close' }).click();
    await selector(page).focus();
    await quiet(page);
    await selector(page).evaluate((el) => (el as HTMLSelectElement).showPicker?.());
    await page.screenshot({ path: resolve(shotsDir(), 'scope-selector-1280x800.png') });
    await page.keyboard.press('Escape');

    // (2) a new version of a demo exam, started from the demo version
    const copy = await newRecord(page, 'New exam version');
    const demoExam = copy.getByLabel('Exam', { exact: true });
    await demoExam.selectOption('exm_jee-main');
    await copy.getByLabel('Label (required)').fill('JEE Main 2027 (e2e)');
    await copy.getByLabel('Status', { exact: true }).selectOption('draft');
    await copy.getByLabel('Start from another version').selectOption('exv_jee-main-2026');
    await copy.getByRole('button', { name: /^Copy its units and coverage/ }).click();
    await expect(copy.getByRole('status', { name: 'Copied' })).toBeVisible();
    await openSection(copy, /Syllabus units/);
    await expect(copy.getByRole('list', { name: 'Syllabus units' }).getByRole('listitem')).toHaveCount(11);
    await expect(copy.getByRole('button', { name: /^Copy its units and coverage/ })).toHaveAttribute('aria-disabled', 'true'); // nothing is replaced silently
    await save(copy);
    await expect(selector(page).locator('option', { hasText: 'JEE Main 2027 (e2e), draft, not verified' })).toHaveCount(1, { timeout: 60_000 });
    await expectClean(seen);
  });

  test('the About text names no exam', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: /About/ }).click();
    const dialog = page.getByRole('dialog', { name: 'About this preview' });
    await expect(dialog).toContainText('Organic chemistry reactions, mechanisms and syllabus scopes for board and entrance exams.');
    await expect(dialog).not.toContainText(/JEE/);
    await quiet(page);
    await page.screenshot({ path: resolve(shotsDir(), 'about-1280x800.png') });
    await expectClean(seen);
  });
});

async function phoneWalk(page: Page, device: string): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await page.getByRole('button', { name: 'Load demo dataset' }).tap();
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Search' }).tap();
  await expect(palette(page)).toBeVisible();
  await searchFor(page, 'Diazotisation of aniline');
  await palette(page).locator('[role="option"][data-record-id="rxn_aniline-diazotisation"]').tap();
  await page.getByRole('button', { name: 'Show the whole record' }).tap();
  // the reaction's exam facts link to the demo version; its record has Edit
  await page.getByRole('button', { name: /^Level 4/ }).tap();
  await page.getByRole('link', { name: 'JEE Main 2026 (provisional)' }).first().tap();
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();
  const editor = editorDialog(page, 'JEE Main 2026 (provisional)');
  await expect(editor).toBeVisible();
  await editor.getByRole('list', { name: 'Syllabus units' }).getByRole('button', { name: /^Open unit/ }).first().tap();
  await editor.getByLabel('Coverage of row 1').selectOption('partial');
  await editor.getByLabel('Coverage of row 1').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/phone-exam-version-${device}.png` });
  await editor.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(editor).toBeHidden();
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('edit a demo version\'s coverage row and Save', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await phoneWalk(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('edit a demo version\'s coverage row and Save', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await phoneWalk(page, 'iphone14');
  });
});
