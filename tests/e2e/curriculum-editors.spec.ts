/**
 * The curriculum editors end to end (step 6.6c; ADR-040 addendum), the STUDIO production build, every engine:
 *  (1) a new topic; a topic mapping made from a demo reaction's own editor ("Map to a topic" opens a NEW mapping with the reaction filled in);
 *  (2) an exam relevance; (3) a new map family placed in a free cell, visible on the overview map.
 *  (4) phone (Pixel 7 in Chromium, iPhone 14 in WebKit): map a demo reaction to a topic and Save.
 * Axe on each new editor; zero CSP violations. Screenshots: topic-editor, topic-mapping-editor, exam-relevance-editor, map-family-editor
 * (-1280x800), overview-new-family-1280x800 and phone-topic-mapping-<pixel7|iphone14>.
 */
import { resolve } from 'node:path';
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, openPhoneApp, watch } from './kit';
import { editorDialog, openDemo, openNamesEditor, palette, searchFor, shotsDir, showRecord } from './editor-kit';

const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

/** Dismisses every toast first, so a screenshot shows the editor and not the "Saved" of the step before. */
const quiet = async (page: Page): Promise<void> => {
  const dismiss = page.getByRole('button', { name: 'Dismiss' });
  while ((await dismiss.count()) > 0) await dismiss.first().evaluate((el) => (el as HTMLElement).click()); // a toast sits behind an open dialog: it is dismissed without a pointer
};
const shot = async (page: Page, name: string): Promise<Buffer> => {
  await quiet(page);
  return page.screenshot({ path: resolve(shotsDir(), `${name}-1280x800.png`) });
};
const openSection = async (dialog: Locator, name: RegExp): Promise<void> => {
  const toggle = dialog.getByRole('button', { name, expanded: false });
  if ((await toggle.count()) > 0) await toggle.first().click();
};
const newRecord = async (page: Page, button: string): Promise<Locator> => {
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: /Workbench/ }).click();
  await page.getByRole('button', { name: button, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: button });
  await expect(dialog).toBeVisible();
  return dialog;
};
/** Finds a record by name in a picker and adds it; the search index follows a commit a moment later, so the search is asked again until it answers. */
const findAndAdd = async (dialog: Locator, label: string, text: string, list: string, add: string): Promise<void> => {
  const input = dialog.getByLabel(label);
  await expect(async () => {
    await input.fill('');
    await input.fill(text);
    await dialog.getByRole('list', { name: list }).getByRole('button', { name: add, exact: true }).click({ timeout: 4_000 });
  }).toPass({ timeout: 90_000 });
};
const save = async (dialog: Locator): Promise<void> => {
  await dialog.getByRole('button', { name: /^Save/ }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
};

test.describe('the curriculum editors (Studio)', () => {
  test('a topic; a mapping made from a reaction; an exam relevance; a map family in a free cell, drawn on the overview map', async ({ page }) => {
    test.setTimeout(900_000);
    const seen = await watch(page);
    await openDemo(page);

    // (1) a new topic
    const topic = await newRecord(page, 'New topic');
    await topic.getByLabel('Name (required)').fill('Zz e2e topic');
    await expect(topic.getByLabel('Kind of topic')).toHaveValue('');
    await topic.getByLabel('Kind of topic').selectOption('section');
    await topic.getByLabel('Parent topic').selectOption('top_organic-chemistry');
    await topic.getByLabel('Order').fill('99');
    expect(await axeProblems(page)).toEqual([]);
    await shot(page, 'topic-editor');
    await save(topic);

    // a demo reaction mapped to the new topic from the reaction's own editor
    await showRecord(page, 'r', 'Diazotisation of aniline', 'rxn_aniline-diazotisation');
    await openNamesEditor(page, 'Diazotisation of aniline');
    const reaction = editorDialog(page, 'Diazotisation of aniline');
    await openSection(reaction, /Syllabus topics/);
    await reaction.getByRole('button', { name: 'Map to a topic' }).click();
    const mapping = page.getByRole('dialog', { name: 'New topic mapping' });
    await expect(mapping).toBeVisible();
    await expect(mapping.getByRole('list', { name: 'Target record' })).toContainText('Diazotisation of aniline');
    await expect(mapping.getByLabel('Role')).toHaveValue('');
    const made = await mapping.getByLabel('Topic').locator('option', { hasText: 'Zz e2e topic' }).getAttribute('value', { timeout: 10_000 }); // listed in tree order, indented by depth
    await mapping.getByLabel('Topic').selectOption(made as string, { timeout: 10_000 });
    await mapping.getByLabel('Role').selectOption('supporting');
    expect(await axeProblems(page)).toEqual([]);
    await shot(page, 'topic-mapping-editor');
    await save(mapping);

    // (2) an exam relevance
    const relevance = await newRecord(page, 'New exam relevance');
    await findAndAdd(relevance, 'Find the target record by name', 'Diazotisation of aniline', 'Records found', 'Add Diazotisation of aniline');
    await expect(relevance.getByLabel('Exam')).toHaveValue('');
    await relevance.getByLabel('Exam').selectOption('exm_jee-main');
    await relevance.getByRole('checkbox', { name: 'JEE Main 2026 (provisional)' }).check();
    await relevance.getByLabel('Scope').selectOption('outside');
    await relevance.getByLabel('Importance').selectOption('2');
    expect(await axeProblems(page)).toEqual([]);
    await shot(page, 'exam-relevance-editor');
    await save(relevance);

    // (3) a new map family in a free cell
    const family = await newRecord(page, 'New map family');
    await findAndAdd(family, 'Find the class by name', 'Acyl halides', 'Classes found', 'Add Acyl halides');
    await family.getByLabel('Group').selectOption('Oxygen compounds');
    await family.getByLabel('Order').fill('14');
    await family.getByRole('button', { name: /^Column 1, row 1:/ }).click({ force: true, timeout: 15_000 }); // aria-disabled: refused in words, still clickable
    await expect(family.getByRole('alert')).toContainText('already holds Alcohols');
    await family.getByRole('button', { name: /^Column 0, row 2:/ }).click();
    await expect(family.getByRole('button', { name: /^Column 0, row 2:/ })).toHaveAttribute('aria-pressed', 'true');
    await family.getByRole('group', { name: 'Map cell' }).scrollIntoViewIfNeeded();
    expect(await axeProblems(page)).toEqual([]);
    await shot(page, 'map-family-editor');
    await save(family);
    await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Navigator' }).click();
    const back = page.getByRole('button', { name: 'Overview', exact: true }); // a family page is open (the reaction was shown from it)
    if ((await back.count()) > 0) await back.click();
    const hub = page.locator('[data-node-id="cls_acyl-halides"]');
    await expect(hub).toHaveAttribute('aria-label', /^Acyl halides, class hub, Oxygen compounds/, { timeout: 60_000 });
    await expect(hub.locator('rect').first()).toHaveAttribute('data-tone', 'green');
    await expect(page.getByRole('group', { name: /^Navigator: 17 hubs/ })).toBeVisible();
    await quiet(page);
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toHaveCount(0);
    await page.screenshot({ path: resolve(shotsDir(), 'overview-new-family-1280x800.png') });
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
  await page.getByRole('button', { name: 'Edit', exact: true }).tap();
  const editor = editorDialog(page, 'Diazotisation of aniline');
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: /Syllabus topics/ }).tap();
  await editor.getByRole('button', { name: 'Map to a topic' }).tap();
  const mapping = page.getByRole('dialog', { name: 'New topic mapping' });
  await expect(mapping).toBeVisible();
  await mapping.getByLabel('Topic').selectOption('top_diazonium-chemistry');
  await mapping.getByLabel('Role').selectOption('supporting');
  await mapping.getByLabel('Role').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/phone-topic-mapping-${device}.png` });
  await mapping.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(mapping).toBeHidden();
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('map a demo reaction to a topic and Save', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(300_000);
    await phoneWalk(page, 'pixel7');
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('map a demo reaction to a topic and Save', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(300_000);
    await phoneWalk(page, 'iphone14');
  });
});
