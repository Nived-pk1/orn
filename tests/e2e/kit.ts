/**
 * Shared helpers of the e2e specs (step 5.1d). Everything the production page does wrong is collected here and asserted by the
 * specs: console errors, uncaught page errors, `securitypolicyviolation` events, and any request that leaves the origin (E3, E10).
 * Data enters only through the real import (E15): the generator runs in Node and the file is uploaded.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { documentToState, serializeDocument, stateToDocument } from '@/core/dataset';
import { generateTier, type GeneratorShape, type GeneratorTier } from '@/test-support/generator';
import { withNavigatorAnchors } from '@/test-support/perf-kit';

/** The origin `vite preview` serves (playwright.config.ts). */
export const ORIGIN = 'http://127.0.0.1:4173';

export interface Watch {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly foreignRequests: string[];
  /** Native dialogs (alert, confirm, prompt, beforeunload) the page raised: the app never raises one (step 5.10a). */
  readonly nativeDialogs: string[];
  /** Policy violations seen by the document (`securitypolicyviolation`). */
  violations(): Promise<string[]>;
}

/** Start watching a page BEFORE it navigates. */
export async function watch(page: Page): Promise<Watch> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const foreignRequests: string[] = [];
  const nativeDialogs: string[] = [];
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __ornViolations: string[] }).__ornViolations = seen;
    document.addEventListener('securitypolicyviolation', (event) => seen.push(`${event.violatedDirective} ${event.blockedURI}`));
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
    if (url.origin !== ORIGIN) foreignRequests.push(request.url());
  });
  return {
    consoleErrors,
    pageErrors,
    foreignRequests,
    nativeDialogs,
    violations: () => page.evaluate(() => [...((window as unknown as { __ornViolations?: string[] }).__ornViolations ?? [])]),
  };
}

export async function expectClean(seen: Watch): Promise<void> {
  expect(await seen.violations(), 'securitypolicyviolation events').toEqual([]);
  expect(seen.consoleErrors, 'console errors').toEqual([]);
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

/** Choose a file through the real "Import a file" button and file chooser. */
export async function chooseFile(page: Page, file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import a file' }).click()]);
  await chooser.setFiles(file);
}

export interface UploadFile {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

/** Step 5.9a: the file chooser behind the File menu's "Import a file...", for a dataset that already holds records. */
export async function chooseFileViaMenu(page: Page, file: UploadFile): Promise<void> {
  await page.getByRole('button', { name: 'File' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: /Import a file\.\.\./ }).click()]);
  await chooser.setFiles(file);
}

/** Step 5.9a: the first-run screen's "Import v6 export" (the same screen as "Import a file"). */
export async function chooseV6(page: Page, file: UploadFile): Promise<void> {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import v6 export' }).click()]);
  await chooser.setFiles(file);
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
