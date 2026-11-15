/**
 * scripts/check-edition.mjs against small fixture builds (studio step E2): the Study output must contain NO editor module in ANY chunk
 * (the module list comes from the build's own report, `build-report/<edition>.json`, written by the Vite plugin: the Vite manifest has no
 * module list); the Studio output must contain them (a wrong build is not mistaken for a right one); both report the initial JS gzip;
 * Study is held to 360 kB and Studio to 365 kB (8.4s). It must FAIL on a deliberately wrong fixture.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  it('FAILS a Study module whose name is an editor name even when nobody listed its path (step 8.4s, S7)', () => {
    for (const name of ['delete-host', 'merge-port', 'quick-entry', 'create-new', 'bulk-actions']) {
      const module = `src/features/somewhere/${name}.tsx`;
      const { status, out } = run('study', [...studyChunks, { file: 'assets/forgotten-d1.js', modules: [module] }]);
      expect(status, name).toBe(1);
      expect(out).toContain(`FAIL assets/forgotten-d1.js: module ${module} is in the Study build and its name has`);
    }
  });

  it('lets a named exception through (bulk-context.ts is in the Study build on purpose) and does not hold Studio to the names', () => {
    const exception = { file: 'assets/ctx-e1.js', modules: ['src/features/navigator/bulk-context.ts'] };
    expect(run('study', [...studyChunks, exception]).status).toBe(0);
    const forgotten = { file: 'assets/forgotten-d1.js', modules: ['src/features/somewhere/delete-host.tsx'] };
    expect(run('studio', [...studioChunks, forgotten]).status).toBe(0);
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

  it('holds Study to 360 kB and Studio to 365 kB gzip of initial JS (step 8.4s), and passes both well under', () => {
    const heavy = randomBytes(410_000).toString('latin1');
    const studio = run('studio', studioChunks, { indexJs: heavy });
    expect(studio.status).toBe(1);
    expect(studio.out).toContain('over the 365 kB line');
    const study = run('study', studyChunks, { indexJs: heavy });
    expect(study.status).toBe(1);
    expect(study.out).toContain('over the 360 kB line');
    const light = randomBytes(300_000).toString('latin1');
    expect(run('studio', studioChunks, { indexJs: light }).status).toBe(0);
    expect(run('study', studyChunks, { indexJs: light }).status).toBe(0);
  });
});

describe('the multi-selection modules (step 6.8b, Y1)', () => {
  const listed = (JSON.parse(readFileSync(SCRIPT.replace('check-edition.mjs', 'editor-modules.json'), 'utf8')) as { modules: string[] }).modules;
  const MULTI = [
    'src/features/navigator/multi-entry.ts',
    'src/features/navigator/multi-select-toggle.tsx',
    'src/features/navigator/multi-select.ts',
    'src/features/navigator/multi-loader.ts',
    'src/features/navigator/multi-engine.tsx',
    'src/features/navigator/multi-actions.tsx',
    'src/features/navigator/use-multi-select.tsx',
  ];
  it('lists every multi-selection module as an editor module', () => {
    for (const id of MULTI) expect(listed, id).toContain(id);
  });
  it('fails a Study build that holds one of them', () => {
    const chunks: Chunk[] = [{ file: 'assets/index-a1.js', isEntry: true, modules: [...APP, 'src/features/navigator/multi-select.ts'] }];
    const { status, out } = run('study', chunks);
    expect(status).toBe(1);
    expect(out).toContain('src/features/navigator/multi-select.ts');
  });
});
