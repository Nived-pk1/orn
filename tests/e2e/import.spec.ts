/**
 * The import screen end to end (step 5.9a), Chromium against the PRODUCTION build (the CSP exists only there). Files are made in Node
 * or taken from the repository and uploaded through the real chooser (E15). The demo re-imported into the demo changes nothing; the v6
 * fixture shows zero "not imported", its review items and the per-hub decision, then applies and the map shows its families; a
 * conflicting file does what keep mine / use the file's / keep both as a copy say (ADV-042) and Undo import restores the counts;
 * dangling references block and nothing applies until they are resolved (ADV-030); a synthetic v6 export keeps representative hub
 * SMILES and duplicate names (ADV-043); Cancel changes nothing and a blocked plan cannot be confirmed (INV-21); refusals are in words
 * and hostile file names are inert. axe on each screen; zero policy violations, console errors and foreign requests.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { produce } from 'immer';
import { documentToState, serializeDocument, stateToDocument } from '@/core/dataset';
import { buildDemoDocument } from '@/test-support/demo';
import { syntheticLegacy } from '@/test-support/legacy-synthetic';
import { axeProblems, chooseFileViaMenu, chooseV6, expectClean, expectPreview, importDialog, loadDemo, openApp, recordCount, showDataset, watch, type UploadFile } from './kit';

const SHOTS = resolve(process.cwd(), 'screenshots');
const JSON_TYPE = 'application/json';
const upload = (name: string, text: string | Buffer): UploadFile => ({ name, mimeType: JSON_TYPE, buffer: typeof text === 'string' ? Buffer.from(text, 'utf8') : text });
const demoFile = (): UploadFile => upload('demo-export.orn.json', readFileSync(resolve(process.cwd(), 'data/seed/demo.orn.json')));
const v6File = (): UploadFile => upload('v6-demo-export.json', readFileSync(resolve(process.cwd(), 'data/fixtures/legacy/v6-demo-export.json')));

/** The demo as a document, changed by `change`, as the bytes of an `.orn.json` file. */
function changedDemo(name: string, change: (state: ReturnType<typeof stateOf>) => ReturnType<typeof stateOf>): UploadFile {
  const doc = buildDemoDocument();
  const next = change(stateOf(doc));
  const result = serializeDocument(stateToDocument(next, { exportedAt: doc.exportedAt, exportScope: doc.exportScope, generator: doc.generator }));
  if (!result.ok) throw new Error('the changed demo does not serialise');
  return upload(name, result.text);
}
function stateOf(doc: ReturnType<typeof buildDemoDocument>) {
  const parsed = documentToState(doc);
  if (!parsed.ok) throw new Error('the demo has duplicate IDs');
  return parsed.state;
}

const RENAMED = ['spc_acetophenone', 'spc_aniline', 'spc_benzene'];
const renamedFile = (): UploadFile =>
  changedDemo('renamed.orn.json', (state) =>
    produce(state, (draft) => {
      for (const [index, id] of RENAMED.entries()) {
        const species = draft.records.species[id as never] as unknown as { names: { canonical: string } } | undefined;
        if (species === undefined) throw new Error(`the demo has no ${id}`);
        species.names.canonical = `Renamed species ${index + 1}`;
      }
    }),
  );

async function counts(page: Page): Promise<string> {
  await showDataset(page);
  return page.getByRole('list', { name: 'Record counts' }).innerText();
}

/** The palette finds a name (its results), or says there are none. */
async function finds(page: Page, text: string): Promise<boolean> {
  await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Search' });
  await palette.getByRole('combobox').fill(text);
  await expect(palette.getByRole('status')).not.toHaveText('Search is starting');
  await expect(palette.getByRole('status')).not.toHaveText('');
  const found = (await palette.getByRole('option').count()) > 0;
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  return found;
}

/** The search index follows an import after a short quiet time: poll until the palette says what is true. */
async function expectFinds(page: Page, text: string, expected: boolean): Promise<void> {
  await expect.poll(() => finds(page, text), { timeout: 60_000, message: `the palette ${expected ? 'finds' : 'does not find'} "${text}"` }).toBe(expected);
}

