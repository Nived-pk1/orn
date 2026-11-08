/** Shared by the Study-edition specs (study-edition, study-student): the base URL, opening Study, and importing own data. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect } from './fixtures';
import { answerExamCard } from './exam-kit';
import { chooseFile, expectPreview, type UploadFile } from './kit';

export const STUDY = process.env.ORN_BASE_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:4174';
export const TITLE = 'Organic Reaction Navigator';
export const DEMO_FILE: UploadFile = { name: 'my-own-data.orn.json', mimeType: 'application/json', buffer: readFileSync(resolve(process.cwd(), 'data/seed/demo.orn.json')) };

export async function openStudy(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByText('Starting up', { exact: true })).toHaveCount(0);
}

export async function importOwnData(page: Page, file: UploadFile = DEMO_FILE): Promise<void> {
  await chooseFile(page, file);
  await expectPreview(page);
  await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 60_000 });
  await answerExamCard(page);
}
