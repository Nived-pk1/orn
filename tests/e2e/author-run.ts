/**
 * One authoring run (step 6.9, Part 2): the authoring data set is imported into a fresh app, the demo reaction `id` (after the generic one it
 * is an instance of) is entered through the Studio screen by `author-kit.ts`, the records that point at it through their own editors, and the
 * result is read back through the app's Export and compared with the demo by `reaction-compare.ts`. A difference that is not a known Gate D
 * finding fails the run; every difference is printed as `DIFFERENCE <id> | <text>`.
 */
import type { Page } from '@playwright/test';
import { expect } from './fixtures';
import { authoringData, demoRecords } from './author-data';
import { authorReaction } from './author-kit';
import { authorPointer, pointersAt } from './author-pointers';
import { resetMade } from './author-nested';
import { resolve } from 'node:path';
import { asBag, asList, dismissToasts, exactly, setPhone } from './author-helpers';
import { shotsDir, showRecord } from './editor-kit';
import { cardOf } from './outcome-kit';
import { exportRecords } from './author-readback';
import { compareReaction } from '../../src/test-support/reaction-compare';
import { knownFinding } from './author-findings';
import { chooseFile, expectClean, expectPreview, importDialog, openApp, openPhoneApp, watch } from './kit';

type Bag = Record<string, unknown>;

export async function runAuthoring(page: Page, id: string, options: { readonly phone?: boolean; readonly card?: string } = {}): Promise<void> {
  const phone = options.phone === true;
  resetMade();
  setPhone(phone);
  const seen = await watch(page);
  if (phone) await openPhoneApp(page);
  else {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
  }
  await chooseFile(page, authoringData().file);
  await expectPreview(page);
  await importDialog(page).getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/^Imported \d+ records from authoring-data\.orn\.json\./)).toBeVisible({ timeout: 90_000 });
  const demo = demoRecords();
  const reactions = demo['reaction'] ?? {};
  const base = typeof asBag(reactions[id])['instanceOfId'] === 'string' ? [String(asBag(reactions[id])['instanceOfId'])] : [];
  for (const wanted of [...base, id]) await authorReaction(page, demo, asBag(reactions[wanted]));
  if (options.card !== undefined) {
    // the authored reaction's card on its family page, beside nothing else (the toasts are dismissed first)
    const name = String(asBag(reactions[id])['name']);
    await showRecord(page, 'r', name);
    const card = cardOf(page, exactly(name)).first();
    await expect(card).toBeVisible({ timeout: 60_000 });
    await card.scrollIntoViewIfNeeded();
    await dismissToasts(page);
    await card.screenshot({ path: resolve(shotsDir(), options.card) });
  }
  const authored = await exportRecords(page);
  const nameIn = (records: typeof demo) => (rid: string): string | undefined => {
    for (const set of Object.values(records)) {
      const record = asBag(set[rid]);
      const text = asBag(record['names'])['canonical'] ?? record['name'] ?? record['title'];
      if (typeof text === 'string') return text;
    }
    return undefined;
  };
  const mine = Object.values(authored['reaction'] ?? {}).find((record) => record['name'] === reactions[id]?.['name']);
  expect(mine, 'the authored reaction is in the export').toBeDefined();
  const report = (what: string, differences: ReturnType<typeof compareReaction>): string[] => {
    for (const one of differences) {
      const finding = knownFinding(one.path);
      console.log(`DIFFERENCE ${id} | ${what}${one.text}${finding === undefined ? ' | UNKNOWN' : ` | finding: ${finding}`}`);
    }
    return differences.filter((one) => knownFinding(one.path) === undefined).map((one) => `${what}${one.text}`);
  };
  const unknown = report('', compareReaction(asBag(reactions[id]), asBag(mine), nameIn(demo), nameIn(authored)));
  // the records that point at it, through their own editors (an end that was not authored in this run is left out and said)
  const done = new Set([...base, id]);
  const pointers = pointersAt(demo, id);
  // a relationship between two reactions needs both: the other end is authored too (not compared here; it is a run of its own)
  for (const { kind, record } of pointers) {
    if (kind !== 'relationship') continue;
    for (const end of ['from', 'to'] as const) {
      const ref = asBag(record[end]);
      if (ref['kind'] !== 'reaction' || done.has(String(ref['id']))) continue;
      const other = asBag(reactions[String(ref['id'])]);
      const generic = typeof other['instanceOfId'] === 'string' ? String(other['instanceOfId']) : undefined;
      for (const wanted of generic === undefined || done.has(generic) ? [other] : [asBag(reactions[generic]), other]) {
        await authorReaction(page, demo, wanted);
        done.add(String(wanted['id']));
      }
    }
  }
  const present = (ref: { kind: string; id: string }): boolean => ref.kind !== 'reaction' || done.has(ref.id);
  for (const { kind, record } of pointers) {
    if (!(await authorPointer(page, demo, kind, record, present))) console.log(`SKIPPED ${id} | ${kind} ${String(record['id'])}: an end is a reaction not authored in this run`);
  }
  const again = await exportRecords(page);
  const mineId = String(asBag(mine)['id']);
  const key = (r: Bag): string => String(r['topicId'] ?? r['examId'] ?? r['type'] ?? r['title']);
  for (const { kind, record } of pointers) {
    const found = Object.values(again[kind] ?? {}).find((one) => JSON.stringify(one).includes(`"${mineId}"`) && key(one) === key(record));
    if (found === undefined) {
      console.log(`DIFFERENCE ${id} | ${kind} ${String(record['id'])}: not authored (an end is missing)`);
      continue;
    }
    const targets = asList(record['targets']).filter((one) => present(asBag(one['ref']) as { kind: string; id: string }));
    const trimmed = Array.isArray(record['targets']) ? { ...record, targets } : record;
    unknown.push(...report(`${kind} ${key(record)}: `, compareReaction(trimmed, found, nameIn(demo), nameIn(again))));
  }
  expect(unknown).toEqual([]);
  await expectClean(seen);
}
