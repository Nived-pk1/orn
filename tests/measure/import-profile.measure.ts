/**
 * Step 5.10b, Part 2a (informal; run alone; REPORTED, nothing decided): names the cause of the step 5.9a import long tasks. A V8 CPU
 * profile of the MAIN thread (CDP `Profiler`, 1 ms sampling) over the preview and over the apply of the design-tier dense file, in a
 * NON-MINIFIED build made only for this, served on port 4174:
 *   npx vite build --minify false --outDir <temp folder> && npx vite preview --outDir <temp folder> --port 4174 --strictPort
 * Run: `npx tsx tests/measure/import-profile.measure.ts`. Prints the top functions by SELF time for each phase, and the top ones by
 * self time inside the longest main-thread task of each phase (found with the Long Tasks API in the page).
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { chooseFile, expectPreview, generatedFile, importDialog, openApp } from '../e2e/kit';

const ORIGIN = 'http://127.0.0.1:4174';

interface Node {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
  children?: number[];
}
interface Profile {
  nodes: Node[];
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
}

function top(profile: Profile, label: string, from = -Infinity, to = Infinity): void {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map<string, number>();
  let at = profile.startTime;
  let total = 0;
  profile.samples.forEach((id, i) => {
    const dt = profile.timeDeltas[i] ?? 0;
    at += dt;
    if (at < from || at > to) return;
    const f = (byId.get(id) as Node).callFrame;
    const key = `${f.functionName === '' ? '(anonymous)' : f.functionName} ${f.url.replace(/^.*\//, '')}:${f.lineNumber + 1}:${f.columnNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + dt);
    total += dt;
  });
  // inclusive time of every named function: samples whose stack passes through it (each function counted once per sample)
  const parent = new Map<number, number>();
  profile.nodes.forEach((n) => (n.children ?? []).forEach((c) => parent.set(c, n.id)));
  const incl = new Map<string, number>();
  let at2 = profile.startTime;
  profile.samples.forEach((id, i) => {
    const dt = profile.timeDeltas[i] ?? 0;
    at2 += dt;
    if (at2 < from || at2 > to) return;
    const seen = new Set<string>();
    for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
      const f = (byId.get(cur) as Node).callFrame;
      if (f.functionName === '' || f.functionName === '(root)' || f.functionName === '(idle)' || f.functionName === '(program)') continue;
      const key = `${f.functionName} ${f.url.replace(/^.*\//, '')}:${f.lineNumber + 1}`;
      if (!seen.has(key)) {
        seen.add(key);
        incl.set(key, (incl.get(key) ?? 0) + dt);
      }
    }
  });
  console.log(`${label}: ${(total / 1000).toFixed(0)} ms sampled`);
  [...incl.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([k, v]) => console.log(`   ${(v / 1000).toFixed(0).padStart(6)} ms INCLUSIVE ${k}`));
  [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .forEach(([k, v]) => console.log(`   ${(v / 1000).toFixed(0).padStart(6)} ms self  ${k}`));
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  console.log(`Chromium ${browser.version()}, NON-MINIFIED production build, headless, ${process.platform}`);
  const context = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.addInitScript(`window.__long = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ start: e.startTime, duration: e.duration }); }).observe({ type: 'longtask' }); } catch (e) {}`);
  await openApp(page);
  const file = generatedFile('design', 'dense');
  // ORN_BY_PATH=1: the file is uploaded by path (the browser reads it natively), not as a buffer through Playwright's injected script
  const byPath = process.env.ORN_BY_PATH === '1';
  const uploadPath = join(mkdtempSync(join(tmpdir(), 'orn-prof-')), file.name);
  if (byPath) writeFileSync(uploadPath, file.buffer);
  console.log(`upload: ${byPath ? 'by path' : 'as a buffer through Playwright'}`);
  console.log(`file: ${file.name}, ${(file.buffer.length / 1048576).toFixed(1)} MB`);
  const session = await context.newCDPSession(page);
  await session.send('Profiler.enable');
  await session.send('Profiler.setSamplingInterval', { interval: 1000 });

  const phase = async (label: string, body: () => Promise<void>): Promise<void> => {
    await page.evaluate('window.__long.length = 0');
    await session.send('Profiler.start');
    const t0 = (await page.evaluate('performance.now()')) as number;
    await body();
    await page.waitForTimeout(1_000);
    const t1 = (await page.evaluate('performance.now()')) as number;
    const { profile } = (await session.send('Profiler.stop')) as { profile: Profile };
    const longs = (await page.evaluate('window.__long')) as { start: number; duration: number }[];
    console.log(`${label}: ${(t1 - t0).toFixed(0)} ms window; long tasks: ${longs.map((l) => `${l.duration.toFixed(0)} ms at +${(l.start - t0).toFixed(0)}`).join(', ') || 'none'}`);
    top(profile, `${label} - whole window, self time`);
    const longest = [...longs].sort((a, b) => b.duration - a.duration)[0];
    if (longest !== undefined) {
      // profile time is in microseconds of the profiler clock; map the window by its start so the longest task falls inside
      const origin = profile.startTime;
      const offsetUs = (longest.start - t0) * 1000;
      top(profile, `${label} - inside the longest task (${longest.duration.toFixed(0)} ms)`, origin + offsetUs - 20_000, origin + offsetUs + longest.duration * 1000 + 20_000);
    }
  };

  await phase('preview', async () => {
    if (byPath) {
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import a file' }).click()]);
      await chooser.setFiles(uploadPath);
    } else await chooseFile(page, file);
    await expectPreview(page, 300_000);
  });
  await phase('apply', async () => {
    await importDialog(page).getByRole('button', { name: 'Confirm' }).click();
    await page.getByText(/^Imported \d+ records from /).waitFor({ timeout: 300_000 });
  });
  await browser.close();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
