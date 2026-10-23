/**
 * Small helpers of the authoring driver (step 6.9, Part 2): sections, selects by words, the record pickers, and the names of records in the
 * demo. The driver goes through the screen only; these never touch the store. Test-side only.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';
import type { DemoRecords } from './author-data';

type Bag = Record<string, unknown>;
export const asBag = (value: unknown): Bag => (typeof value === 'object' && value !== null ? (value as Bag) : {});
export const asList = (value: unknown): Bag[] => (Array.isArray(value) ? value.map(asBag) : []);

/** A record's name as the pickers show it (species / class / reagent / concept ...: `names.canonical`, `name` or `title`). */
export function nameOfDemo(demo: DemoRecords, kind: string, id: string): string {
  const record = asBag(demo[kind]?.[id]);
  const names = asBag(record['names']);
  const text = names['canonical'] ?? record['name'] ?? record['title'];
  if (typeof text !== 'string') throw new Error(`the demo has no ${kind} ${id}`);
  return text;
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const exactly = (text: string): RegExp => new RegExp(`^${escape(text)}$`);

/** Opens a collapsed section by its title; a section that is open stays open. */
export async function openSection(dialog: Locator, title: string): Promise<void> {
  const header = dialog.getByRole('button', { name: new RegExp(`^${escape(title)}`) }).first();
  if ((await header.getAttribute('aria-expanded')) === 'false') await header.click();
}

/** Chooses the option of a select whose text matches (the options of these selects carry words, not the schema's values). */
export async function chooseText(select: Locator, text: RegExp): Promise<void> {
  const options = await select.locator('option').evaluateAll((all) => all.map((option) => ({ value: (option as HTMLOptionElement).value, text: option.textContent ?? '' })));
  const found = options.find((option) => text.test(option.text));
  if (found === undefined) throw new Error(`no option like ${text} among ${options.map((option) => option.text).join(' | ')}`);
  await select.selectOption(found.value);
}

/** Types into a record picker, waits until the wanted result is offered, and adds it (the search may lag a moment behind a record just made). */
export async function pickRecord(scope: Locator, field: string | RegExp, list: string | RegExp, name: string, order: 'first' | 'last' = 'first'): Promise<void> {
  const box = scope.getByLabel(field).first();
  const results = typeof list === 'string' ? scope.getByRole('list', { name: list, exact: true }) : scope.getByRole('list', { name: list });
  const add = results.getByRole('button', { name: `Add ${name}`, exact: true });
  const wanted = order === 'first' ? add.first() : add.last();
  await expect(async () => {
    await box.fill('');
    await box.fill(name);
    await expect(wanted).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  await wanted.click();
}

/** The sentence-case words of a schema word, as the editors print them ("workup_reagent" -> "workup reagent"). */
export const spaced = (word: string): string => word.replace(/_/g, ' ');

/** The toasts are dismissed so a screenshot shows the page and not the notices. */
export async function dismissToasts(page: Page): Promise<void> {
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
}

let phoneMode = false;
/** A phone run opens the editors through More (there is no Workbench or File menu) and reads the data back through More. */
export function setPhone(on: boolean): void {
  phoneMode = on;
}
export const onPhone = (): boolean => phoneMode;

/** "New <thing>" (the Workbench's button, or the phone's More list). */
export async function openNew(page: Page, title: string): Promise<void> {
  if (phoneMode) {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: title, exact: true }).click();
    return;
  }
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: /Workbench/ }).click();
  await page.getByRole('button', { name: title, exact: true }).click();
}
