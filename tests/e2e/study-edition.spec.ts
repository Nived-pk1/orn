/**
 * The STUDY edition (studio step E6, ADR-041), PRODUCTION build, every engine. This spec runs against the Study build: a second preview
 * server (port 4174, `dist-study-e2e`, built over a published-dataset FIXTURE the config makes with `npm run publish:dataset`'s own script
 * from data/fixtures/schema/v2/minimal-valid.orn.json); every other spec runs against the Studio build (port 4173). With ORN_BASE_URL set it
 * checks a live Study site instead (no fixture there: the published-dataset tests skip).
 *  (1) desktop: no Workbench, Edit, New or Drafts anywhere (navigation, inspector, the palette's commands, the File menu, no Undo / Redo
 *      buttons or keys), the page title and the header have no "Studio"; every study view is used (the family page, the inspector on a species
 *      and a mechanism, the palette, the exam scope, the Structures setting, the import and the export screens) and NO request is made for an
 *      editor chunk; zero policy violations; axe.
 *  (2) the published dataset (fixture): the first run says "Load the study dataset" and loads it; a returning browser with the same sha256 is
 *      not asked; a browser whose data is its own gets the update notice: "Later" hides it until the next visit, "Load it" replaces the data
 *      (the existing replace import) and "Undo import" restores them; a browser whose remembered sha256 differs is asked.
 *  (3) phone (Pixel 7 in Chromium, iPhone 14 in WebKit): More has File and Undo import and no Workbench, New, Undo, Redo or Drafts.
 * Screenshots: study-desktop-1280x800.png, study-phone-pixel7.png, study-update-notice-1280x800.png (git-ignored).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, chooseFile, expectClean, expectPreview, generatedFileWithAnchors, watch, type UploadFile } from './kit';
import { palette, pane, record, searchFor, shotsDir, showRecord } from './editor-kit';
import { makePng } from './png-kit';

const REMOTE = process.env.ORN_BASE_URL !== undefined;
const STUDY = process.env.ORN_BASE_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:4174';
test.use({ baseURL: STUDY });

const TITLE = 'Organic Reaction Navigator';
const NOTICE = 'A newer version of the study dataset is available. Load it (this replaces the data in this browser; export a backup first if you imported your own data).';
const DEMO_FILE = { name: 'my-own-data.orn.json', mimeType: 'application/json', buffer: readFileSync(resolve(process.cwd(), 'data/seed/demo.orn.json')) };
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];

/** The chunk files of the STUDIO build that hold editor modules (its build report), minus any file the Study build also has: none may be requested. */
function editorChunkNames(): string[] {
  const studio = resolve(process.cwd(), 'build-report', 'studio.json');
  if (!existsSync(studio)) return [];
  const modules = (JSON.parse(readFileSync(resolve(process.cwd(), 'scripts', 'editor-modules.json'), 'utf8')) as { modules: string[] }).modules;
  const isEditor = (id: string): boolean => modules.some((entry) => (entry.endsWith('/') ? id.startsWith(entry) : id === entry));
  const report = JSON.parse(readFileSync(studio, 'utf8')) as { chunks: { file: string; modules: string[] }[] };
  return report.chunks.filter((chunk) => chunk.modules.some(isEditor)).map((chunk) => chunk.file.split('/').pop() as string);
}

async function openStudy(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByText('Starting up', { exact: true })).toHaveCount(0);
}

async function importOwnData(page: Page, file: UploadFile = DEMO_FILE): Promise<void> {
  await chooseFile(page, file);
  await expectPreview(page);
  await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 60_000 });
}

const recordTotal = async (page: Page): Promise<number> => {
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Dataset' }).click();
  const items = await page.getByRole('list', { name: 'Record counts' }).getByRole('listitem').allTextContents();
  return items.reduce((sum, text) => sum + Number(/(\d+)$/.exec(text)?.[1] ?? 0), 0);
};

