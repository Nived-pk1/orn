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
