/**
 * Step 7.2a A2 and A3, PRODUCTION Studio build, every engine. A2: every number that says "reactions" counts DISTINCT reactions: for EVERY
 * arrow of the demo's overview the List view's count is the inspector's "Reactions on this arrow (n)" (an arrow of one reaction has no such
 * list) and, for the arrow that was counted twice before (Alkenes to Haloalkanes: 4 arrows, 2 reactions), the Reactions view's count.
 * A3: a compact row of a reaction with several outcome groups names each group before its equation.
 * Screenshots: overview-counts-1280x800.png, reactions-compact-groups-1280x800.png.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { openDemo, pane, shotsDir } from './editor-kit';

test.use({ actionTimeout: 60_000 });

const TOTAL = 26; // the CARDS of the demo (27 reactions, one folded under its general reaction, 7.3a C1)
const modes = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const reactions = (page: Page) => page.getByRole('region', { name: 'Reactions', exact: true });

async function dismissToasts(page: Page): Promise<void> {
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
}

test.describe('Studio, desktop', () => {
  test('A2: every arrow of the overview says the inspector\'s number; the old double counts are gone', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await dismissToasts(page);
    await page.screenshot({ path: `${shotsDir()}/overview-counts-1280x800.png` });
    await page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button', { name: 'List' }).click();
    const arrows = page.getByRole('table', { name: 'Arrows' });
    await expect(arrows).toBeVisible();
    const rows = arrows.locator('[role="row"]').filter({ has: page.locator('[role="cell"], [role="gridcell"]') });
    const n = await rows.count();
    expect(n).toBeGreaterThan(5);
    const seenCounts: Record<string, number> = {};
    for (let i = 0; i < n; i += 1) {
      const row = rows.nth(i);
      const cells = await row.locator('[role="cell"], [role="gridcell"]').allTextContents();
      const count = Number(cells[cells.length - 1]);
      seenCounts[`${cells[0]} > ${cells[1]}`] = count;
      await row.click();
      const list = pane(page).getByRole('region', { name: 'Reactions on this arrow' });
      if (count >= 2) await expect(list.getByRole('heading', { name: new RegExp(`^Reactions on this arrow \\(${count}\\)( \\(\\+ \\d+ examples?\\))?$`) })).toBeVisible();
      else await expect(list).toHaveCount(0);
    }
    // the three arrows that counted outcomes (the numbers before 7.2a were 4, 2 and 2)
    expect(seenCounts['Alkenes > Haloalkanes']).toBe(2);
    expect(seenCounts['Haloalkanes > Alkenes']).toBe(1);
    expect(seenCounts['Aldehydes > Aldehydes']).toBe(1);
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });

  test('A2: the Reactions view agrees for the arrow that was counted twice', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button', { name: 'List' }).click();
    const arrows = page.getByRole('table', { name: 'Arrows' });
    await expect(arrows).toBeVisible();
    const rows = arrows.locator('[role="row"]').filter({ has: page.locator('[role="cell"], [role="gridcell"]') });
    // the table is virtual: walk it from the top (each click scrolls the next row into view) until the arrow is reached
    let reached = false;
    for (let i = 0; i < (await rows.count()) && !reached; i += 1) {
      const cells = await rows.nth(i).locator('[role="cell"], [role="gridcell"]').allTextContents();
      if (cells[0] !== 'Alkenes' || cells[1] !== 'Haloalkanes') continue;
      reached = true;
      await rows.nth(i).click();
    }
    expect(reached).toBe(true);
    await pane(page).getByRole('button', { name: 'Open these 2 reactions in Reactions' }).click();
    await expect(reactions(page).getByText(`2 of ${TOTAL} reactions`).first()).toBeVisible();
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });

  test('A3: a compact row names each outcome group before its equation', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemo(page);
    await modes(page).getByRole('button', { name: 'Reactions' }).click();
    await expect(page.getByRole('heading', { name: 'Reactions', exact: true })).toBeVisible();
    await expect(reactions(page).locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
    await reactions(page).getByRole('radio', { name: 'Compact' }).check();
    await reactions(page).getByRole('searchbox', { name: 'Find by name' }).fill('conc. H');
    const row = reactions(page).locator('[data-reaction-id="rxn_ethanol-conc-h2so4"]');
    await expect(row).toBeVisible();
    await expect(row).toContainText('At 413 K: Ethanol → Diethyl ether (major)');
    await expect(row).toContainText('At 443 K: Ethanol → Ethene (major)');
    await reactions(page).getByRole('searchbox', { name: 'Find by name' }).fill('aldol');
    await expect(reactions(page).locator('[data-reaction-id="rxn_ethanal-aldol"]')).toContainText('Base-catalysed (dilute NaOH, cold):');
    await reactions(page).getByRole('searchbox', { name: 'Find by name' }).fill('');
    await dismissToasts(page);
    await page.screenshot({ path: `${shotsDir()}/reactions-compact-groups-1280x800.png` });
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });
});
