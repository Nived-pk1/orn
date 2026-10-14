/**
 * Shared helpers of the e2e specs (step 5.1d). Everything the production page does wrong is collected here and asserted by the
 * specs: console errors, uncaught page errors, `securitypolicyviolation` events, and any request that leaves the origin (E3, E10).
 * Data enters only through the real import (E15): the generator runs in Node and the file is uploaded.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { documentToState, serializeDocument, stateToDocument } from '@/core/dataset';
import { generateTier, type GeneratorShape, type GeneratorTier } from '@/test-support/generator';
import { withNavigatorAnchors } from '@/test-support/perf-kit';

/** The origin `vite preview` serves (playwright.config.ts), or the site ORN_BASE_URL names. */
export const ORIGIN = process.env.ORN_BASE_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:4173';

export interface Watch {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly foreignRequests: string[];
  /** Native dialogs (alert, confirm, prompt, beforeunload) the page raised: the app never raises one (step 5.10a). */
  readonly nativeDialogs: string[];
  /** Policy violations seen by the document (`securitypolicyviolation`). */
  violations(): Promise<string[]>;
  /** Style elements WebKit's inspector injected for a screenshot (not the page's; see `watch`). */
  inspectorStyles(): Promise<number>;
}

/** Start watching a page BEFORE it navigates. */
export async function watch(page: Page, origin: string = ORIGIN): Promise<Watch> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const foreignRequests: string[] = [];
  const nativeDialogs: string[] = [];
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __ornViolations: string[] }).__ornViolations = seen;
    // WebKit: a screenshot makes its own inspector inject a <style>, which the page's policy reports (step 5.10a: the event's stack is
    // web-inspector://bootstrap.js) and the console logs as "Refused to apply a stylesheet". That is the automation, not the page: it is
    // counted apart, and `expectClean` forgives exactly that many such console lines, nothing else.
    const w = window as unknown as { __ornInspector?: number };
    document.addEventListener('securitypolicyviolation', (event) => {
      if ((new Error().stack ?? '').includes('web-inspector://') && event.violatedDirective === 'style-src-elem') {
        w.__ornInspector = (w.__ornInspector ?? 0) + 1;
        return;
      }
      seen.push(`${event.violatedDirective} ${event.blockedURI}${event.sample === '' ? '' : ` [${event.sample.slice(0, 80)}]`}`);
    });
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('dialog', (dialog) => {
    nativeDialogs.push(`${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss().catch(() => undefined);
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (['data:', 'blob:', 'about:'].includes(url.protocol)) return;
    if (url.origin !== origin) foreignRequests.push(request.url());
  });
  return {
    consoleErrors,
    pageErrors,
    foreignRequests,
    nativeDialogs,
    violations: () => page.evaluate(() => [...((window as unknown as { __ornViolations?: string[] }).__ornViolations ?? [])]),
    inspectorStyles: () => page.evaluate(() => (window as unknown as { __ornInspector?: number }).__ornInspector ?? 0),
  };
}

export async function expectClean(seen: Watch): Promise<void> {
  expect(await seen.violations(), 'securitypolicyviolation events').toEqual([]);
  let forgiven = await seen.inspectorStyles();
  const errors = seen.consoleErrors.filter((text) => !(forgiven > 0 && /^Refused to apply a stylesheet because its hash/.test(text) && (forgiven -= 1, true)));
  expect(errors, 'console errors').toEqual([]);
  expect(seen.pageErrors, 'uncaught page errors').toEqual([]);
  expect(seen.foreignRequests, 'requests that left the origin').toEqual([]);
  expect(seen.nativeDialogs, 'native dialogs').toEqual([]);
}

/** Open the app and wait until the services have booted (the status line says "Saved" or the like). */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Status' })).toBeVisible();
  await expect(page.getByText('Starting up', { exact: true })).toHaveCount(0);
}

export async function loadDemo(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Load demo dataset' }).click();
  await expect(page.getByText(/^Imported \d+ records from demo\.orn\.json\./)).toBeVisible();
}

/** Step 5.5a: with records the canvas shows the navigator; the record counts of 5.1d live under the Dataset mode. */
export async function showDataset(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Dataset' }).click();
  await expect(page.getByRole('region', { name: 'Dataset' })).toBeVisible();
}

export async function recordCount(page: Page, kind: string): Promise<number | undefined> {
  await showDataset(page);
  const items = await page.getByRole('list', { name: 'Record counts' }).getByRole('listitem').allTextContents();
  const found = items.find((text) => text.startsWith(`${kind}: `));
  return found === undefined ? undefined : Number(found.slice(kind.length + 2));
}

export const findingsText = (page: Page) => page.getByText(/^Findings: E \d+ \/ W \d+ \/ I \d+ \/ Review \d+$/);

/** A dataset file made by the generator in Node, as the bytes of an `.orn.json` file. */
export function generatedFile(tier: GeneratorTier, shape: GeneratorShape, seed = 1): { name: string; mimeType: string; buffer: Buffer } {
  const result = serializeDocument(generateTier(tier, shape, seed));
  if (!result.ok) throw new Error(`the generator's ${tier}/${shape} document does not serialise`);
  return { name: `generated-${tier}-${shape}.orn.json`, mimeType: 'application/json', buffer: Buffer.from(result.text, 'utf8') };
}

/** The same, with 60 navigator anchors on the classes (the generator makes none), so the overview has hubs. */
export function generatedFileWithAnchors(tier: GeneratorTier, shape: GeneratorShape, seed = 1): { name: string; mimeType: string; buffer: Buffer } {
  const doc = generateTier(tier, shape, seed);
  const parsed = documentToState(doc);
  if (!parsed.ok) throw new Error(`the generator's ${tier}/${shape} document has duplicate IDs`);
  const result = serializeDocument(stateToDocument(withNavigatorAnchors(parsed.state), { exportedAt: doc.exportedAt, exportScope: doc.exportScope, generator: doc.generator }));
  if (!result.ok) throw new Error(`the anchored ${tier}/${shape} document does not serialise`);
  return { name: `generated-${tier}-${shape}-anchored.orn.json`, mimeType: 'application/json', buffer: Buffer.from(result.text, 'utf8') };
}

export interface UploadFile {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

/**
 * Step 5.10b: a file over this size is uploaded BY PATH. `setInputFiles` with a buffer sends the bytes through the protocol as base64
 * and rebuilds a `File` on the page's main thread (a 17 MB file blocks it for seconds, which showed up as a false long task); with a
 * path the browser reads the file itself. Smaller files are uploaded as before.
 */
export const UPLOAD_BY_PATH_BYTES = 1_000_000;
let uploadDir: string | undefined;
function uploadable(file: UploadFile): string | UploadFile {
  if (file.buffer.length <= UPLOAD_BY_PATH_BYTES) return file;
  if (uploadDir === undefined) {
    uploadDir = mkdtempSync(join(tmpdir(), 'orn-e2e-'));
    process.once('exit', () => rmSync(uploadDir as string, { recursive: true, force: true }));
  }
  const dir = mkdtempSync(join(uploadDir, 'f-'));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, file.name);
  writeFileSync(path, file.buffer);
  return path;
}

/** Choose a file through the real "Import a file" button and file chooser. */
export async function chooseFile(page: Page, file: UploadFile): Promise<void> {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import a file' }).click()]);
  await chooser.setFiles(uploadable(file));
}

/** Step 5.9a: the file chooser behind the File menu's "Import a file...", for a dataset that already holds records. */
export async function chooseFileViaMenu(page: Page, file: UploadFile): Promise<void> {
  await page.getByRole('button', { name: 'File' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: /Import a file\.\.\./ }).click()]);
  await chooser.setFiles(uploadable(file));
}

