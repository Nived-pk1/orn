/**
 * Step 6.1b part 2 (openItem 23): two tabs of one browser profile. The writer renames a species with Edit names and saves; the follower tab's
 * search finds the new name (and no longer the old) without a reload, and its own Edit names is unavailable with its reason. Chromium, Firefox
 * and WebKit (a persistent context in WebKit, see fixtures.ts).
 */
import { expect, test } from './fixtures';
import { expectClean, loadDemo, openApp, watch } from './kit';
import { canonicalInput, editorDialog, openNamesEditor, palette, pane, record, searchFor, showSpecies } from './editor-kit';

const FOLLOWER = /This tab is read-only because another tab of this app is the writer/;
const NEW_NAME = 'Quinquagesimal zymurgy';

test('a rename saved in the writer tab is found by the follower tab\'s search, and the follower cannot edit names', async ({ makeContext }) => {
  test.setTimeout(300_000);
  const context = await makeContext({ baseURL: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 800 } });
  const writer = context.pages()[0] ?? (await context.newPage());
  const seenWriter = await watch(writer);
  await openApp(writer);
  await loadDemo(writer);
  await expect(writer.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();

  const follower = await context.newPage();
  const seenFollower = await watch(follower);
  await openApp(follower);
  await expect(follower.getByText(FOLLOWER)).toBeVisible({ timeout: 60_000 });
  await follower.setViewportSize({ width: 1280, height: 800 });

  // the follower's palette knows the old name first (its index is loaded from the data the writer saved)
  await showSpecies(follower, 'spc_ethanol', 'ethanol');
  await expect(record(follower).getByRole('heading', { level: 3, name: 'Ethanol', exact: true })).toBeVisible();

  // the writer renames and saves
  await showSpecies(writer, 'spc_ethanol', 'ethanol');
  await openNamesEditor(writer, 'Ethanol');
  await canonicalInput(writer).fill(NEW_NAME);
  await editorDialog(writer, 'Ethanol').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editorDialog(writer, 'Ethanol')).toBeHidden();
  await expect(writer.getByText(/^Saved \(revision \d+\)$/)).toBeVisible({ timeout: 60_000 });

  // the follower's inspector follows, and its search finds the new name and not the old (no reload)
  await expect(record(follower).getByRole('heading', { level: 3, name: NEW_NAME })).toBeVisible({ timeout: 90_000 });
  await follower.keyboard.press('Control+K');
  await expect(palette(follower)).toBeVisible();
  await searchFor(follower, 's: zymurgy');
  await expect(palette(follower).locator('[role="option"][data-record-id="spc_ethanol"]')).toBeVisible({ timeout: 60_000 });
  await searchFor(follower, 's: ethanol');
  await expect(palette(follower).getByRole('status')).not.toHaveText(/^Search is (starting|catching up with your latest change)$/);
  await expect(palette(follower).locator('[role="option"][data-record-id="spc_ethanol"]')).toHaveCount(0);
  await follower.keyboard.press('Escape');

  // the follower's Edit names is unavailable, with its reason
  const edit = pane(follower).getByRole('button', { name: 'Edit', exact: true });
  await expect(edit).toHaveAttribute('aria-disabled', 'true');
  await expect(edit).toHaveAccessibleDescription(/read-only|another tab|writer/i);
  await expect(follower.getByText(FOLLOWER)).toBeVisible();

  await expectClean(seenFollower);
  expect(seenWriter.consoleErrors, 'writer console errors').toEqual([]);
  expect(seenWriter.pageErrors, 'writer page errors').toEqual([]);
  await context.close();
});
