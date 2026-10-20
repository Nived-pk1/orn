/**
 * scripts/check-edition.mjs against small fixture builds (studio step E2): the Study output must contain NO editor module in ANY chunk
 * (the module list comes from the build's own report, `build-report/<edition>.json`, written by the Vite plugin: the Vite manifest has no
 * module list); the Studio output must contain them (a wrong build is not mistaken for a right one); both report the initial JS gzip;
 * Studio is held to the 395 kB line. It must FAIL on a deliberately wrong fixture.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../scripts/check-edition.mjs', import.meta.url));
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Chunk {
  readonly file: string;
  readonly isEntry?: boolean;
  readonly modules: readonly string[];
}
const APP = ['src/app/main.tsx', 'src/app/window/window.tsx', 'src/features/inspector/inspector.tsx', 'src/core/graph/index.ts'];
const EDITORS = ['src/features/workbench/layer.ts', 'src/app/window/editor-session.tsx', 'src/core/editing/commit.ts', 'src/app/services/drafts.ts'];

const html = '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-a1.js"></script></head><body></body></html>';

function run(edition: string, chunks: readonly Chunk[], over: { report?: unknown; reportEdition?: string; indexJs?: string; noReport?: boolean } = {}): { status: number | null; out: string } {
  const root = mkdtempSync(join(tmpdir(), 'orn-edition-'));
  dirs.push(root);
  const dist = join(root, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), html);
  for (const chunk of chunks) {
    mkdirSync(dirname(join(dist, chunk.file)), { recursive: true });
    writeFileSync(join(dist, chunk.file), `export const x = "${chunk.file}"`);
  }
  writeFileSync(join(dist, 'assets/index-a1.js'), over.indexJs ?? 'console.log("app")');
  const report = join(root, 'report.json');
  if (over.noReport !== true) writeFileSync(report, JSON.stringify(over.report ?? { edition: over.reportEdition ?? edition, chunks }));
  const result = spawnSync(process.execPath, [SCRIPT, edition, dist, report], { encoding: 'utf8' });
  return { status: result.status, out: result.stdout + result.stderr };
}

const studyChunks: Chunk[] = [
  { file: 'assets/index-a1.js', isEntry: true, modules: APP },
  { file: 'assets/views-other-b1.js', modules: ['src/features/inspector/view-mechanism.tsx'] },
];
const studioChunks: Chunk[] = [
  { file: 'assets/index-a1.js', isEntry: true, modules: APP },
  { file: 'assets/editor-session-c1.js', modules: EDITORS },
];

describe('scripts/check-edition.mjs', () => {
  it('passes a Study build with no editor module and reports its initial JS gzip', () => {
    const { status, out } = run('study', studyChunks);
    expect(status).toBe(0);
    expect(out).toContain('edition check: passed');
    expect(out).toMatch(/initial JS \(study\): [\d.]+ kB gzip/);
  });

  it('passes a Studio build that has the editor modules, and reports its initial JS gzip', () => {
    const { status, out } = run('studio', studioChunks);
    expect(status).toBe(0);
    expect(out).toMatch(/initial JS \(studio\): [\d.]+ kB gzip/);
  });

  it('FAILS a Study build with an editor module in a lazy chunk (names the module and the chunk)', () => {
    const { status, out } = run('study', [...studyChunks, { file: 'assets/editor-session-c1.js', modules: EDITORS }]);
    expect(status).toBe(1);
    expect(out).toContain('FAIL assets/editor-session-c1.js: editor module src/features/workbench/layer.ts');
    expect(out).toContain('src/core/editing/commit.ts');
  });

  it('FAILS a Study build with ONE editor module in the entry chunk (the guard was missed)', () => {
    for (const module of ['src/core/editing/commit.ts', 'src/app/services/drafts.ts', 'src/app/window/workbench-page.tsx', 'src/features/workbench/editor-host.tsx']) {
      const { status, out } = run('study', [{ file: 'assets/index-a1.js', isEntry: true, modules: [...APP, module] }]);
      expect(status, module).toBe(1);
      expect(out, module).toContain(`FAIL assets/index-a1.js: editor module ${module}`);
    }
  });

  it('FAILS a Studio build without any editor module (the report or the build is the wrong one)', () => {
    const { status, out } = run('studio', studyChunks);
    expect(status).toBe(1);
    expect(out).toContain('FAIL studio: no editor module in the build');
  });

  it('FAILS when the report is for the other edition, is missing, or is not a report', () => {
    expect(run('study', studyChunks, { reportEdition: 'studio' }).out).toContain('FAIL report: it is for the studio edition, not study');
    expect(run('study', studyChunks, { noReport: true }).out).toContain('FAIL report:');
    expect(run('study', studyChunks, { report: { nonsense: true } }).out).toContain('FAIL report:');
    expect(run('neither', studyChunks).status).toBe(1);
  });

  it('holds the Studio build to 395 kB gzip of initial JS, and says the Study figure without a limit', () => {
    const heavy = randomBytes(410_000).toString('latin1');
    const studio = run('studio', studioChunks, { indexJs: heavy });
    expect(studio.status).toBe(1);
    expect(studio.out).toContain('over the 395 kB line');
    const study = run('study', studyChunks, { indexJs: heavy });
    expect(study.status).toBe(0);
  });
});
