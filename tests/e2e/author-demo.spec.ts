/**
 * Authoring the demo's reactions from scratch through the Studio screen (step 6.9, Part 2). The data set is the demo WITHOUT its reactions
 * (and what points at them, and three records made "from scratch"); each reaction of the COVERAGE SET (PROGRESS, "Step 6.9, part 1";
 * `node scripts/demo-coverage.mjs set`) is entered by `author-kit.ts` and compared with the demo reaction by `reaction-compare.ts`.
 * A difference that is not a known Gate D finding fails the test. Chromium, Firefox and WebKit; two reactions also on the phones.
 */
import { devices } from '@playwright/test';
import { test } from './fixtures';
import { runAuthoring } from './author-run';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
/** From `node scripts/demo-coverage.mjs set` (the family-level coverage set); the generic reaction first, its instance after it. */
export const COVERAGE_SET = [
  'rxn_alcohol1-to-aldehyde-pcc',
  'rxn_ethanol-to-ethanal-pcc',
  'rxn_ethanol-conc-h2so4',
  'rxn_ethanal-aldol',
  'rxn_benzene-nitration-draft',
  'rxn_benzene-friedel-crafts-acylation',
  'rxn_propene-hbr-peroxide',
  'rxn_cyclohexanone-oxime-beckmann',
  'rxn_propene-hbr',
  'rxn_ethene-hydration',
  'rxn_ethanol-to-ethanal-dichromate',
  'rxn_but-2-yne-lindlar',
  'rxn_haloform-ethanol',
  'rxn_methylmgbr-ethanal',
] as const;

const only = process.env['AUTHOR_ONLY'];
/** The reaction whose card is photographed (variants, two outcomes, byproducts). */
const CARD_REACTION = 'rxn_ethanol-conc-h2so4';

for (const id of COVERAGE_SET) {
  if (only !== undefined && !only.split(',').includes(id)) continue;
  test(`authors ${id} from scratch and it equals the demo reaction`, async ({ page, browserName }) => {
    test.setTimeout(600_000);
    // the screenshot of an authored reaction's card is taken once, in Chromium
    await runAuthoring(page, id, id === CARD_REACTION && browserName === 'chromium' ? { card: `author-demo-${id.replace(/^rxn_/, '')}-1280x800.png` } : {});
  });
}

/** Two reactions on the phones: one with condition variants and several outcomes, one with two stages (a workup). */
const PHONE_REACTIONS = ['rxn_ethanol-conc-h2so4', 'rxn_methylmgbr-ethanal'] as const;
for (const [name, profile, engine] of [['Pixel 7', PIXEL, 'chromium'], ['iPhone 14', IPHONE, 'webkit']] as const) {
  test.describe(`phone: ${name}`, () => {
    test.use({ ...profile });
    for (const id of PHONE_REACTIONS) {
      test(`authors ${id} from scratch on the ${name} and it equals the demo reaction`, async ({ page, browserName }) => {
        test.skip(browserName !== engine, `the ${name} profile is ${engine}`);
        test.setTimeout(600_000);
        await runAuthoring(page, id, { phone: true });
      });
    }
  });
}
