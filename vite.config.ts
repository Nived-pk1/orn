import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Production-only Content-Security-Policy (docs/SECURITY.md §4).
 * Not applied in dev because Vite's dev server injects inline scripts and styles.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "img-src 'self' blob: data:",
  "style-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'orn-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  };
}

/**
 * Worker chunk names (step 4.6): `npm run build:smoke` (scripts/check-build.mjs) finds the four entries as `worker-<name>-<hash>.js` and
 * RDKit's own glue as `rdkit-glue-<hash>.js`: the one chunk made only of `@rdkit/rdkit` modules, the only place ADR-035 allows
 * `new Function`. A chunk that mixes RDKit with our code keeps a normal name, so the smoke check then scans it and fails.
 */
const slashed = (path: string): string => path.split("\\").join("/");
/** Only `@rdkit/rdkit` modules, plus the bundler's own virtual ones (CommonJS helpers, the empty `node:fs` stand-in): RDKit's glue chunk. */
const isRdkitOnly = (ids: readonly string[]): boolean => {
  const rdkit = (id: string): boolean => slashed(id).includes('/node_modules/@rdkit/rdkit/');
  const virtual = (id: string): boolean => id.charCodeAt(0) === 0 || id.startsWith('__vite');
  return ids.some((id) => !virtual(id) && rdkit(id)) && ids.every((id) => virtual(id) || rdkit(id));
};
const workerOutput = {
  entryFileNames: (chunk: { facadeModuleId: string | null }): string => `assets/worker-${basename(dirname(slashed(chunk.facadeModuleId ?? 'unknown/entry.ts')))}-[hash].js`,
  chunkFileNames: (chunk: { moduleIds: readonly string[] }): string =>
    isRdkitOnly(chunk.moduleIds)
      ? 'assets/rdkit-glue-[hash].js'
      : 'assets/[name]-[hash].js',
};

/** The short commit of the build (release preview); "unknown" outside a git checkout. */
function shortCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}
const packageVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;

/**
 * The edition of the build (studio step, ADR-041): 'study' (the public site, no editing code; the default) or 'studio' (everything), chosen
 * by ORN_EDITION (scripts/edition.mjs sets it). Vitest runs as Studio so the editor tests are unchanged. Any other value stops the build.
 */
const edition = ((): 'study' | 'studio' => {
  const raw = process.env.ORN_EDITION ?? (process.env.VITEST === undefined ? 'study' : 'studio');
  if (raw !== 'study' && raw !== 'studio') throw new Error(`ORN_EDITION must be 'study' or 'studio', got '${raw}'`);
  return raw;
})();
/**
 * Study: the editor modules (scripts/editor-modules.json) are declared free of side effects, so a module of them that nothing uses is dropped
 * whole (a module-level call such as enablePatches() or a zod schema would otherwise keep it, and what it imports, in the bundle). If a
 * Study entry point did use one, its code would stay and scripts/check-edition.mjs would fail the build.
 */
const editorModules: string[] = (JSON.parse(readFileSync(new URL('./scripts/editor-modules.json', import.meta.url), 'utf8')) as { modules: string[] }).modules;
const isEditorModule = (id: string): boolean => {
  const path = slashed(relative(process.cwd(), id.split('?')[0] ?? id));
  return editorModules.some((entry) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry));
};

/** Each edition builds into its own folder: dist (Study, the Worker reaction-navigator) and dist-studio (Studio, reaction-navigator-studio). */
// ORN_OUT_DIR: the e2e builds the Study edition over a fixture into its own folder, so `dist` is never a test build
const outDir = process.env.ORN_OUT_DIR ?? (edition === 'studio' ? 'dist-studio' : 'dist');

/**
 * The module list of every chunk, written OUTSIDE the served folder (build-report/<edition>.json, git-ignored): the Vite manifest has no
 * module list, and scripts/check-edition.mjs needs one to prove the Study build holds no editor module. Only modules that put code in
 * the chunk count (a re-export barrel renders nothing).
 */
const collected: { file: string; isEntry: boolean; modules: string[] }[] = [];
function moduleReport(write: boolean): Plugin {
  return {
    name: 'orn-module-report',
    apply: 'build',
    generateBundle(_options, bundle) {
      const root = process.cwd();
      for (const item of Object.values(bundle)) {
        if (item.type !== 'chunk') continue;
        const modules = Object.entries(item.modules).filter(([, info]) => info.renderedLength > 0).map(([id]) => slashed(relative(root, id.split('?')[0] ?? id))).sort();
        collected.push({ file: item.fileName, isEntry: item.isEntry, modules });
      }
      if (!write) return;
      mkdirSync(resolve(root, 'build-report'), { recursive: true });
      writeFileSync(resolve(root, 'build-report', edition + '.json'), JSON.stringify({ edition, chunks: collected }, null, 1));
    },
  };
}

/**
 * `virtual:orn-dataset` (studio step E4): the dataset this build ships, so only that file is emitted as an asset. Study with a published
 * dataset (`data/published/manifest.json`, written by `npm run publish:dataset`) ships it, with its sha256 and time; every other build
 * (Studio, or Study with nothing published) ships the bundled demo.
 */
function datasetModule(): Plugin {
  const id = 'virtual:orn-dataset';
  // ORN_PUBLISHED_DIR: where the published dataset is (the e2e builds the Study site over a fixture it makes; default data/published)
  const publishedDir = resolve(process.cwd(), process.env.ORN_PUBLISHED_DIR ?? 'data/published');
  const manifestPath = resolve(publishedDir, 'manifest.json');
  return {
    name: 'orn-dataset',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load(loaded) {
      if (loaded !== `\0${id}`) return undefined;
      const published = edition === 'study' && existsSync(manifestPath);
      if (!published) {
        const demo = JSON.stringify(`${resolve(process.cwd(), 'data', 'seed', 'demo.orn.json')}?url`);
        return `import url from ${demo};\nexport const dataset = { kind: 'demo', url, fileName: 'demo.orn.json' };\n`;
      }
      this.addWatchFile(manifestPath);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { file: string; sha256: string; publishedAt: string };
      const file = JSON.stringify(`${resolve(publishedDir, manifest.file)}?url`);
      return `import url from ${file};\nexport const dataset = { kind: 'published', url, fileName: ${JSON.stringify(manifest.file)}, sha256: ${JSON.stringify(manifest.sha256)}, publishedAt: ${JSON.stringify(manifest.publishedAt)} };\n`;
    },
  };
}

export default defineConfig({
  define: { __ORN_VERSION__: JSON.stringify(packageVersion), __ORN_COMMIT__: JSON.stringify(shortCommit()), __ORN_EDITION__: JSON.stringify(edition) },
  plugins: [react(), contentSecurityPolicy(), datasetModule(), moduleReport(true)],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  worker: { format: 'es', rollupOptions: { output: workerOutput }, plugins: () => [moduleReport(false)] },
  build: { target: 'es2022', sourcemap: false, outDir, rollupOptions: { treeshake: { moduleSideEffects: (id) => !(edition === 'study' && isEditorModule(id)) } } },
});
