/** The nested editor of "Create new" (step 6.9, Part 2): the plan's species and reagent are made from scratch while a reaction is authored. */
import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';
import { MADE_FROM_SCRATCH, type DemoRecords } from './author-data';
import { asBag, nameOfDemo, pickRecord } from './author-helpers';

/** "Create new <kind> "<name>"" from a picker: the nested editor opens over this one, the demo's name / structure / classes go in, Save. */
export async function createNested(dialog: Locator, page: Page, demo: DemoRecords, field: string, kind: string, id: string): Promise<void> {
  const record = asBag(demo[kind]?.[id]);
  const name = nameOfDemo(demo, kind, id);
  await dialog.getByLabel(field).first().fill(name);
  await dialog.getByRole('button', { name: `Create new ${kind} "${name}"`, exact: true }).click();
  const nested = page.getByRole('dialog', { name: `New ${kind}` });
  await expect(nested).toBeVisible();
  await expect(nested.getByLabel('Canonical name (required)')).toHaveValue(name);
  if (kind === 'species') {
    const structure = asBag(record['structure']);
    if (typeof structure['value'] === 'string') {
      await nested.getByLabel('SMILES, CXSMILES or molfile').fill(structure['value']);
      await expect(nested.getByRole('img', { name: 'Drawing of the entered structure' })).toBeVisible({ timeout: 60_000 });
    }
    for (const classId of (record['classIds'] as string[] | undefined) ?? []) {
      const className = nameOfDemo(demo, 'class', classId);
      await nested.getByLabel(/^Find a class by name/).fill(className);
      await nested.getByRole('list', { name: 'Classes found' }).getByRole('button', { name: `Add ${className}`, exact: true }).click();
    }
  }
  await nested.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(nested).toBeHidden({ timeout: 8_000 }).catch(async () => {
    const findings = await nested.getByRole('region', { name: 'Findings' }).innerText().catch(() => '');
    throw new Error(`The new ${kind} "${name}" was not saved. Findings: ${findings.replace(/\s+/g, ' ')}`);
  });
}

const made = new Set<string>();
/** A new run starts with nothing made yet. */
export function resetMade(): void {
  made.clear();
}

/** A substance of the demo: found in the picker, or - the plan's three records - created the first time it is needed and found after that. */
export async function substanceOrCreate(dialog: Locator, page: Page, demo: DemoRecords, field: string, list: string, kind: string, id: string): Promise<void> {
  if ((MADE_FROM_SCRATCH as readonly string[]).includes(id) && !made.has(id)) {
    made.add(id);
    await createNested(dialog, page, demo, field, kind, id);
  } else await pickRecord(dialog, field, list, nameOfDemo(demo, kind, id));
}
