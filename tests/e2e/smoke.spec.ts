/**
 * The two-spec smoke (step 5.1d, note E10): it runs in Chromium, Firefox and WebKit. 1: the app boots and loads the demo. 2: the chem
 * worker starts and parses (the demo's invalid structure arrives as a CHEM-001 warning in the counts).
 */
import { expect, test } from '@playwright/test';
import { expectClean, findingsText, loadDemo, openApp, recordCount, watch } from './kit';

test('the app boots and loads the demo; its counts are shown', async ({ page }) => {
  const seen = await watch(page);
  await openApp(page);
  await expect(page.getByRole('region', { name: 'First run' })).toBeVisible();
  await loadDemo(page);
  await expect(page.getByRole('region', { name: 'Dataset' })).toBeVisible();
  expect(await recordCount(page, 'reaction')).toBe(27);
  expect(await recordCount(page, 'species')).toBe(66);
  await expect(page.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
  await expectClean(seen);
});

test('the chem worker parses: the demo has one CHEM-001 warning in the counts', async ({ page }) => {
  await openApp(page);
  await loadDemo(page);
  // L1-L3 findings of the demo: one planted RXN-002 warning (E 0 / W 1 / I 17 / Review 38). L4 (chem worker) adds one CHEM-001 warning for the invalid structure.
  await expect(findingsText(page)).toHaveText('Findings: E 0 / W 2 / I 17 / Review 38', { timeout: 60_000 });
  await expect(page.getByText(/Check unavailable/)).toHaveCount(0);
});
