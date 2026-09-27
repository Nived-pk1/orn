/**
 * INV-25 guard behaviour (scripts/check-hardcode.mjs) against a throwaway project directory: the ID
 * comparison applies everywhere, the name comparison is skipped only inside src/core/schema.
 * Accepted blind spots (documented in the script): concatenation/template literals, names shorter than
 * 5 characters, IDs loaded from JSON at run time.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../scripts/check-hardcode.mjs', import.meta.url));
const dirs: string[] = [];

function project(source: { path: string; code: string }): { status: number | null; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), 'orn-hardcode-'));
  dirs.push(dir);
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  put('data/seed/x.json', JSON.stringify({ records: [{ id: 'rxn_secret-route', name: 'Elimination' }] }));
  put(source.path, source.code);
  const run = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });
  return { status: run.status, stderr: run.stderr };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('INV-25 check:hardcode scope', () => {
  it('a dataset record ID literal inside src/core/schema fails', () => {
    const run = project({ path: 'src/core/schema/x.ts', code: "export const bad = 'rxn_secret-route';\n" });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('src');
  });

  it('a dataset name equal to an enum word inside src/core/schema passes', () => {
    const run = project({ path: 'src/core/schema/x.ts', code: "export const kinds = ['elimination'] as const;\n" });
    expect(run.status).toBe(0);
  });

  it('the same name outside src/core/schema fails', () => {
    const run = project({ path: 'src/core/commands/x.ts', code: "export const kind = 'elimination';\n" });
    expect(run.status).toBe(1);
  });
});