/** Step 5.9a: the first-run screen's "Import v6 export" (the same screen as "Import a file"). */
export async function chooseV6(page: Page, file: UploadFile): Promise<void> {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import v6 export' }).click()]);
  await chooser.setFiles(uploadable(file));
}

export const importDialog = (page: Page) => page.getByRole('dialog', { name: 'Import summary' });

/** Step 5.9a: the preview of the import screen is open; the heading is the dialog's title. */
export async function expectPreview(page: Page, timeout = 90_000): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Import summary' })).toBeVisible({ timeout });
}

export async function secondTab(context: BrowserContext): Promise<Page> {
  return context.newPage();
}

/** axe at WCAG 2.2 AA; the serious and critical violations as text (the lesser ones are only counted in the log). */
export async function axeProblems(page: Page, minRules = 20): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const lesser = result.violations.filter((v) => v.impact !== 'serious' && v.impact !== 'critical');
  console.log(`axe: ${result.passes.length} rules passed, ${result.violations.length - lesser.length} serious or critical, ${lesser.length} lesser${lesser.map((v) => ` [${v.impact} ${v.id}]`).join('')}`);
  expect(result.passes.length, 'axe must have run its rules').toBeGreaterThan(minRules);
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join('; ')})`);
}


/**
 * Step 5.10a (ADV-033): what a page that rendered hostile data as text still looks like. Nothing ran (`window.__pwn` stays unset), no
 * element the app does not make (a script without `src`, iframe, object, embed, base), no `on*` attribute, no `javascript:` address, and
 * every image is a `blob:` or `data:` URL (an SVG asset is only ever an `<img>`). Returns the problems as text.
 */
export async function inertProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    if ((window as unknown as { __pwn?: unknown }).__pwn !== undefined) problems.push('hostile script ran (window.__pwn is set)');
    for (const el of document.querySelectorAll('script:not([src]), iframe, object, embed, base, frame, applet')) problems.push(`unexpected element <${el.tagName.toLowerCase()}>`);
    for (const el of document.querySelectorAll('*')) {
      for (const name of el.getAttributeNames()) {
        if (/^on/i.test(name)) problems.push(`<${el.tagName.toLowerCase()}> has ${name}`);
        if (/^(href|src|xlink:href|action|formaction)$/i.test(name) && /^\s*javascript:/i.test(el.getAttribute(name) ?? '')) problems.push(`<${el.tagName.toLowerCase()}> ${name} is a javascript: address`);
      }
    }
    for (const img of document.querySelectorAll('img')) {
      const src = img.getAttribute('src') ?? '';
      if (!/^(blob:|data:)/.test(src)) problems.push(`<img> from ${src.slice(0, 60)}`);
    }
    return problems;
  });
}
