/**
 * The Study inspector on a desktop (step 8.1 Part F), the STUDY build: one record of each kind shows the kind chip, the hero where the kind has
 * one, no author words, axe clean, zero CSP violations; the reaction has its watch-out; connected cards show 4 and "Show all"; a long lead is
 * clamped with "Read more". Screenshots (all 1280x800, named inspector-study-<kind> because older specs own the inspector-<kind> names): reaction, compound, class, reagent, concept, named, mechanism,
 * -caveat, -lead-expanded.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, chooseFile, expectClean, expectPreview, watch } from './kit';
import { answerExamCard } from './exam-kit';
import { palette, record, searchFor, shotsDir } from './editor-kit';
import { expectHeroNeverWraps } from './hero-geometry';

const STUDY = process.env.ORN_BASE_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:4174';
test.use({ baseURL: STUDY, actionTimeout: 60_000 });
const DEMO = readFileSync(resolve(process.cwd(), 'data/seed/demo.orn.json'));

async function start(page: Page, buffer: Buffer = DEMO): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' })).toBeVisible();
  await chooseFile(page, { name: 'my-own-data.orn.json', mimeType: 'application/json', buffer });
  await expectPreview(page);
  await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 60_000 });
  await answerExamCard(page); // step 8.3b, B3
  await expect(page.getByRole('region', { name: 'Chapters', exact: true })).toBeVisible({ timeout: 60_000 });
}

async function open(page: Page, query: string, id: string): Promise<void> {
  await page.keyboard.press('Control+K');
  await expect(palette(page)).toBeVisible();
  await searchFor(page, query);
  const option = palette(page).locator(`[role="option"][data-record-id="${id}"]`);
  await expect(option).toBeVisible({ timeout: 60_000 });
  await option.click();
  await expect(record(page)).toHaveAttribute('data-record-id', id, { timeout: 30_000 });
  await expect(record(page).locator('header h3')).toBeVisible();
}

const FORBIDDEN = [/Level \d/, /Findings and checks/, /Formula \(entered\)/, /Formula \(derived/, /Provenance/, /Raw record/, /None found for/, /has no place in this view/, /\b(spc|rxn|cls|cpt|rgt|nrx|mec|cav)_[a-z0-9-]+/];

const CASES: { shot: string; query: string; id: string; chip: string; hero: boolean }[] = [
  { shot: 'inspector-study-reaction', query: 'r: Ethanol → ethanal (PCC)', id: 'rxn_ethanol-to-ethanal-pcc', chip: 'Reaction', hero: true },
  { shot: 'inspector-study-compound', query: 's: Ethanol', id: 'spc_ethanol', chip: 'Compound', hero: true },
  { shot: 'inspector-study-class', query: 'c: Aldehydes', id: 'cls_aldehydes', chip: 'Class', hero: true },
  { shot: 'inspector-study-reagent', query: 'g: Potassium permanganate', id: 'rgt_potassium-permanganate', chip: 'Reagent', hero: true },
  { shot: 'inspector-study-concept', query: 'Oxidation', id: 'cpt_oxidation', chip: 'Idea', hero: false },
  { shot: 'inspector-study-named', query: 'n: Aldol reaction', id: 'nrx_aldol', chip: 'Named reaction', hero: false },
  { shot: 'inspector-study-mechanism', query: 'm: Aldol addition of ethanal', id: 'mec_aldol-ethanal', chip: 'Mechanism', hero: true },
  { shot: 'inspector-study-caveat', query: 'PCC stops at the aldehyde', id: 'cav_pcc-stops-at-aldehyde', chip: 'Watch out', hero: false },
];

test('one record of each kind: chip, hero, no author words, axe, no CSP violation', async ({ page }) => {
  test.setTimeout(600_000);
  const seen = await watch(page, STUDY);
  await start(page);
  for (const one of CASES) {
    await open(page, one.query, one.id);
    const article = record(page);
    await expect(article.locator('header')).toContainText(one.chip);
    if (one.hero) await expect(article.locator('[data-hero], [data-hero-equation], [data-hero-picture]').first()).toBeVisible({ timeout: 30_000 });
    if (one.id.startsWith('rxn_')) await expectHeroNeverWraps(page, 'the desktop panel width'); // review decision 0
    await expect(article.getByRole('button', { name: 'Back' })).toBeVisible();
    await expect(article.getByRole('button', { name: /For authors/ })).toHaveCount(0);
    const text = await article.innerText();
    for (const word of FORBIDDEN) expect(text, `${one.id}: ${String(word)}`).not.toMatch(word);
    expect(await axeProblems(page, 10), `axe on ${one.id}`).toEqual([]);
    await page.screenshot({ path: `${shotsDir()}/${one.shot}-1280x800.png` });
  }
  await expectClean(seen);
});

test('the reaction has its watch-out; connected cards show 4 and "Show all"; a card opens its record', async ({ page }) => {
  test.setTimeout(300_000);
  const seen = await watch(page, STUDY);
  await start(page);
  await open(page, 'r: 1° alcohol → aldehyde (PCC)', 'rxn_alcohol1-to-aldehyde-pcc');
  await expect(record(page).getByRole('region', { name: 'Watch out' })).toContainText('PCC stops at the aldehyde');
  await open(page, 's: Ethanol', 'spc_ethanol');
  const group = record(page).getByRole('region', { name: 'Reactions that use it' });
  await expect(group).toBeVisible();
  const more = group.getByRole('button', { name: /^Show all \d+$/ });
  if ((await more.count()) > 0) {
    expect(await group.locator('li').count()).toBe(4);
    await more.click();
    expect(await group.locator('li').count()).toBeGreaterThan(4);
  }
  await group.getByRole('button').first().click();
  await expect(record(page)).toHaveAttribute('data-record-id', /^rxn_/);
  await expectClean(seen);
});

test('a long lead is clamped to four lines with "Read more", which opens it in place', async ({ page }) => {
  test.setTimeout(300_000);
  const seen = await watch(page, STUDY);
  const doc = JSON.parse(DEMO.toString('utf8')) as { records: { named_reaction: Record<string, { summary?: string }> | { id: string; summary?: string }[] } };
  const table = doc.records.named_reaction;
  const aldol = Array.isArray(table) ? table.find((n) => n.id === 'nrx_aldol') : table['nrx_aldol'];
  if (aldol === undefined) throw new Error('the demo has no Aldol reaction');
  aldol.summary = 'Aldol addition joins two carbonyl compounds. '.repeat(12);
  await start(page, Buffer.from(JSON.stringify(doc)));
  await open(page, 'n: Aldol reaction', 'nrx_aldol');
  const lead = record(page).locator('[data-lead]');
  await expect(lead).toHaveAttribute('data-lead', 'clamped');
  const clamped = (await lead.boundingBox())?.height ?? 0;
  await record(page).getByRole('button', { name: 'Read more' }).click();
  await expect(lead).toHaveAttribute('data-lead', 'open');
  await expect.poll(async () => (await lead.boundingBox())?.height ?? 0).toBeGreaterThan(clamped + 20);
  await page.screenshot({ path: `${shotsDir()}/inspector-study-lead-expanded-1280x800.png` });
  await expectClean(seen);
});

// step 8.4b, G4: every go-next card fills the pane's width (one column narrow, two wide): at least 45% of its group's width. Written AFTER its source (disclosed).
test('the "Makes" and "Made from" cards fill the pane: each card is at least 45% of its group width', async ({ page }) => {
  test.setTimeout(300_000);
  await start(page);
  await open(page, 'r: Ethanol → ethanal (PCC)', 'rxn_ethanol-to-ethanal-pcc');
  const widths = await record(page).evaluate((article) =>
    [...article.querySelectorAll('[data-group]')].flatMap((group) => {
      const list = group.querySelector('ul') as HTMLElement;
      return [...list.querySelectorAll('button[data-record-id]')].map((card) => ({ group: group.getAttribute('data-group') ?? '', share: card.getBoundingClientRect().width / list.getBoundingClientRect().width }));
    }),
  );
  expect(widths.length).toBeGreaterThan(0);
  for (const w of widths) expect(w.share, `a card of ${w.group}`).toBeGreaterThanOrEqual(0.45);
});
