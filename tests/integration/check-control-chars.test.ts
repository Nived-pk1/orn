/**
 * scripts/check-control-chars.mjs against a throwaway project directory (step 3.11c review, Part A): a raw NUL or
 * another control character (not tab, LF, CR) in a .md/.json file under docs/, data/ or the root, or in a source
 * file, fails with file, line and column; escapes and ordinary whitespace pass.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../scripts/check-control-chars.mjs', import.meta.url));
const dirs: string[] = [];
// the six characters backslash u 0 0 0 0, written out (not a NUL)
const ESCAPE = String.fromCharCode(92) + 'u0000';

function project(files: Record<string, string>): { status: number | null; stdout: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), 'orn-ctrl-'));
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

describe('check:control-chars', () => {
  it('passes on tabs, LF, CRLF, non-ASCII text and a written-out escape', () => {
    const run = project({
      'docs/a.md': `a\tb\r\nc ${ESCAPE} d é ✓\n`,
      'data/x.json': `{"k":"${ESCAPE}"}\n`,
      'README.md': '# x\n',
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('passed');
  });

  it('a raw NUL in a docs .md file fails with file, line and column', () => {
    const run = project({ 'docs/a.md': `ok\nab${String.fromCharCode(0)}cd\n` });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('a.md:2:3');
    expect(run.stderr).toContain('U+0000');
  });

  it('a raw control character in a data .json, a root .md and a source file each fails', () => {
    const cases: Array<Record<string, string>> = [
      { 'data/fixtures/x.json': `{"k":"a${String.fromCharCode(1)}"}` },
      { 'CLAUDE.md': `x${String.fromCharCode(27)}y` },
      { 'src/io/x.ts': `export const s = \`a${String.fromCharCode(0)}b\`;\n` },
    ];
    for (const files of cases) {
      const run = project(files);
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('raw control character');
    }
  });

  it('reports every offending character, not only the first', () => {
    const run = project({ 'docs/a.md': `${String.fromCharCode(0)}${String.fromCharCode(2)}\n` });
    expect(run.stderr.match(/✖/g)?.length).toBe(2);
  });
});
