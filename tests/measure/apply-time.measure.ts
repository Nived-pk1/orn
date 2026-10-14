/**
 * Step 5.11b, part 1e (informal; run once, alone; REPORTED): the time from Confirm to "Imported" of the design-tier dense file in
 * Chromium, uploaded by path, against the PRODUCTION build on port 4173 (`npx vite build && npx vite preview --port 4173`).
 * Run: `npx tsx tests/measure/apply-time.measure.ts [runs]`. Each run is a new browser context (empty storage).
 */
import { chromium } from '@playwright/test';
import { chooseFile, expectPreview, generatedFile, openApp, ORIGIN } from '../e2e/kit';

async function main(): Promise<void> {
  const runs = Number(process.argv[2] ?? '3');
  const browser = await chromium.launch();
  console.log(`Chromium ${browser.version()}, production build, headless, ${process.platform}`);
  const file = generatedFile('design', 'dense');
  console.log(`file: ${file.name}, ${(file.buffer.length / 1048576).toFixed(1)} MB`);
  const times: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const context = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await openApp(page);
    await chooseFile(page, file);
    await expectPreview(page, 300_000);
    const started = Date.now();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await page.getByText(/^Imported \d+ records from/).first().waitFor({ timeout: 300_000 });
    times.push(Date.now() - started);
    console.log(`run ${i + 1}: Confirm to Imported ${times[i]} ms`);
    await context.close();
  }
  console.log(`mean ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(0)} ms, min ${Math.min(...times)}, max ${Math.max(...times)}`);
  await browser.close();
}

void main();
