/**
 * scripts/check-colours.mjs against a throwaway project (step 5.2, ADR-014): a hex colour, a colour function or a named colour in a
 * stylesheet, and a hex string or colour function in presentation code, fail with file and line; the token file, var(), color-mix()
 * of tokens, tests and src/chem are not touched.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../scripts/check-colours.mjs', import.meta.url));
const dirs: string[] = [];

function project(files: Record<string, string>): { status: number | null; stdout: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), 'orn-col-'));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const run = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('check:colours', () => {
  it('passes on tokens, var(), color-mix() of tokens, transparent, currentColor, comments, ids, tests and src/chem', () => {
    const run = project({
      'src/ui/design/tokens.css': ':root { --color-ink: #16191d; --a: rgb(1, 2, 3); }\n',
      'src/ui/x.module.css': '/* #fff red */\n.a { color: var(--color-ink); background: color-mix(in srgb, var(--color-ink) 6%, transparent); border: 1px solid currentColor; }\n#root { margin: 0; }\n',
      'src/ui/x.tsx': "export const a = '#root';\n// const b = '#ffffff';\n",
      'src/ui/x.test.tsx': "export const a = '#ffffff';\n",
      'src/chem/svg/values.ts': "export const a = '#ffffff';\n",
    });
    expect(run.status, run.stderr).toBe(0);
  });

  it.each([
    ['a hex colour', 'src/ui/a.module.css', '.a {\n  color: #fff;\n}\n', 'a.module.css:2'],
    ['an 8-digit hex colour', 'src/app/a.css', '.a { background: #11223344; }\n', 'hex colour'],
    ['a colour function', 'src/features/a.css', '.a { border-color: rgba(0, 0, 0, 0.5); }\n', 'colour function'],
    ['a named colour', 'src/ui/a.css', '.a { color: red; }\n', 'named colour "red"'],
    ['a named colour inside a shorthand', 'src/ui/a.css', '.a { border: 1px solid navy; }\n', 'named colour "navy"'],
    ['a hex string in presentation code', 'src/ui/a.tsx', "export const c = '#2b4fd8';\n", 'hex colour in a string'],
    ['a colour function in presentation code', 'src/render/a.ts', 'export const c = `rgb(1,2,3)`;\n', 'colour function'],
  ])('fails on %s', (_name, path, text, expected) => {
    const run = project({ [path]: text });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(expected);
  });
});
