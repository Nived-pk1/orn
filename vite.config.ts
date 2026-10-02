import { basename, dirname } from 'node:path';
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

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  worker: { format: 'es', rollupOptions: { output: workerOutput } },
  build: { target: 'es2022', sourcemap: true },
});
