/** Reads the authored records back through the app's own Export (File -> Export..., the default choice): the file is parsed in Node. Step 6.9, Part 2. */
import type { Page } from '@playwright/test';
import { documentToState } from '@/core/dataset';
import { expect } from './fixtures';
import type { DemoRecords } from './author-data';
import { onPhone } from './author-helpers';

export async function exportRecords(page: Page): Promise<DemoRecords> {
  if (onPhone()) {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: /^Export/ }).click();
  } else {
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: /Export\.\.\./ }).click();
  }
  const dialog = page.getByRole('dialog', { name: 'Export your data' });
  await expect(dialog.getByRole('group', { name: 'What to include' })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export', exact: true }).click()]);
  const path = await download.path();
  const result = page.getByRole('dialog', { name: 'Export finished' });
  await expect(result).toBeVisible();
  await result.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(result).toBeHidden();
  const { readFileSync } = await import('node:fs');
  const parsed = documentToState(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.ok) throw new Error('the export has duplicate IDs');
  return parsed.state.records as unknown as DemoRecords;
}
