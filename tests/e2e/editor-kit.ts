/** Helpers of the editor specs (step 6.1a): the demo on a desktop window, a species shown in the inspector through the palette, the editor's parts. */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect } from './fixtures';
import { loadDemo, openApp } from './kit';

export const SHOTS = resolve(process.cwd(), 'screenshots');
export const pane = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
export const record = (page: Page) => pane(page).getByRole('article', { name: 'Record' });
export const palette = (page: Page) => page.getByRole('dialog', { name: 'Search' });
export const editorDialog = (page: Page, name: string) => page.getByRole('dialog', { name: `Edit ${name}` });
export const draftStatus = (page: Page) => page.getByRole('status', { name: 'Draft status' });
export const canonicalInput = (page: Page) => page.getByLabel('Canonical name (required)');

export async function openDemo(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible();
}

/** The index loads shortly after the data (search debounce): ask until the palette answers instead of "Search is starting". */
export async function searchFor(page: Page, text: string): Promise<void> {
  await palette(page).getByRole('combobox').fill(text);
  // neither "starting" (no index yet) nor "catching up" (the index has not followed a commit yet) is an answer
  await expect(palette(page).getByRole('status')).not.toHaveText(/^Search is (starting|catching up with your latest change)$/);
}

/** Shows a species in the inspector: Ctrl K, its name, its result. */
export async function showSpecies(page: Page, id: string, name: string): Promise<void> {
  await page.keyboard.press('Control+K');
  await expect(palette(page)).toBeVisible();
  await searchFor(page, `s: ${name}`);
  await palette(page).locator(`[role="option"][data-record-id="${id}"]`).click();
  await expect(record(page)).toHaveAttribute('data-record-id', id);
}

export async function openNamesEditor(page: Page, name: string): Promise<void> {
  await pane(page).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(editorDialog(page, name)).toBeVisible();
}

export function shotsDir(): string {
  mkdirSync(SHOTS, { recursive: true });
  return SHOTS;
}

/** Shows a record in the inspector through the palette: Ctrl K, `<prefix>: <name>` (s species, c class, g reagent; r is reactions), its result. With an ID the result is that exact record. */
export async function showRecord(page: Page, prefix: 's' | 'c' | 'g' | 'r' | 'm', name: string, id?: string): Promise<void> {
  await page.keyboard.press('Control+K');
  await expect(palette(page)).toBeVisible();
  await searchFor(page, `${prefix}: ${name}`);
  const option = id === undefined ? palette(page).getByRole('option', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') }).first() : palette(page).locator(`[role="option"][data-record-id="${id}"]`);
  await expect(option).toBeVisible({ timeout: 60_000 });
  await option.click();
  if (id !== undefined) await expect(record(page)).toHaveAttribute('data-record-id', id);
}
