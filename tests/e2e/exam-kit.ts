/** Step 8.3b, B3: the first time a student has data with exams a card asks which exam; specs about other things answer "Just exploring". Test code only. */
import type { Page } from '@playwright/test';
import { expect } from './fixtures';

export async function answerExamCard(page: Page): Promise<void> {
  const card = page.getByRole('dialog', { name: 'Which exam are you preparing for?' });
  try {
    await card.waitFor({ state: 'visible', timeout: 8_000 });
  } catch {
    return; // no exam in the data: no card
  }
  await card.getByRole('button', { name: 'Just exploring' }).click();
  await expect(card).toHaveCount(0);
  await page.waitForTimeout(1000); // the saved state is written after a short pause (SAVE_DEBOUNCE_MS): a spec that reloads soon after must not lose the answer
}

/** The phone's storage line (Study, own data) is whole: its words fit on one line, unclipped (step 8.3b close, 3a); `at360` checks it at 360 px wide too. */
export async function expectStorageLineWhole(page: Page, at360 = false): Promise<void> {
  const whole = async (): Promise<void> => {
    const line = page.getByRole('button', { name: 'Your data may be cleared. Back it up.' });
    await expect(line).toBeVisible();
    const size = await line.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(size.scroll, 'the storage line is not clipped').toBeLessThanOrEqual(size.client + 1);
  };
  await whole();
  if (!at360) return;
  const before = page.viewportSize();
  await page.setViewportSize({ width: 360, height: before?.height ?? 740 });
  await whole();
  if (before !== null) await page.setViewportSize(before);
}
