/**
 * The explorers in the STUDY edition (7.1b, 7.2a; split from study-edition.spec.ts for the 400-line limit): Reactions and Precursors work
 * with no editing control and no editor chunk requested. Runs against the Study build (port 4174).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, chooseFile, expectClean, expectPreview, watch } from './kit';
import { record } from './editor-kit';
import { demoWithExamplesAndStages, GENERAL, THREE_STAGE } from './examples-kit';

const STUDY = process.env.ORN_BASE_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:4174';
test.use({ baseURL: STUDY });
const TITLE = 'Organic Reaction Navigator';
const DEMO_FILE = { name: 'my-own-data.orn.json', mimeType: 'application/json', buffer: readFileSync(resolve(process.cwd(), 'data/seed/demo.orn.json')) };

async function importOwnData(page: Page, file: Parameters<typeof chooseFile>[1] = DEMO_FILE): Promise<void> {
  await chooseFile(page, file);
  await expectPreview(page);
  await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 60_000 });
}

/** The chunk files of the STUDIO build that hold editor modules (its build report): none may be requested. */
function editorChunkNames(): string[] {
  const studio = resolve(process.cwd(), 'build-report', 'studio.json');
  if (!existsSync(studio)) return [];
  const modules = (JSON.parse(readFileSync(resolve(process.cwd(), 'scripts', 'editor-modules.json'), 'utf8')) as { modules: string[] }).modules;
  const isEditor = (id: string): boolean => modules.some((entry) => (entry.endsWith('/') ? id.startsWith(entry) : id === entry));
  const report = JSON.parse(readFileSync(studio, 'utf8')) as { chunks: { file: string; modules: string[] }[] };
  return report.chunks.filter((chunk) => chunk.modules.some(isEditor)).map((chunk) => chunk.file.split('/').pop() as string);
}

async function openStudy(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByText('Starting up', { exact: true })).toHaveCount(0);
}


test.describe('desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('Reactions works in Study: filters, Cards and Compact, a card opens the inspector, no editing control exists and no editor chunk is requested (step 7.1b)', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page, STUDY);
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('.js')) scripts.push(request.url().split('/').pop() as string);
    });
    await openStudy(page);
    await importOwnData(page);
    await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible();
    await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Reactions' }).click();
    const view = page.getByRole('region', { name: 'Reactions', exact: true });
    await expect(page.getByRole('heading', { name: 'Reactions', exact: true })).toBeVisible();
    await expect(view.locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
    const all = await view.locator('[data-reaction-id]').count();
    await view.getByRole('button', { name: /^Type/ }).click();
    await view.getByRole('group', { name: 'Type filter' }).getByRole('checkbox', { name: /^Oxidation/ }).check();
    await expect(view.getByRole('list', { name: 'Chosen filters' }).getByRole('listitem')).toHaveCount(1);
    expect(await view.locator('[data-reaction-id]').count()).toBeLessThan(all);
    await page.keyboard.press('Escape');
    await view.getByRole('radio', { name: 'Compact' }).check();
    await expect(view.locator('article[data-reaction-id]')).toHaveCount(0);
    await view.getByRole('radio', { name: 'Cards' }).check();
    const card = view.locator('article[data-reaction-id]').first();
    const id = await card.getAttribute('data-reaction-id');
    await card.getByRole('button').first().click();
    await expect(record(page)).toHaveAttribute('data-record-id', id as string);
    for (const name of ['Edit', 'Add picture', 'Delete...', 'Duplicate']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    const editors = editorChunkNames();
    expect(scripts.filter((name) => editors.includes(name) || /^(editor-host|editor-session)-/.test(name)), 'editor chunks requested').toEqual([]);
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });

  test('Precursors works in Study: a target, what makes it, a route search, a card opens the inspector, no editing control exists and no editor chunk is requested (step 7.2a)', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page, STUDY);
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('.js')) scripts.push(request.url().split('/').pop() as string);
    });
    await openStudy(page);
    await importOwnData(page);
    await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible();
    await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Precursors' }).click();
    const view = page.getByRole('region', { name: 'Precursors', exact: true });
    await expect(page.getByRole('heading', { name: 'Make a compound' })).toBeVisible();
    const pickIn = async (label: string, text: string, hitName: string): Promise<void> => {
      const box = view.getByRole('searchbox', { name: label, exact: true });
      const hit = view.getByRole('button', { name: hitName, exact: true });
      await expect(async () => {
        await box.fill('');
        await box.fill(text);
        await expect(hit).toBeVisible({ timeout: 3000 });
      }).toPass({ timeout: 60_000 });
      await hit.click();
    };
    await pickIn('Compound to make', 'propan-2-ol', 'Choose Propan-2-ol');
    await expect(view.getByRole('heading', { name: 'Made directly from' })).toBeVisible();
    const card = view.locator('article[data-reaction-id]').first();
    await expect(card).toBeVisible({ timeout: 60_000 });
    await pickIn('Start from (optional)', 'ethanol', 'Start from Ethanol');
    await view.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(view.getByRole('region', { name: 'Routes found' }).getByText('2 routes found')).toBeVisible();
    const id = await card.getAttribute('data-reaction-id');
    await card.getByRole('button').first().click();
    await expect(record(page)).toHaveAttribute('data-record-id', id as string);
    for (const name of ['Edit', 'Add picture', 'Delete...', 'Duplicate', 'Save as route', 'New route']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    const editors = editorChunkNames();
    expect(scripts.filter((name) => editors.includes(name) || /^(editor-host|editor-session)-/.test(name)), 'editor chunks requested').toEqual([]);
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });

  test('examples fold and the stages are numbered in Study too, with no editing control (step 7.3a C1, D1)', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page, STUDY);
    await openStudy(page);
    await importOwnData(page, demoWithExamplesAndStages());
    await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Reactions' }).click();
    const view = page.getByRole('region', { name: 'Reactions', exact: true });
    await expect(view.locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
    await expect(view.getByText(/^27 reactions \(\+ 3 examples\)$/).first()).toBeVisible();
    const box = view.getByRole('searchbox', { name: 'Find by name' });
    await box.fill('PCC');
    const general = view.locator('article[data-reaction-id]').filter({ has: page.getByRole('heading', { level: 4, name: GENERAL }) });
    await expect(general.locator('details[data-examples] summary').first()).toHaveText('Examples (3)');
    expect(await general.locator('details[data-examples]').evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
    await box.fill('Zz three-stage');
    const three = view.locator('article[data-reaction-id]').filter({ has: page.getByRole('heading', { level: 4, name: THREE_STAGE }) });
    await expect(three).toContainText(/\(i\)[\s\S]*\(ii\)[\s\S]*\(iii\)/, { timeout: 60_000 });
    for (const name of ['Edit', 'Add picture', 'Delete...', 'Duplicate', 'Save as route', 'New route']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });

});
