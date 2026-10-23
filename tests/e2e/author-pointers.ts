/**
 * The records that point at an authored reaction, entered through their own editors (step 6.9, Part 2): topic mappings, exam relevance,
 * relationships and caveats. Only the ends that exist are entered: a relationship whose other end is a reaction that was not authored in the
 * same run is skipped (and said), and a caveat keeps the targets that exist. Each pointer is compared by `compareRecord` afterwards.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';
import type { DemoRecords } from './author-data';
import { asBag, asList, nameOfDemo, openNew, openSection, pickRecord } from './author-helpers';

type Bag = Record<string, unknown>;

async function startNew(page: Page, title: string): Promise<Locator> {
  await openNew(page, title);
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function save(dialog: Locator, what: string): Promise<void> {
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 8_000 }).catch(async () => {
    const findings = await dialog.getByRole('region', { name: 'Findings' }).innerText().catch(() => '');
    throw new Error(`${what} was not saved. Findings: ${findings.replace(/\s+/g, ' ')}`);
  });
}

/** The record ends a pointer names, by id, that the run can enter: reactions that were authored (by name) and every other record. */
export type Present = (ref: { kind: string; id: string }) => boolean;

const target = (dialog: Locator, demo: DemoRecords, ref: Bag): Promise<void> =>
  pickRecord(dialog, 'Find the target record by name', 'Records found', nameOfDemo(demo, String(ref['kind']), String(ref['id'])));

async function topicMapping(page: Page, demo: DemoRecords, record: Bag): Promise<void> {
  const dialog = await startNew(page, 'New topic mapping');
  await target(dialog, demo, asBag(record['target']));
  await dialog.getByLabel('Topic', { exact: true }).selectOption(String(record['topicId']));
  await dialog.getByLabel('Role', { exact: true }).selectOption(String(record['role']));
  await save(dialog, 'The topic mapping');
}

async function examRelevance(page: Page, demo: DemoRecords, record: Bag): Promise<void> {
  const dialog = await startNew(page, 'New exam relevance');
  await target(dialog, demo, asBag(record['target']));
  await dialog.getByLabel('Exam', { exact: true }).selectOption(String(record['examId']));
  for (const id of (record['examVersionIds'] as string[]) ?? []) {
    const version = asBag(demo['exam_version']?.[id]);
    const words = String(version['label'] ?? version['name'] ?? id);
    await dialog.getByRole('group', { name: /^Versions of/ }).getByRole('checkbox', { name: words, exact: false }).check();
  }
  await dialog.getByLabel('Scope', { exact: true }).selectOption(String(record['scope']));
  if (record['importance'] !== undefined) await dialog.getByLabel('Importance', { exact: true }).selectOption(String(record['importance']));
  if (typeof record['note'] === 'string') {
    await openSection(dialog, 'Note, tags and citations');
    await dialog.getByLabel('Note', { exact: true }).fill(record['note']);
  }
  await save(dialog, 'The exam relevance');
}

async function relationship(page: Page, demo: DemoRecords, record: Bag): Promise<void> {
  const dialog = await startNew(page, 'New relationship');
  // the type decides which records can be named, so it comes first
  await dialog.getByLabel('Type of relationship', { exact: true }).selectOption(String(record['type']));
  for (const end of ['from', 'to'] as const) {
    const ref = asBag(record[end]);
    await pickRecord(dialog, `Find the ${end} record by name`, /found$/, nameOfDemo(demo, String(ref['kind']), String(ref['id'])));
  }
  if (typeof record['reverseKind'] === 'string') await dialog.getByLabel('Reverse kind', { exact: true }).selectOption(record['reverseKind']);
  if (typeof record['note'] === 'string') {
    await openSection(dialog, 'Note, tags and citations');
    await dialog.getByLabel('Note', { exact: true }).fill(record['note']);
  }
  await save(dialog, 'The relationship');
}

async function caveat(page: Page, demo: DemoRecords, record: Bag, present: Present): Promise<void> {
  const dialog = await startNew(page, 'New caveat');
  await dialog.getByLabel('Kind of caveat', { exact: true }).selectOption(String(record['caveatKind']));
  await dialog.getByLabel('Title (required)', { exact: true }).fill(String(record['title']));
  if (record['importance'] !== undefined) await dialog.getByLabel('Importance', { exact: true }).selectOption(String(record['importance']));
  await dialog.getByLabel('Statement (required)', { exact: true }).fill(String(record['statement']));
  for (const [key, label] of [['rule', 'Rule'], ['trigger', 'Trigger'], ['explanation', 'Explanation']] as const) {
    if (typeof record[key] === 'string') await dialog.getByLabel(label, { exact: true }).fill(String(record[key]));
  }
  for (const id of (record['conceptIds'] as string[]) ?? []) {
    await openSection(dialog, 'Concepts, notes, tags and citations');
    await pickRecord(dialog, 'Find a concept by name', 'Concepts found', nameOfDemo(demo, 'concept', id));
  }
  for (const item of asList(record['targets'])) {
    const ref = asBag(item['ref']);
    if (!present({ kind: String(ref['kind']), id: String(ref['id']) })) continue;
    const name = nameOfDemo(demo, String(ref['kind']), String(ref['id']));
    await pickRecord(dialog, 'Find a target record by name', /found$/, name);
    await dialog.getByLabel(`Role of ${name}`, { exact: true }).selectOption(String(item['as']));
  }
  await save(dialog, 'The caveat');
}

/** The pointer records of `demo` that point at the reaction `id` (and the kinds the editors can enter), as the plan lists them. */
export function pointersAt(demo: DemoRecords, id: string): { readonly kind: string; readonly record: Bag }[] {
  const out: { kind: string; record: Bag }[] = [];
  for (const kind of ['topic_mapping', 'exam_relevance', 'relationship', 'caveat']) {
    for (const record of Object.values(demo[kind] ?? {})) {
      if (JSON.stringify(record).includes(`"${id}"`)) out.push({ kind, record });
    }
  }
  return out;
}

/** Enters one pointer record; false (and nothing entered) when an end it needs is not in the data. */
export async function authorPointer(page: Page, demo: DemoRecords, kind: string, record: Bag, present: Present): Promise<boolean> {
  if (kind === 'relationship' && !(present(asBag(record['from']) as never) && present(asBag(record['to']) as never))) return false;
  if (kind === 'topic_mapping') await topicMapping(page, demo, record);
  else if (kind === 'exam_relevance') await examRelevance(page, demo, record);
  else if (kind === 'relationship') await relationship(page, demo, record);
  else await caveat(page, demo, record, present);
  return true;
}
