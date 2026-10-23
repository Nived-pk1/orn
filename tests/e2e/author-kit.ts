/**
 * The authoring driver (step 6.9, Part 2): given a reaction record of the demo, enters it through the Studio screen ONLY - the reaction
 * editor's sections (identity, participants, stages with conditions, variants, outcomes with products, mechanism links, classification, links
 * and reversibility, notes) and Save. No store writes and no import of the reaction itself. The species and the reagent the plan makes "from
 * scratch" are created through the editor's own "Create new" (the nested editor). The records that point at the reaction are in
 * `author-pointers.ts`. Test-side only.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';
import type { DemoRecords } from './author-data';
import { substanceOrCreate } from './author-nested';
import { setParameters, usedFields } from './author-conditions';
import { asBag, asList, chooseText, exactly, nameOfDemo, openNew, openSection, pickRecord, spaced } from './author-helpers';
import { authorOutcomes } from './author-outcomes';

type Bag = Record<string, unknown>;
export const reactionDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'New reaction' });

/** Where a substance is found: its kind decides which "Create new" it needs if the data set lacks it. */
async function addSubstance(dialog: Locator, page: Page, demo: DemoRecords, ref: Bag, role: string): Promise<void> {
  const kind = String(ref['kind']);
  const id = String(ref['id']);
  await dialog.getByLabel('Add it as').selectOption(role);
  await substanceOrCreate(dialog, page, demo, 'Find a substance by name', 'Substances found', kind, id);
}

async function identity(dialog: Locator, demo: DemoRecords, rxn: Bag): Promise<void> {
  await dialog.getByLabel('Name (required)').fill(String(rxn['name']));
  await dialog.getByLabel('Scope (required)').selectOption(String(rxn['scope']));
  for (const [at, alias] of (rxn['aliases'] as string[]).entries()) {
    await dialog.getByRole('button', { name: /^Add alias/i }).click();
    await dialog.getByLabel(`Alias ${at + 1}`, { exact: true }).fill(alias);
  }
  const wanted = new Set(rxn['purposes'] as string[]);
  const purposes = dialog.getByRole('group', { name: 'Purposes' });
  for (const word of ['synthesis', 'qualitative_test', 'distinction_test', 'industrial_process', 'degradation', 'protection', 'mechanistic_probe']) {
    const box = purposes.getByRole('checkbox', { name: new RegExp(`^${spaced(word)}$`, 'i') });
    if (wanted.has(word)) await box.check();
    else await box.uncheck();
  }
  if (typeof rxn['instanceOfId'] === 'string') await pickRecord(dialog, 'Find the generic reaction by name', 'Generic reactions found', nameOfDemo(demo, 'reaction', rxn['instanceOfId']));
}

async function stages(dialog: Locator, rxn: Bag): Promise<void> {
  for (const [at, stage] of asList(rxn['stages']).entries()) {
    await chooseText(dialog.getByLabel('Add a stage of kind'), new RegExp(`^${spaced(String(stage['kind']))}$`, 'i'));
    await dialog.getByRole('button', { name: 'Add stage', exact: true }).click();
    if (typeof stage['label'] === 'string') await dialog.getByLabel(`Label of stage ${at + 1}`, { exact: true }).fill(stage['label']);
  }
}

