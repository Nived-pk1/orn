/**
 * Step 8.5d: the owner's two cut-off cards (Pyrolysis of esters, Dieckmann condensation of dimethyl hexanedioate) in the Esters family page, on the
 * owner's real package (the newest in ..\fable-work\inputs, or ORN_ARROW_DATA), with Show all atoms off and on: nothing clipped, every drawing at a
 * bond length between the floor and the standard. Screenshots: screenshots/8.5e/owner-<card>-<mode>.png. Skipped when the package is not there.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { chooseFile, expectPreview, leaveChapters, openApp } from './kit';
import { palette, shotsDir } from './editor-kit';

const PACKAGE = process.env.ORN_ARROW_DATA ?? resolve(process.cwd(), '../fable-work/inputs/ORN-real-data-2026-11-24.orn.json');
const CARDS = [
  { slug: 'pyrolysis', title: /^Pyrolysis of esters/ },
  { slug: 'dieckmann', title: /^Dieckmann condensation of dimethyl hexanedioate/ },
] as const;

async function problems(card: Locator): Promise<string[]> {
  return card.evaluate((root) => {
    const out: string[] = [];
    const clips = (el: HTMLElement): boolean => /hidden|clip/.test(getComputedStyle(el).overflowX + getComputedStyle(el).overflowY) || /paint/.test(getComputedStyle(el).contain);
    for (const img of root.querySelectorAll<HTMLImageElement>('figure[data-substance-id] img')) {
      const bond = Number(img.getAttribute('data-bond-px'));
      if (!(bond >= 23.74 && bond <= 28.06)) out.push(`bond ${bond} (${img.alt})`);
      const r = img.getBoundingClientRect();
      for (let up = img.parentElement; up !== null && up !== root; up = up.parentElement) {
        if (up.hasAttribute('data-scrolls')) break;
        if (!clips(up)) continue;
        const c = up.getBoundingClientRect();
        if (r.right > c.right + 1 || r.left < c.left - 1 || r.bottom > c.bottom + 1 || r.top < c.top - 1) out.push(`clipped (${img.alt})`);
        break;
      }
    }
    for (const text of root.querySelectorAll<HTMLElement>('figure[data-substance-id] figcaption span, figure[data-substance-id] [data-box-formula]')) if (text.scrollWidth > text.clientWidth + 1 && /hidden|clip/.test(getComputedStyle(text).overflowX)) out.push(`text clipped: ${text.textContent}`);
    return out;
  });
}

async function setStructures(page: Page, mode: 'Skeletal' | 'Full'): Promise<void> {
  await page.keyboard.press('Control+K');
  await expect(palette(page)).toBeVisible();
  await palette(page).getByRole('combobox').fill(`>Structures: ${mode}`);
  await palette(page).getByRole('option', { name: new RegExp(`Structures: ${mode}`) }).click();
  await expect(palette(page)).toBeHidden();
}

test("the owner's two cards on the real package: nothing clipped, Show all atoms off and on", async ({ page }) => {
  test.skip(!existsSync(PACKAGE), 'the owner package is not on this machine');
  test.setTimeout(280_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await chooseFile(page, { name: 'owner.orn.json', mimeType: 'application/json', buffer: readFileSync(PACKAGE) });
  await expectPreview(page);
  await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 120_000 });
  await leaveChapters(page);
  await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible({ timeout: 90_000 });
  await page.locator('svg [data-node-id="cls_esters"]').dblclick({ force: true });
  await expect(page.getByRole('region', { name: /^Family page: Esters/ })).toBeVisible();
  const found: string[] = [];
  for (const mode of ['Skeletal', 'Full'] as const) {
    if (mode === 'Full') await setStructures(page, mode); // Skeletal is the setting a new window has
    for (const one of CARDS) {
      const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: one.title }) }).last();
      for (let i = 0; i < 80 && (await card.count()) === 0; i += 1) {
        await page.evaluate((dy) => {
          for (const el of document.querySelectorAll<HTMLElement>('*')) if (el.scrollHeight > el.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop += dy;
        }, i < 40 ? 400 : -400);
        await page.waitForTimeout(100);
      }
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByText('Drawing the structure…')).toHaveCount(0, { timeout: 60_000 });
      found.push(...(await problems(card)).map((p) => `${mode} ${one.slug}: ${p}`));
      if (one.slug === 'dieckmann' && mode === 'Skeletal') {
        // 8.5e acceptance: the skeletal reactant is at most 320 px wide in its card (with all atoms it may wrap or scroll, never clipped)
        const reactant = card.getByRole('img', { name: /^Structure of Dimethyl hexanedioate/i }).first();
        expect((await reactant.boundingBox())?.width ?? 9999, 'Dieckmann reactant width in px').toBeLessThanOrEqual(320);
      }
      await card.screenshot({ path: `${shotsDir()}/8.5d/owner-${one.slug}-${mode === 'Full' ? 'all-atoms' : 'skeletal'}-${process.env.ORN_SHOT_TAG ?? 'after'}.png` });
    }
  }
  expect(found).toEqual([]);
});
