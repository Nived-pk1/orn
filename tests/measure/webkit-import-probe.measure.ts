/**
 * Step 5.10b, Part 1d diagnosis (informal; run alone; REPORTED): the design-tier import in WebKit. Imports the 16.9 MB file (uploaded by
 * path: Playwright's WebKit stalls on a buffer that size) in a persistent context, confirms, and logs what the page shows every 15 s,
 * with a screenshot, to the file named by the first argument (written synchronously: the console of a stalled run is buffered).
 *   npx tsx tests/measure/webkit-import-probe.measure.ts <log file> <dataset file> <screenshot folder>
 */
import { appendFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webkit } from '@playwright/test';

async function main(): Promise<void> {
  const [log = 'wk-probe.log', dataset = '', shots = '.'] = process.argv.slice(2);
  const say = (line: string): void => appendFileSync(log, `${line}\n`);
  const dir = mkdtempSync(join(tmpdir(), 'orn-wk-'));
  const context = await webkit.launchPersistentContext(dir, { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 800 } });
  const page = context.pages()[0] ?? (await context.newPage());
  page.on('console', (m) => say(`console ${m.type()}: ${m.text().slice(0, 300)}`));
  page.on('pageerror', (e) => say(`pageerror: ${String(e).slice(0, 300)}`));
  page.on('crash', () => say('PAGE CRASHED'));
  await page.goto('/');
  await page.getByText('Starting up', { exact: true }).waitFor({ state: 'detached', timeout: 120_000 });
  const t0 = Date.now();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import a file' }).click()]);
  await chooser.setFiles(dataset);
  say('file set');
  let confirmed = false;
  for (let i = 0; i < 80; i += 1) {
    await page.waitForTimeout(15_000);
    const text = await Promise.race([page.evaluate(`(document.body.innerText || '').replace(/[ \\n\\t]+/g, ' ').slice(-240)`) as Promise<string>, new Promise<string>((r) => setTimeout(() => r('PAGE DID NOT ANSWER IN 10 s'), 10_000))]);
    say(`+${Math.round((Date.now() - t0) / 1000)} s: ${text}`);
    await page.screenshot({ path: join(shots, `wk-${i}.png`), timeout: 10_000 }).catch(() => say('screenshot failed'));
    if (/Imported \d+ records/.test(text)) break;
    if (!confirmed && /Cancel Confirm/.test(text)) {
      confirmed = true;
      say(`preview shown by +${Math.round((Date.now() - t0) / 1000)} s; clicking Confirm`);
      await page.getByRole('button', { name: 'Confirm' }).click();
    }
  }
  await context.close();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