/** Playwright takes a buffer of at most 50 MB: the 51 MB file is written to a temporary folder and passed by its path. */
function hugeFile(): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'orn-huge-'));
  const path = resolve(dir, 'huge.json');
  writeFileSync(path, Buffer.alloc(51 * 1024 * 1024, 32));
  return path;
}

const toasts = (page: Page) => page.getByRole('status', { name: 'Notifications' });

test.describe('the import screen', () => {
  test('the demo exported and imported into the demo: identical everywhere, nothing changes', async ({ page }) => {
    test.setTimeout(180_000);
    const seen = await watch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await loadDemo(page);
    const before = await counts(page);
    await chooseFileViaMenu(page, demoFile());
    await expectPreview(page);
    const dialog = importDialog(page);
    const both = dialog.getByRole('region', { name: 'Records in both' });
    await expect(both.getByText(/\d+ identical \(skipped, nothing changes\); 0 differ\./)).toBeVisible();
    for (const item of await dialog.getByRole('list', { name: 'Records per kind' }).getByRole('listitem').allTextContents()) {
      expect(item, item).toMatch(/ — 0 new, \d+ identical, 0 conflicting$/);
    }
    expect(await axeProblems(page, 10)).toEqual([]);
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(toasts(page).getByText(/^Imported 0 records from demo-export\.orn\.json\. \d+ records were skipped/)).toBeVisible({ timeout: 90_000 });
    expect(await counts(page)).toBe(before);
    await expectClean(seen);
  });

  test('the v6 fixture through "Import v6 export": nothing left out, its review items, the per-hub decision; then it applies and the map shows its families', async ({ page }) => {
    test.setTimeout(180_000);
    const seen = await watch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await chooseV6(page, v6File());
    await expectPreview(page);
    const dialog = importDialog(page);
    const legacy = dialog.getByRole('region', { name: 'Legacy report' });
    await expect(legacy.getByText(/Not imported \(0\)/)).toBeVisible();
    await expect(legacy.getByText(/Nothing was left out/)).toBeVisible();
    await expect(legacy.getByText(/Needs your review \(\d+\)/)).toBeVisible();
    await expect(legacy.getByText(/Kept with the document, not with a record \(0\)/)).toBeVisible();
    const decision = dialog.getByRole('combobox', { name: /^Decision: Hub "Alkanes"/ });
    await expect(decision).toHaveValue('class');
    await expect(dialog.getByRole('list', { name: 'Records per kind' }).getByText(/^species: 12 in the file/)).toBeVisible();
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: resolve(SHOTS, 'import-v6-preview.png') });
    expect(await axeProblems(page, 10)).toEqual([]);
    // a choice is a revise of the full request: the preview updates
    await decision.selectOption('species');
    await expect(dialog.getByRole('list', { name: 'Records per kind' }).getByText(/^species: 13 in the file/)).toBeVisible();
    await expect(decision).toHaveValue('species');
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(toasts(page).getByText(/^Imported \d+ records from v6-demo-export\.json\./)).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible();
    await expectFinds(page, 'Alkanes', true);
    await expectClean(seen);
  });

  test('a conflicting file: keep mine, use the file\'s and keep both as a copy each do what they say; Undo import restores the counts (ADV-042)', async ({ page }) => {
    test.setTimeout(240_000);
    const seen = await watch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await loadDemo(page);
    const original = await counts(page);
    const species = (await recordCount(page, 'species')) ?? 0;

    // 1. the default is keep mine
    await chooseFileViaMenu(page, renamedFile());
    await expectPreview(page);
    const dialog = importDialog(page);
    const both = dialog.getByRole('region', { name: 'Records in both' });
    await expect(both.getByText(/\d+ identical \(skipped, nothing changes\); 3 differ\./)).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: /^Choice for species Acetophenone/ }).first()).toHaveValue('keep_current');
    await page.screenshot({ path: resolve(SHOTS, 'import-conflicts.png') });
    expect(await axeProblems(page, 10)).toEqual([]);
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(toasts(page).getByText(/^Imported 0 records from renamed\.orn\.json\./)).toBeVisible({ timeout: 90_000 });
    expect(await counts(page)).toBe(original);
    await expectFinds(page, 'Renamed species 1', false);

    // 2. use the file's, chosen for one record and then for all
    await chooseFileViaMenu(page, renamedFile());
    await expectPreview(page);
    await dialog.getByRole('combobox', { name: /^Choice for species Acetophenone/ }).first().selectOption('replace');
    await expect(dialog.getByRole('combobox', { name: /^Choice for species Acetophenone/ }).first()).toHaveValue('replace');
    await dialog.getByRole('button', { name: "Use the file's for all 3" }).click();
    await expect(dialog.getByRole('combobox', { name: /^Choice for species / }).first()).toHaveValue('replace');
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(toasts(page).getByText(/^Imported 3 records from renamed\.orn\.json\./)).toBeVisible({ timeout: 90_000 });
    expect(await recordCount(page, 'species')).toBe(species);
    await expectFinds(page, 'Renamed species 1', true);
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: /Undo import/ }).click();
    await expect(toasts(page).getByText(/Import undone: the data from before it is back\./).last()).toBeVisible({ timeout: 90_000 });
    await expectFinds(page, 'Renamed species 1', false);

    // 3. keep both: the file's records are added as copies
    await chooseFileViaMenu(page, renamedFile());
    await expectPreview(page);
    await dialog.getByRole('button', { name: "Keep both, the file's as a copy for all 3" }).click();
    await expect(dialog.getByRole('combobox', { name: /^Choice for species / }).first()).toHaveValue('import_as_copy');
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(toasts(page).getByText(/^Imported 3 records from renamed\.orn\.json\./).last()).toBeVisible({ timeout: 90_000 });
    expect(await recordCount(page, 'species')).toBe(species + 3);
    await expectFinds(page, 'Renamed species 1', true);
    await expectFinds(page, 'Acetophenone', true);
    // the toast's own Undo import brings the counts back
    await toasts(page).getByRole('button', { name: 'Undo import' }).last().click();
    await expect.poll(() => counts(page), { timeout: 90_000 }).toBe(original);
    await expectClean(seen);
  });

  test('dangling references are flagged, Confirm stays unavailable, and nothing is applied until they are resolved (ADV-030, INV-21)', async ({ page }) => {
    test.setTimeout(180_000);
    const seen = await watch(page);
    await openApp(page);
    const dangling = changedDemo('dangling.orn.json', (state) =>
      produce(state, (draft) => {
        delete (draft.records.species as Record<string, unknown>)['spc_dichloromethane'];
      }),
    );
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import a file' }).click()]);
    await chooser.setFiles(dangling);
    await expectPreview(page);
    const dialog = importDialog(page);
    await expect(dialog.getByRole('list', { name: 'Blockers' }).getByRole('listitem').first()).toContainText(/validation error\(s\) in the merged result/);
    await expect(dialog.getByRole('region', { name: 'Findings of the result' }).getByRole('button', { name: /^Exclude / }).first()).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Confirm' });
    await expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(await axeProblems(page, 10)).toEqual([]);
    await confirm.click({ force: true });
    await expect(dialog.getByRole('heading', { name: 'Import summary' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('region', { name: 'First run' })).toBeVisible();
    await expect(page.getByText(/^Imported /)).toHaveCount(0);
    await expectClean(seen);
  });

  test('a v6 export with a hub SMILES and duplicate names keeps both and lists what needs review (ADV-043)', async ({ page }) => {
    test.setTimeout(180_000);
    const seen = await watch(page);
    await openApp(page);
    const legacy = syntheticLegacy(12);
    (legacy.compounds[1] as { name: string }).name = (legacy.compounds[0] as { name: string }).name; // two hubs, one name
    await chooseV6(page, upload('synthetic-v6.json', JSON.stringify(legacy)));
    await expectPreview(page);
    const dialog = importDialog(page);
    const report = dialog.getByRole('region', { name: 'Legacy report' });
    await expect(report.getByText(/Not imported \(0\)/)).toBeVisible();
    await expect(report.getByText(/Needs your review \(\d+\)/)).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: /^Decision: / }).first()).toHaveValue('class');
    expect(await axeProblems(page, 10)).toEqual([]);
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(toasts(page).getByText(/^Imported \d+ records from synthetic-v6\.json\./)).toBeVisible({ timeout: 90_000 });
    // both hubs that share a name are there
    await page.keyboard.press('Control+K');
    const palette = page.getByRole('dialog', { name: 'Search' });
    await palette.getByRole('combobox').fill('Compound 0');
    await expect(palette.getByRole('status')).not.toHaveText('Search is starting');
    for (const id of ["cls_v6-c0", "cls_v6-c1"]) await expect(palette.locator(`[role="option"][data-record-id="${id}"]`)).toContainText("Compound 0");
    await page.keyboard.press('Escape');
    await expectClean(seen);
  });

  test('Cancel and Esc change nothing; the preview waits for Confirm (INV-21)', async ({ page }) => {
    test.setTimeout(180_000);
    const seen = await watch(page);
    await openApp(page);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import a file' }).click()]);
    await chooser.setFiles(demoFile());
    await expectPreview(page);
    await importDialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('region', { name: 'First run' })).toBeVisible();
    const [again] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import a file' }).click()]);
    await again.setFiles(demoFile());
    await expectPreview(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Import summary' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'First run' })).toBeVisible();
    await expect(page.getByText(/^Imported /)).toHaveCount(0);
    await expectClean(seen);
  });

  test('refusals are said in words with the file name as text; a hostile name does nothing', async ({ page }) => {
    test.setTimeout(180_000);
    const seen = await watch(page);
    let alerts = 0;
    page.on('dialog', async (native) => {
      alerts += 1;
      await native.dismiss();
    });
    await openApp(page);
    const cases: readonly { file: UploadFile | string; title: string; text: RegExp }[] = [
      { file: upload('<img src=x onerror=alert(1)>.json', 'this is not json'), title: 'This is not a JSON file or a package', text: /not valid JSON and not an ORN package/ },
      { file: upload('deep.json', `${'['.repeat(100)}${']'.repeat(100)}`), title: 'The file is nested too deeply', text: /more than 64 levels deep/ },
      { file: hugeFile(), title: 'The file is too large', text: /bigger than the app accepts/ },
      { file: upload('strange.json', '{"hello":"world"}'), title: 'The format is not recognised', text: /not an ORN dataset, an ORN package, or an export of the older app/ },
      {
        file: upload('future.orn.json', readFileSync(resolve(process.cwd(), 'data/seed/demo.orn.json'), 'utf8').replace(/"schemaVersion":\s*\d+/, '"schemaVersion": 999')),
        title: 'Saved by a newer version of the app',
        text: /saved by a newer version of the app/,
      },
    ];
    for (const { file, title, text } of cases) {
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import a file' }).click()]);
      await chooser.setFiles(file);
      const dialog = page.getByRole('dialog', { name: 'The file was not imported' });
      await expect(dialog).toBeVisible({ timeout: 90_000 });
      await expect(dialog.getByRole('heading', { name: title })).toBeVisible();
      await expect(dialog.getByRole('alert')).toContainText(text);
      const shownFileName = typeof file === 'string' ? 'huge.json' : file.name;
      await expect(dialog.getByText(shownFileName.slice(0, 40), { exact: false }).first()).toBeVisible();
      expect(await dialog.locator('img, script, iframe').count()).toBe(0);
      expect(await axeProblems(page, 10)).toEqual([]);
      await dialog.getByRole('button', { name: 'Dismiss' }).click();
      await expect(dialog).toBeHidden();
    }
    expect(alerts, 'a hostile name must never run').toBe(0);
    await expect(page.getByRole('region', { name: 'First run' })).toBeVisible();
    await expectClean(seen);
  });
});
