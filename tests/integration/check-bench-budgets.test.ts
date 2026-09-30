/**
 * scripts/check-bench-budgets.mjs against a throwaway project directory (Gate C review, follow-up 3a): every bench()
 * in tests/perf/*.bench.ts needs a budgets.mjs entry and every entry needs a bench; the missing names are reported;
 * no bench is run. Also run once against the real repository.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../scripts/check-bench-budgets.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('../..', import.meta.url));
const dirs: string[] = [];

function budgets(keys: readonly string[]): string {
  return `export const BUDGETS = {\n${keys.map((k) => `  ${JSON.stringify(k)}: { budgetMs: null },`).join('\n')}\n};\n`;
}

function run(cwd: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function project(files: Record<string, string>): { status: number | null; stdout: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), 'orn-bench-'));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return run(dir);
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const BENCH = `import { bench, describe } from 'vitest';
// bench('commented out, ignored', () => {});
describe('alpha (design tier)', () => {
  bench('one', () => {});
  bench(
    "two (it's quoted)",
    () => {},
  );
});
for (const shape of ['dense', 'chain'] as const) {
  describe(\`beta (\${shape})\`, () => {
    bench('three', () => {});
  });
}
`;
const ALL = ['alpha (design tier) > one', "alpha (design tier) > two (it's quoted)", 'beta (dense) > three', 'beta (chain) > three'];

describe('check:bench-budgets', () => {
  it('passes when every bench has an entry and every entry has a bench (loop shapes expanded)', () => {
    const result = project({ 'tests/perf/a.bench.ts': BENCH, 'tests/perf/budgets.mjs': budgets(ALL) });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('4 benches, 4 entries');
  });

  it('a bench without an entry fails and is named (one loop shape missing)', () => {
    const result = project({ 'tests/perf/a.bench.ts': BENCH, 'tests/perf/budgets.mjs': budgets(ALL.slice(0, 3)) });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('a.bench.ts: beta (chain) > three');
    expect(result.stderr).not.toContain('entry without a bench');
  });

  it('an entry without a bench fails and is named', () => {
    const result = project({ 'tests/perf/a.bench.ts': BENCH, 'tests/perf/budgets.mjs': budgets([...ALL, 'alpha (design tier) > renamed away']) });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('entry without a bench: alpha (design tier) > renamed away');
  });

  it('a commented-out bench needs no entry, and both kinds of problem are reported together', () => {
    const result = project({ 'tests/perf/a.bench.ts': BENCH, 'tests/perf/budgets.mjs': budgets([...ALL.slice(1), 'gone > x']) });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('alpha (design tier) > one');
    expect(result.stderr).toContain('gone > x');
    expect(result.stderr).not.toContain('commented out');
  });

  it('a title built from an unresolvable variable matches any entry text', () => {
    const source = "import { bench, describe } from 'vitest';\nfor (const [label] of rows) {\n  describe(`gamma (${label})`, () => {\n    bench('total', () => {});\n  });\n}\n";
    const ok = project({ 'tests/perf/g.bench.ts': source, 'tests/perf/budgets.mjs': budgets(['gamma (x) > total', 'gamma (y) > total']) });
    expect(ok.status).toBe(0);
    const none = project({ 'tests/perf/g.bench.ts': source, 'tests/perf/budgets.mjs': budgets([]) });
    expect(none.status).toBe(1);
    expect(none.stderr).toContain('gamma (*) > total');
  });

  it('the repository itself passes', () => {
    const result = run(REPO);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
