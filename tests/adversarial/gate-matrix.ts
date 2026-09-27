/**
 * Reusable gate completeness check (docs/TEST_STRATEGY.md §5–§6). An ADV/INV/P ID counts as covered only when it
 * appears in a describe/it/test title (including it.each templates), never in a comment or elsewhere in the file.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../', import.meta.url);
const ID = /\b(?:ADV-\d{3}|INV-\d{2}|P-\d{2})\b/g;
/** A string literal directly after `describe(` / `it(` / `test(` (with modifiers) or after an `.each(...)` call. */
const TITLE = /(?:\b(?:describe|it|test)(?:\.\w+)*|\))\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

function testFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...testFiles(path));
    else if (/\.test\.tsx?$/.test(name)) found.push(path);
  }
  return found;
}

/** IDs found in test titles under src/ and tests/. */
export function titledIds(): Set<string> {
  const ids = new Set<string>();
  for (const dir of ['src', 'tests']) {
    for (const file of testFiles(fileURLToPath(new URL(dir, ROOT)))) {
      for (const title of readFileSync(file, 'utf8').matchAll(TITLE)) {
        for (const id of (title[2] ?? '').matchAll(ID)) ids.add(id[0]);
      }
    }
  }
  return ids;
}

/** ADV IDs of §5 whose Gate column lists the gate letter (e.g. "A" or "A, B"). */
export function gateRows(gate: string): string[] {
  const text = readFileSync(new URL('docs/TEST_STRATEGY.md', ROOT), 'utf8');
  return text
    .split('\n')
    .map((line) => line.split('|').map((cell) => cell.trim()))
    .filter((cells) => /^ADV-\d{3}$/.test(cells[1] ?? '') && (cells[cells.length - 2] ?? '').split(',').map((g) => g.trim()).includes(gate))
    .map((cells) => cells[1] as string);
}

/** Registers the completeness tests for one gate: its matrix rows plus any extra INV/P IDs the gate requires. */
export function describeGateCompleteness(gate: string, minRows: number, extraIds: readonly string[] = []): void {
  describe(`Gate ${gate} matrix completeness`, () => {
    const rows = gateRows(gate);
    const titled = titledIds();

    it(`finds the Gate ${gate} rows of the matrix`, () => {
      expect(rows.length).toBeGreaterThanOrEqual(minRows);
    });
    it.each(rows)('%s is named in at least one test title', (id) => {
      expect(titled.has(id)).toBe(true);
    });
    it.each(extraIds)('%s (gate criterion) is named in at least one test title', (id) => {
      expect(titled.has(id)).toBe(true);
    });
  });
}
