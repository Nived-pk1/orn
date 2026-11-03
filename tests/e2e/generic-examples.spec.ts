/**
 * A generic reaction and its examples (step 7.2b A6), the STUDIO production build, every engine: the inspector on the demo's generic
 * "1° alcohol → aldehyde (PCC)" lists "Examples (1)" with a link to "Ethanol → ethanal (PCC)", whose own view says "Example of" the generic
 * one. Axe; zero CSP violations. Screenshot: generic-examples-1280x800.png.
 */
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { openDemo, record, shotsDir, showRecord } from './editor-kit';

test('a generic reaction lists its examples; the example says "Example of"', async ({ page }) => {
  test.setTimeout(300_000);
  const seen = await watch(page);
  await openDemo(page);
  await showRecord(page, 'r', '1° alcohol → aldehyde (PCC)', 'rxn_alcohol1-to-aldehyde-pcc');
  // 8.1: the examples are a group of cards under the lead ("Examples"), not a closed disclosure in the author section
  const examples = record(page).getByRole('region', { name: 'Examples' });
  await expect(examples.getByRole('button', { name: /Ethanol → ethanal \(PCC\)/ })).toBeVisible();
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/generic-examples-1280x800.png` });
  await examples.getByRole('button', { name: /Ethanol → ethanal \(PCC\)/ }).first().click();
  await expect(record(page)).toHaveAttribute('data-record-id', 'rxn_ethanol-to-ethanal-pcc');
  await expect(record(page).getByRole('list', { name: 'Key facts' })).toContainText('Example of');
  await expectClean(seen);
});