/** The demo with ONE picture attached to a concept, its bytes inside the file (what a Studio export with the pictures embedded holds; step 7.1a). */
function demoWithConceptPicture(conceptId: string, alt: string): UploadFile {
  const doc = JSON.parse(readFileSync(resolve(process.cwd(), 'data/seed/demo.orn.json'), 'utf8')) as { records: Record<string, unknown[]>; embeddedAssets?: unknown[] };
  const bytes = makePng(96, 64);
  const now = '2026-10-24T10:00:00.000Z';
  doc.records.asset = [
    ...(doc.records.asset ?? []),
    {
      id: 'ast_study-concept-pic',
      kind: 'asset',
      mediaType: 'image/png',
      byteSize: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      altText: alt,
      caption: 'Drawn by the *author*.',
      assetRole: 'reference_image',
      attachedTo: [{ ref: { kind: 'concept', id: conceptId } }],
      tags: [],
      citations: [],
      provenance: { origin: 'user', createdAt: now, updatedAt: now },
      review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] },
    },
  ];
  doc.embeddedAssets = [{ assetId: 'ast_study-concept-pic', base64: bytes.toString('base64') }];
  return { name: 'demo-with-concept-picture.orn.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc), 'utf8') };
}

/** Writes the "last loaded study dataset" entry straight into IndexedDB (what a browser that loaded another version would hold). */
const rememberSha = (page: Page, sha256: string): Promise<void> =>
  page.evaluate(
    (sha) =>
      new Promise<void>((resolveRow, reject) => {
        const open = indexedDB.open('orn');
        open.onerror = () => reject(new Error('cannot open the database'));
        open.onsuccess = () => {
          const db = open.result;
          const put = db.transaction('uiState', 'readwrite').objectStore('uiState').put({ key: 'studyDataset', value: { sha256: sha } });
          put.onsuccess = () => {
            db.close();
            resolveRow();
          };
          put.onerror = () => reject(new Error('cannot write the row'));
        };
      }),
    sha256,
  );

