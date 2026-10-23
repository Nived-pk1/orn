/**
 * Gate D: ALL 27 demo reactions authored from scratch through the Studio screen (step 6.9, Part 2), Chromium only, in the separate Playwright
 * project "gate-d" that the regular full run does NOT include (`npm run e2e:gate-d`). The same run as the coverage set (`author-run.ts`):
 * each reaction in a fresh app with the authoring data set; every difference from the demo is printed, and an unknown one fails the test.
 */
import { test } from './fixtures';
import { demoRecords } from './author-data';
import { runAuthoring } from './author-run';

test.use({ actionTimeout: 60_000 });

for (const [id, record] of Object.entries(demoRecords()['reaction'] ?? {})) {
  test(`gate D: ${id} (${String(record['name'])}) authored from scratch equals the demo`, async ({ page }) => {
    test.setTimeout(600_000);
    await runAuthoring(page, id);
  });
}
