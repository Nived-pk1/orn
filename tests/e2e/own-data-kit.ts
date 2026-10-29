/**
 * Test-only: a copy of the demo dataset with some records changed, imported as the visitor's own data (first-run "Import a file"). Used
 * where the demo itself has no record of the shape a test needs; the demo's chemistry file is never edited.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect } from './fixtures';
import { chooseFile, expectPreview, openApp, type UploadFile } from './kit';

type Doc = { records: Record<string, unknown> };

export function changedDemo(edit: (records: Record<string, unknown>) => void): UploadFile {
  const doc = JSON.parse(readFileSync(resolve(process.cwd(), 'data/seed/demo.orn.json'), 'utf8')) as Doc;
  edit(doc.records);
  return { name: 'changed-demo.orn.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) };
}

export function recordsOf<T>(records: Record<string, unknown>, kind: string): T[] {
  const table = records[kind];
  return (Array.isArray(table) ? table : Object.values((table ?? {}) as object)) as T[];
}

/** Opens the app at first run and imports the file as the visitor's own data. */
export async function importOwn(page: Page, file: UploadFile): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await chooseFile(page, file);
  await expectPreview(page);
  await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible({ timeout: 90_000 });
}