/** Participants in the demo's order; each goes to the stage that lists it, and gets the fields the demo gives it. */
async function participants(dialog: Locator, page: Page, demo: DemoRecords, rxn: Bag): Promise<void> {
  const stageOf = new Map<string, number>();
  asList(rxn['stages']).forEach((stage, at) => (stage['participantIds'] as string[]).forEach((id) => stageOf.set(id, at)));
  for (const [at, p] of asList(rxn['participants']).entries()) {
    const n = at + 1;
    await addSubstance(dialog, page, demo, asBag(p['ref']), String(p['role']));
    await expect(dialog.getByTestId('participant-row')).toHaveCount(n);
    const open = dialog.getByRole('button', { name: `Edit participant ${n}`, exact: true });
    if (await open.count()) await open.click();
    const field = (what: string): Locator => dialog.getByLabel(`${what} of participant ${n}`, { exact: true });
    if (stageOf.has(String(p['id']))) await chooseText(field('Stage'), new RegExp(`^(Stage )?${(stageOf.get(String(p['id'])) ?? 0) + 1}\\b`));
    if (p['coefficient'] !== undefined) await field('Coefficient').fill(String(p['coefficient']));
    if (p['phase'] !== undefined) await field('Phase').selectOption(String(p['phase']));
    if (p['strength'] !== undefined) await field('Strength').selectOption(String(p['strength']));
    const more = dialog.getByRole('group', { name: `Participant ${n}`, exact: true }).locator('details').first();
    if (!(await more.evaluate((element) => (element as HTMLDetailsElement).open))) await more.locator('summary').click();
    if (p['dry'] === true) await dialog.getByLabel(`Dry: participant ${n}`, { exact: true }).check();
    const primary = dialog.getByLabel(`Main substrate: participant ${n}`, { exact: true });
    if (p['isPrimarySubstrate'] === true) await primary.check();
    else if (await primary.isChecked()) await primary.uncheck();
    const quantity = asBag(p['quantity']);
    if (quantity['equivalents'] !== undefined) await field('Equivalents').fill(String(quantity['equivalents']));
    if (quantity['qualifier'] !== undefined) await field('Amount word').selectOption(String(quantity['qualifier']));
    if (quantity['text'] !== undefined) await field('Amount text').fill(String(quantity['text']));
    if (typeof p['profileId'] === 'string') {
      const reagent = asBag(demo['reagent']?.[String(asBag(p['ref'])['id'])]);
      const profile = asList(reagent['profiles']).find((one) => one['id'] === p['profileId']);
      await chooseText(field('Profile'), exactly(String(profile?.['label'] ?? p['profileId'])));
    }
    const flags = asBag(p['flags']);
    if (Object.keys(flags).length > 0) {
      const advanced = dialog.getByRole('group', { name: `Participant ${n}`, exact: true }).locator('details').nth(1);
      if (!(await advanced.evaluate((element) => (element as HTMLDetailsElement).open))) await advanced.locator('summary').click();
      for (const [flag, label] of [['contributesAtoms', 'Contributes atoms to the products'], ['consumed', 'Is consumed'], ['catalytic', 'Is catalytic']] as const) {
        if (typeof flags[flag] === 'boolean') await dialog.getByLabel(`${label}: participant ${n}`, { exact: true }).selectOption(flags[flag] ? 'yes' : 'no');
      }
    }
    const close = dialog.getByRole('button', { name: `Close participant ${n}`, exact: true });
    if (await close.count()) await close.click();
  }
}

async function stageConditions(dialog: Locator, rxn: Bag): Promise<void> {
  for (const [at, stage] of asList(rxn['stages']).entries()) {
    const params = asBag(stage['parameters']);
    if (usedFields(params).length === 0) continue;
    await dialog.getByRole('button', { name: `Edit conditions of stage ${at + 1}`, exact: true }).click();
    await setParameters(dialog, `stage ${at + 1}`, params);
    await dialog.getByRole('button', { name: `Close conditions of stage ${at + 1}`, exact: true }).click();
  }
}

async function variants(dialog: Locator, rxn: Bag): Promise<void> {
  const stageList = asList(rxn['stages']);
  for (const [at, variant] of asList(rxn['conditionVariants']).entries()) {
    await dialog.getByLabel('Label of a new variant (required)').fill(String(variant['label']));
    const stageAt = stageList.findIndex((stage) => stage['id'] === variant['stageId']);
    if (stageList.length >= 2 && stageAt >= 0) await chooseText(dialog.getByLabel('Stage it overrides').last(), new RegExp(`^(Stage )?${stageAt + 1}\\b`));
    await dialog.getByRole('button', { name: 'Add variant', exact: true }).click();
    const params = asBag(variant['parameters']);
    await setParameters(dialog.getByRole('group', { name: `Variant ${at + 1}`, exact: true }), `variant ${at + 1}`, params, true);
    const closer = dialog.getByRole('button', { name: `Close variant ${at + 1}`, exact: true });
    if (await closer.count()) await closer.click();
  }
}

async function picks(scope: Locator, field: string, list: string, ids: unknown, kind: string, demo: DemoRecords): Promise<void> {
  for (const id of (ids as string[] | undefined) ?? []) await pickRecord(scope, field, list, nameOfDemo(demo, kind, id));
}

