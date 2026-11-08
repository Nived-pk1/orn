/**
 * "Needs checking" in the STUDY edition (decision 8.4a, Part D): a reaction with status review_required shows an orange dot named "Needs checking" on
 * its Reactions card, on its card of the family page, and in the inspector with the line "This has an open question...". The fixture is the demo with
 * the PCC reaction (anchored to Alcohols) also marked review_required; the demo already has one such reaction (Beckmann, unanchored, so it is only
 * in the Reactions list). Screenshots: study-review-*.png (git-ignored).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from './fixtures';
import { STUDY_REVIEW_SENTENCE_FOR_TESTS } from './study-review-words';
import { exampleCard, expectClean, watch, type UploadFile } from './kit';
import { shotsDir } from './editor-kit';
import { importOwnData, openStudy, STUDY } from './study-kit';

test.use({ baseURL: STUDY, actionTimeout: 60_000 });

const PCC = 'rxn_ethanol-to-ethanal-pcc';
const PCC_NAME = 'Ethanol → ethanal (PCC)';
const BECKMANN_NAME = 'Beckmann rearrangement of cyclohexanone oxime';

function demoWithPccNeedsChecking(): UploadFile {
  const doc = JSON.parse(readFileSync(resolve(process.cwd(), 'data/seed/demo.orn.json'), 'utf8')) as { records: { reaction: { id: string; review: { status: string; reasons: string[] } }[] } };
  const reaction = doc.records.reaction.find((one) => one.id === PCC);
  if (reaction === undefined) throw new Error('the demo has no PCC reaction');
  reaction.review = { ...reaction.review, status: 'review_required', reasons: ['A test fixture: this one needs checking.'] };
  return { name: 'demo-pcc-needs-checking.orn.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc), 'utf8') };
}

test('Study: Needs checking on the Reactions card, the family page card and the inspector', async ({ page }) => {
  test.setTimeout(300_000);
  const seen = await watch(page, STUDY);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openStudy(page);
  await importOwnData(page, demoWithPccNeedsChecking());

  // 1. the Reactions card
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Reactions', exact: true }).click();
  const beckmann = page.getByRole('article').filter({ has: page.getByRole('heading', { level: 4, name: BECKMANN_NAME }) }).first();
  await expect(beckmann).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: resolve(shotsDir(), 'study-review-reactions-card-1280x800.png') });
  await expect(beckmann.getByRole('img', { name: 'Needs checking' }), 'the Reactions card shows the orange dot').toBeVisible();

  // 2. the inspector
  await beckmann.click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByRole('img', { name: 'Needs checking' }), 'the inspector shows the dot').toBeVisible();
  await expect(inspector.getByText(STUDY_REVIEW_SENTENCE_FOR_TESTS)).toBeVisible();
  await page.screenshot({ path: resolve(shotsDir(), 'study-review-inspector-1280x800.png') });

  // 3. the card on the family page
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Map' }).click();
  await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
  const family = page.getByRole('region', { name: 'Family page: Alcohols' });
  await expect(family).toBeVisible();
  await page.getByRole('button', { name: /^Aldehydes\s*2\s*reactions$/ }).last().click();
  const card = await exampleCard(page, PCC_NAME);
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByRole('img', { name: 'Needs checking' }), 'the family page card shows the orange dot').toBeVisible();
  await page.screenshot({ path: resolve(shotsDir(), 'study-review-family-card-1280x800.png') });
  await expectClean(seen);
});
