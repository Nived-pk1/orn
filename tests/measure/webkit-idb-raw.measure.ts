/**
 * Step 5.10b, Part 2W (informal; run alone; REPORTED): raw IndexedDB write speed in the engines, with none of the app's code: N puts of
 * ~1 KB objects in ONE readwrite transaction, in a persistent context, on the app's origin (a blank page of the preview server).
 *   npx tsx tests/measure/webkit-idb-raw.measure.ts <chromium|webkit|firefox> [persistent]
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox, webkit } from '@playwright/test';

const RUN = `(async () => {
  const out = [];
  const db = await new Promise((res, rej) => { const r = indexedDB.open('raw-' + Math.random(), 1); r.onupgradeneeded = () => r.result.createObjectStore('s', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const blob = 'x'.repeat(1000);
  for (const n of [200, 2000, 5000]) {
    const t = performance.now();
    await new Promise((res, rej) => { const tx = db.transaction('s', 'readwrite'); const s = tx.objectStore('s'); for (let i = 0; i < n; i++) s.put({ id: n + ':' + i, blob, i }); tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
    out.push(n + ' puts of 1 KB in one transaction: ' + Math.round(performance.now() - t) + ' ms');
  }
  const t2 = performance.now();
  await new Promise((res, rej) => { const tx = db.transaction('s', 'readwrite'); const s = tx.objectStore('s'); s.put({ id: 'big', blob: 'y'.repeat(2000000) }); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  out.push('one put of 2 MB: ' + Math.round(performance.now() - t2) + ' ms');
  return out;
})()`;

async function main(): Promise<void> {
  const [engine = 'webkit', mode = 'persistent'] = process.argv.slice(2);
  const type = engine === 'chromium' ? chromium : engine === 'firefox' ? firefox : webkit;
  const opts = { baseURL: 'http://127.0.0.1:4173' };
  const context = mode === 'persistent' ? await type.launchPersistentContext(mkdtempSync(join(tmpdir(), 'orn-raw-')), opts) : await (await type.launch()).newContext(opts);
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto('/favicon.ico').catch(() => undefined);
  await page.goto('/');
  console.log(`== ${engine} ${mode}`);
  for (const line of (await page.evaluate(RUN)) as string[]) console.log(`   ${line}`);
  await context.close();
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