async function classification(dialog: Locator, demo: DemoRecords, rxn: Bag): Promise<void> {
  await openSection(dialog, 'Classification');
  for (const [key, title, find] of [['reactionTypes', 'Reaction types', 'Find a reaction type by name'], ['mechanismClasses', 'Mechanism classes', 'Find a mechanism class by name']] as const) {
    const group = dialog.getByRole('group', { name: title, exact: true });
    for (const item of asList(rxn[key])) {
      const name = nameOfDemo(demo, 'concept', String(item['conceptId']));
      await pickRecord(group, find, 'Concepts found', name);
      await group.getByLabel(`Certainty of ${name}`, { exact: true }).selectOption(String(item['certainty']));
    }
  }
}

async function links(dialog: Locator, demo: DemoRecords, rxn: Bag): Promise<void> {
  await openSection(dialog, 'Links and reversibility');
  const reversibility = asBag(rxn['reversibility']);
  await chooseText(dialog.getByLabel('Reversibility', { exact: true }), reversibility['kind'] === 'unknown' ? /^Not stated/ : new RegExp(`^${spaced(String(reversibility['kind']))}`, 'i'));
  if (typeof reversibility['note'] === 'string') await dialog.getByLabel('Reversibility note').fill(reversibility['note']);
  await picks(dialog, 'Find a named reaction by name', 'Named reactions found', rxn['namedReactionIds'], 'named_reaction', demo);
  await picks(dialog, 'Find a transformation by name', 'Transformations found', rxn['transformationIds'], 'transformation', demo);
  await picks(dialog, 'Find a prerequisite concept by name', 'Concepts found', rxn['prerequisiteConceptIds'], 'concept', demo);
  if (typeof rxn['generalizedEquation'] === 'string') await dialog.getByLabel('Generalised equation').fill(rxn['generalizedEquation']);
  if (rxn['difficulty'] !== undefined) await dialog.getByLabel('Difficulty', { exact: true }).selectOption(String(rxn['difficulty']));
}

async function notes(dialog: Locator, demo: DemoRecords, rxn: Bag): Promise<void> {
  await openSection(dialog, 'Notes, tags and citations');
  for (const [key, label] of [['limitations', 'Limitations'], ['studyNotes', 'Study notes'], ['notes', 'Notes']] as const) {
    if (typeof rxn[key] === 'string') await dialog.getByLabel(label, { exact: true }).fill(rxn[key]);
  }
  await picks(dialog, 'Find a concept by name', 'Concepts found', rxn['conceptIds'], 'concept', demo);
}

async function mechanismLinks(dialog: Locator, demo: DemoRecords, rxn: Bag): Promise<void> {
  const ids = (rxn['mechanismIds'] as string[]) ?? [];
  if (ids.length > 0) await openSection(dialog, 'Mechanism links');
  await picks(dialog, 'Find the mechanism by name', 'Mechanisms found', ids, 'mechanism', demo);
}

/** Enters the whole reaction into the open "New reaction" dialog and saves it. */
export async function authorReaction(page: Page, demo: DemoRecords, rxn: Bag): Promise<void> {
  await openNew(page, 'New reaction');
  const dialog = reactionDialog(page);
  await expect(dialog).toBeVisible();
  await identity(dialog, demo, rxn);
  for (const title of ['Participants', 'Stages']) await openSection(dialog, title);
  await stages(dialog, rxn);
  await participants(dialog, page, demo, rxn);
  await stageConditions(dialog, rxn);
  if (asList(rxn['conditionVariants']).length > 0) await openSection(dialog, 'Condition variants');
  await variants(dialog, rxn);
  await mechanismLinks(dialog, demo, rxn);
  await openSection(dialog, 'Outcomes');
  await authorOutcomes(dialog, page, demo, rxn);
  await classification(dialog, demo, rxn);
  await links(dialog, demo, rxn);
  await notes(dialog, demo, rxn);
  await openSection(dialog, 'Review');
  await dialog.getByLabel('Lifecycle').selectOption(String(asBag(rxn['review'])['lifecycle'] ?? 'published'));
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 8_000 }).catch(async () => {
    // not saved: say why in the failure (the findings the editor shows, and any alert)
    const findings = await dialog.getByRole('region', { name: 'Findings' }).innerText().catch(() => '');
    const alerts = await dialog.getByRole('alert').allInnerTexts().catch(() => []);
    throw new Error(`"${String(rxn['name'])}" was not saved. Findings: ${findings.replace(/\s+/g, ' ')} Alerts: ${alerts.join(' | ')}`);
  });
  await expect(page.getByText(/^Saved/).first()).toBeVisible();
}