test.describe('desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test('no editing anywhere, every study view works, and no editor chunk is ever requested', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page, STUDY);
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('.js')) scripts.push(request.url().split('/').pop() as string);
    });
    await openStudy(page);
    await expect(page).toHaveTitle(TITLE);
    await expect(page.locator('[data-edition-marker]')).toHaveCount(0);
    await importOwnData(page);
    await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible();

    // navigation, header and top bar: no Workbench, no Undo / Redo, no Studio word
    const modes = page.getByRole('navigation', { name: 'Modes' });
    await expect(modes.getByRole('button', { name: 'Navigator' })).toBeVisible();
    await expect(modes.getByText('Workbench')).toHaveCount(0);
    const banner = page.locator('header');
    await expect(banner.getByRole('button', { name: /^(Undo|Redo)/ })).toHaveCount(0);
    await expect(banner.getByText('Studio')).toHaveCount(0);
    await page.keyboard.press('Control+Z');
    await expect(page.getByText(/Nothing to undo|Undo failed/)).toHaveCount(0);

    // the File menu: import and export and Undo import stay; no Drafts
    await banner.getByRole('button', { name: 'File' }).click();
    await expect(page.getByRole('menuitem', { name: 'Undo import' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^Drafts/ })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // the family page
    await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
    await expect(page.getByRole('region', { name: 'Family page: Alcohols' })).toBeVisible();
    await expect(page.getByRole('article').first()).toBeVisible();

    // the inspector on a species and on a mechanism: no Edit button
    await showRecord(page, 's', 'ethanol', 'spc_ethanol');
    await expect(pane(page).getByRole('button', { name: /^Edit/ })).toHaveCount(0);
    await showRecord(page, 'm', 'SN2 substitution of a haloalkane', 'mec_sn2-haloalkane');
    await expect(pane(page).getByRole('button', { name: /^Edit/ })).toHaveCount(0);
    await expect(record(page)).toBeVisible();

    // the palette: its commands include none that edits or creates
    await page.keyboard.press('Control+K');
    await expect(palette(page)).toBeVisible();
    await palette(page).getByRole('combobox').fill('>');
    await expect.poll(() => palette(page).getByRole('option').count()).toBeGreaterThan(3);
    const titles = await palette(page).getByRole('option').allTextContents();
    expect(titles.filter((text) => /^(New |Edit the selected|Workbench|Open the drafts)/.test(text))).toEqual([]);
    await page.keyboard.press('Escape');

    // the exam scope, the Structures setting, the export screen, the import screen
    const scope = page.getByRole('combobox', { name: /Exam scope/ });
    await expect(scope).toBeVisible();
    await page.getByRole('radiogroup', { name: 'Structures' }).getByRole('radio', { name: 'Condensed' }).check({ force: true });
    await banner.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: /Export\.\.\./ }).click();
    await expect(page.getByRole('dialog', { name: 'Export your data' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Export your data' })).toBeHidden();
    await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Dataset' }).click();
    await expect(page.getByRole('button', { name: /^Replace with the (demo|study) dataset$/ })).toBeVisible();

    expect(await axeProblems(page)).toEqual([]);
    await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Navigator' }).click();
    await expect(page.getByRole('region', { name: 'Family page: Alcohols' })).toBeVisible(); // the family page is still the open one
    await showRecord(page, 's', 'ethanol', 'spc_ethanol');
    await page.screenshot({ path: resolve(shotsDir(), 'study-desktop-1280x800.png') });

    // the network: nothing that is an editor chunk was requested, and every script asked for was served by this build
    const editors = editorChunkNames();
    expect(scripts.filter((name) => editors.includes(name) || /^(editor-host|editor-session)-/.test(name)), 'editor chunks requested').toEqual([]);
    expect(scripts.length, 'scripts were requested').toBeGreaterThan(3);
    await expectClean(seen);
  });

  test.describe('the published dataset (a fixture; not on a live site)', () => {
    test.skip(REMOTE, 'the live Study site has no published dataset yet');

    test('first run: "Load the study dataset" loads it; the same browser is not asked again; a different remembered sha256 is', async ({ page }) => {
      test.setTimeout(240_000);
      const seen = await watch(page, STUDY);
      await openStudy(page);
      await expect(page.getByRole('region', { name: 'First run' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Load demo dataset' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Load the study dataset' }).click();
      await expect(page.getByText(/^Imported \d+ records from dataset\.orn\.json\./)).toBeVisible({ timeout: 60_000 });
      expect(await recordTotal(page)).toBeGreaterThan(0);
      await expect(page.getByText(NOTICE)).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
      await expect(page.getByText('Starting up', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('navigation', { name: 'Modes' })).toBeVisible();
      await expect(page.getByText(NOTICE)).toHaveCount(0); // the sha256 was remembered
      await rememberSha(page, 'c'.repeat(64));
      await page.reload();
      await expect(page.getByText(NOTICE)).toBeVisible({ timeout: 30_000 }); // another version was loaded before: asked
      await expectClean(seen);
    });

    test('the update notice: Later hides it until the next visit; Load it replaces the data and Undo import brings them back', async ({ page, browserName }) => {
      test.setTimeout(300_000);
      const seen = await watch(page, STUDY);
      await openStudy(page);
      await importOwnData(page); // this browser holds its own data and never loaded the study dataset
      const own = await recordTotal(page);
      const notice = page.getByRole('region', { name: 'Study dataset update' });
      await expect(notice.getByText(NOTICE)).toBeVisible();
      // a WebKit screenshot injects a style the kit forgives only until the next load (as in mechanism-pictures.spec): Chromium takes it
      if (browserName === 'chromium') await page.screenshot({ path: resolve(shotsDir(), 'study-update-notice-1280x800.png') });
      await notice.getByRole('button', { name: 'Later' }).click();
      await expect(notice).toBeHidden();
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Study dataset update' }).getByText(NOTICE)).toBeVisible({ timeout: 30_000 }); // asked again at the next visit
      await page.getByRole('region', { name: 'Study dataset update' }).getByRole('button', { name: 'Load it' }).click();
      await expect(page.getByText(/^Imported \d+ records from dataset\.orn\.json\./)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole('region', { name: 'Study dataset update' })).toHaveCount(0);
      const replaced = await recordTotal(page);
      expect(replaced).not.toBe(own);
      await page.getByRole('region', { name: 'Replace the data' }).getByRole('button', { name: 'Undo import' }).click();
      await expect(page.getByText('Import undone: the data from before it is back.')).toBeVisible({ timeout: 60_000 });
      await expect.poll(() => recordTotal(page)).toBe(own);
      expect(await axeProblems(page)).toEqual([]);
      await expectClean(seen);
    });

    test('Keep my data: this published version is not asked again, after a reload either (H1)', async ({ page, browserName }) => {
      test.setTimeout(300_000);
      const seen = await watch(page, STUDY);
      await openStudy(page);
      await importOwnData(page);
      const notice = page.getByRole('region', { name: 'Study dataset update' });
      await expect(notice.getByText(NOTICE)).toBeVisible();
      await expect(notice.getByRole('button', { name: 'Later' })).toBeVisible();
      if (browserName === 'chromium') await page.screenshot({ path: resolve(shotsDir(), 'study-update-notice-keep-1280x800.png') });
      await notice.getByRole('button', { name: 'Keep my data' }).click();
      await expect(notice).toBeHidden();
      // the decision is written to IndexedDB in the background: wait for the row before the reload (a reload is not a flush)
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              new Promise<boolean>((resolve) => {
                const open = indexedDB.open('orn');
                open.onerror = () => resolve(false);
                open.onsuccess = () => {
                  const db = open.result;
                  if (!db.objectStoreNames.contains('uiState')) return resolve(false);
                  const row = db.transaction('uiState', 'readonly').objectStore('uiState').get('studyDatasetDeclined');
                  row.onsuccess = () => {
                    db.close();
                    resolve(row.result !== undefined);
                  };
                  row.onerror = () => resolve(false);
                };
              }),
          ),
        )
        .toBe(true);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
      await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('region', { name: 'Study dataset update' })).toHaveCount(0);
      await expectClean(seen);
    });
  });

  test('a concept with a picture shows it under the header, full size, and no editing control exists (step 7.1a)', async ({ page }) => {
    test.setTimeout(300_000);
    const ALT = 'Hyperconjugation drawn by the author';
    const seen = await watch(page, STUDY);
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('.js')) scripts.push(request.url().split('/').pop() as string);
    });
    await openStudy(page);
    await importOwnData(page, demoWithConceptPicture('cpt_carbocation-stability', ALT));
    await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible();
    await page.keyboard.press('Control+K');
    await expect(palette(page)).toBeVisible();
    await searchFor(page, 'Carbocation stability');
    await palette(page).locator('[role="option"][data-record-id="cpt_carbocation-stability"]').click();
    await expect(record(page)).toHaveAttribute('data-record-id', 'cpt_carbocation-stability');
    const region = pane(page).getByRole('region', { name: 'Pictures of this concept' });
    const img = region.getByRole('img', { name: ALT });
    await expect(img).toBeVisible({ timeout: 60_000 });
    await expect(img).toHaveAttribute('src', /^blob:/);
    await expect(region.locator('figcaption em')).toHaveText('author');
    await region.getByRole('button', { name: 'Open full size' }).click();
    await expect(page.getByRole('dialog', { name: ALT })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: ALT })).toBeHidden();
    for (const name of ['Edit', 'Add picture', 'Delete...', /^Remove picture/]) await expect(page.getByRole('button', { name })).toHaveCount(0);
    const editors = editorChunkNames();
    expect(scripts.filter((name) => editors.includes(name) || /^(editor-host|editor-session)-/.test(name)), 'editor chunks requested').toEqual([]);
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });

  test('Reactions works in Study: filters, Cards and Compact, a card opens the inspector, no editing control exists and no editor chunk is requested (step 7.1b)', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page, STUDY);
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('.js')) scripts.push(request.url().split('/').pop() as string);
    });
    await openStudy(page);
    await importOwnData(page);
    await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible();
    await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Reactions' }).click();
    const view = page.getByRole('region', { name: 'Reactions', exact: true });
    await expect(page.getByRole('heading', { name: 'Reactions', exact: true })).toBeVisible();
    await expect(view.locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
    const all = await view.locator('[data-reaction-id]').count();
    await view.getByRole('button', { name: /^Type/ }).click();
    await view.getByRole('group', { name: 'Type filter' }).getByRole('checkbox', { name: /^Oxidation/ }).check();
    await expect(view.getByRole('list', { name: 'Chosen filters' }).getByRole('listitem')).toHaveCount(1);
    expect(await view.locator('[data-reaction-id]').count()).toBeLessThan(all);
    await page.keyboard.press('Escape');
    await view.getByRole('radio', { name: 'Compact' }).check();
    await expect(view.locator('article[data-reaction-id]')).toHaveCount(0);
    await view.getByRole('radio', { name: 'Cards' }).check();
    const card = view.locator('article[data-reaction-id]').first();
    const id = await card.getAttribute('data-reaction-id');
    await card.getByRole('button').first().click();
    await expect(record(page)).toHaveAttribute('data-record-id', id as string);
    for (const name of ['Edit', 'Add picture', 'Delete...', 'Duplicate']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    const editors = editorChunkNames();
    expect(scripts.filter((name) => editors.includes(name) || /^(editor-host|editor-session)-/.test(name)), 'editor chunks requested').toEqual([]);
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });

  test('a small own dataset imports and works as before in Study (import and export of the visitor\'s own data stay)', async ({ page }) => {
    const seen = await watch(page, STUDY);
    await openStudy(page);
    await importOwnData(page, generatedFileWithAnchors('tiny', 'chain'));
    await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible();
    await expectClean(seen);
  });
});

