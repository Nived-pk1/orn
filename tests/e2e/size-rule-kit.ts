/**
 * Shared by the size-rule specs (8.5d, 8.5e): the awkward set's checks (nothing clipped, a bond length between the floor and the standard of the
 * drawing's context, no label under 11 px), the import of the set and the walk over the family page.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';
import { chooseFile, expectPreview } from './kit';
import { palette } from './editor-kit';
import { AWKWARD, awkwardFile, reactionName, type Awkward } from './awkward-set';

export const STANDARDS = { family: 28, equation: 34, hero: 40, mechanism: 36 } as const;
const FLOOR = 0.85;
const LABEL_AT_STANDARD = 13;

/** What is wrong inside `root`: a drawing without a bond length or outside floor and standard, a label under 11 px, anything clipped. */
export async function problemsIn(root: Locator): Promise<string[]> {
  return root.evaluate(
    (element, k) => {
      const out: string[] = [];
      const boxes = [...element.querySelectorAll<HTMLElement>('figure[data-substance-id], [data-equation-rep], [data-hero-equation]')];
      for (const img of element.querySelectorAll<HTMLImageElement>('figure[data-substance-id] img, [data-equation-rep] img, [data-hero-equation] img')) {
        const bond = Number(img.getAttribute('data-bond-px'));
        const standard = img.closest('[data-hero-equation]') !== null ? k.standards.hero : img.closest('figure[data-substance-id]') !== null ? k.standards.family : k.standards.equation;
        if (!(bond > 0)) out.push(`a drawing has no data-bond-px (${img.alt})`);
        else {
          if (bond < standard * k.floor - 0.06 || bond > standard + 0.06) out.push(`bond ${bond} outside ${standard * k.floor}..${standard} (${img.alt})`);
          if ((bond / standard) * k.label < 11 - 0.06) out.push(`labels under 11 px at bond ${bond} (${img.alt})`);
        }
      }
      const clips = (el: HTMLElement): boolean => /hidden|clip/.test(getComputedStyle(el).overflowX) || /hidden|clip/.test(getComputedStyle(el).overflowY) || /paint/.test(getComputedStyle(el).contain);
      for (const item of [...element.querySelectorAll<HTMLElement>('figure[data-substance-id] img, figure[data-substance-id] span, [data-equation-rep] img, [data-equation-rep] span, [data-equation-name], figcaption span')]) {
        const r = item.getBoundingClientRect();
        if (r.width === 0 || item.closest('[aria-hidden="true"]') !== null) continue; // the hero keeps a hidden copy of its row to measure
        for (let up: HTMLElement | null = item.parentElement; up !== null && up !== element; up = up.parentElement) {
          if (up.hasAttribute('data-scrolls')) break;
          if (!clips(up) && !/auto|scroll/.test(getComputedStyle(up).overflowX)) continue;
          const c = up.getBoundingClientRect();
          if (r.right > c.right + 1 || r.left < c.left - 1 || r.bottom > c.bottom + 1 || r.top < c.top - 1) out.push(`clipped by ${up.className || up.tagName} [${Math.round(c.left)}..${Math.round(c.right)} x ${Math.round(c.top)}..${Math.round(c.bottom)}] item [${Math.round(r.left)}..${Math.round(r.right)} x ${Math.round(r.top)}..${Math.round(r.bottom)}]: ${(item.textContent || (item as HTMLImageElement).alt || item.tagName).slice(0, 40)}`);
          break;
        }
      }
      for (const box of boxes) if (box.hasAttribute('data-scrolls') === false && box.scrollWidth > box.clientWidth + 1 && /hidden|clip/.test(getComputedStyle(box).overflowX)) out.push(`scrollWidth > clientWidth on ${box.className}`);
      return out;
    },
    { standards: STANDARDS, floor: FLOOR, label: LABEL_AT_STANDARD },
  );
}

export const cardOf = (page: Page, item: Awkward): Locator => page.getByRole('article').filter({ has: page.getByRole('heading', { name: reactionName(item) }) }).last();

export async function importAwkward(page: Page): Promise<void> {
  await chooseFile(page, awkwardFile());
  await expectPreview(page);
  await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 120_000 });
}

export async function setStructures(page: Page, mode: 'Skeletal' | 'Full'): Promise<void> {
  await page.keyboard.press('Control+K');
  await expect(palette(page)).toBeVisible();
  await palette(page).getByRole('combobox').fill(`>Structures: ${mode}`);
  await palette(page).getByRole('option', { name: new RegExp(`Structures: ${mode}`) }).click();
  await expect(palette(page)).toBeHidden();
}

/** The family page's list is virtual: wheel down (then back up) until the card is drawn. */
export async function reveal(page: Page, card: Locator): Promise<void> {
  for (let i = 0; i < 60 && (await card.count()) === 0; i += 1) {
    await page.evaluate((dy) => {
      for (const el of document.querySelectorAll<HTMLElement>('*')) if (el.scrollHeight > el.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop += dy;
      window.scrollBy(0, dy);
    }, i < 30 ? 500 : -500);
    await page.waitForTimeout(120);
  }
}

export async function walkFamily(page: Page, tag: string, tap: boolean): Promise<string[]> {
  const found: string[] = [];
  for (const item of AWKWARD) {
    const card = cardOf(page, item);
    await reveal(page, card);
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByText('Drawing the structure…')).toHaveCount(0, { timeout: 60_000 });
    for (const p of await problemsIn(card)) found.push(`${tag} family ${item.label}: ${p}`);
    const summary = card.getByText('Show full equation');
    if ((await summary.count()) > 0) {
      await (tap ? summary.first().tap() : summary.first().click());
      const scheme = card.getByRole('group', { name: 'Full equation' });
      await expect(scheme).toBeVisible();
      await expect(scheme.getByText('Drawing the structure…')).toHaveCount(0, { timeout: 60_000 });
      for (const p of await problemsIn(scheme)) found.push(`${tag} equation ${item.label}: ${p}`);
    }
  }
  return found;
}