for (const [label, profile, engine, shot] of [
  ['Pixel 7 (Chromium)', PIXEL, 'chromium', 'study-phone-pixel7.png'],
  ['iPhone 14 (WebKit)', IPHONE, 'webkit', undefined],
] as const) {
  test.describe(`phone: ${label}`, () => {
    test.use({ ...profile, baseURL: STUDY });

    test('More has File and Undo import; no Workbench, New, Undo, Redo or Drafts; no "Studio"', async ({ page, browserName }) => {
      test.skip(browserName !== engine, `the ${label} profile is ${engine}`);
      test.setTimeout(240_000);
      const seen = await watch(page, STUDY);
      await openStudy(page);
      await expect(page.getByRole('region', { name: 'First run' })).toBeVisible();
      await expect(page.locator('header').getByText('Studio')).toHaveCount(0);
      await importOwnData(page, generatedFileWithAnchors('tiny', 'chain'));
      await page.getByRole('button', { name: 'More' }).click();
      const more = page.getByRole('dialog', { name: 'More' });
      await expect(more.getByRole('button', { name: 'Undo import' })).toBeVisible();
      await expect(more.getByRole('button', { name: /^Import a file/ })).toBeVisible();
      await expect(more.getByText('Workbench')).toHaveCount(0);
      await expect(more.getByRole('button', { name: /^New / })).toHaveCount(0);
      await expect(more.getByRole('button', { name: /^(Undo|Redo)$/ })).toHaveCount(0);
      await expect(more.getByRole('button', { name: /^Drafts/ })).toHaveCount(0);
      if (shot !== undefined) await page.screenshot({ path: resolve(shotsDir(), shot) });
      await expectClean(seen);
    });
  });
}
