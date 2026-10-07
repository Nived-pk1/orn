/**
 * The real ELK loader, the only file that imports `elkjs` (dependency-cruiser rule `elk-only-in-adapter`). The package's BUNDLED
 * build is used, inside OUR layout worker: `elk.bundled.js` runs the algorithms in the calling thread (ELK's own worker, which
 * would add a second thread we cannot terminate, is not used). The import is lazy, so the ~1.6 MB engine is not fetched until the
 * first layout (PERFORMANCE_ARCHITECTURE §7). The bundled file contains no `eval`, no `new Function` and no `Function(` (scanned,
 * step 4.4).
 */
import type { ElkLike } from './types';

type Constructor = new () => ElkLike;

/** The package's default export is the constructor (CommonJS interop can put it at `.default`, sometimes twice). */
function constructorOf(imported: unknown): Constructor {
  let candidate: unknown = imported;
  for (let depth = 0; depth < 3 && typeof candidate !== 'function'; depth += 1) candidate = (candidate as { default?: unknown } | null)?.default;
  if (typeof candidate !== 'function') throw new TypeError('elkjs did not export a constructor');
  return candidate as Constructor;
}

/**
 * elkjs 0.12.0's `elk-worker` ends with `if (typeof document === 'undefined' && typeof self !== 'undefined') { self.onmessage = ... }
 * else if (module.exports) { module.exports = { Worker } }`. Inside a web worker (no `document`, but `self`) it therefore decides it
 * IS ELK's own worker, installs its own `onmessage` on OUR worker scope and exports nothing, so the bundled build finds no in-thread
 * `Worker` class ("_Worker is not a constructor"; found by the first real-browser load, step 5.1d review). The bundle is browserify
 * style: `elk-worker` runs on the first `new Elk()`, not at import. So the first import AND the first construction run with an empty
 * `document` in the scope: the module takes its `module.exports` branch, `self.onmessage` stays ours, and elkjs stays pinned and
 * unpatched. The stub is removed in a `finally`; nothing else runs in the worker meanwhile (the scope is single-threaded and the
 * only await inside is the module import). Outside a worker scope (Node, jsdom) nothing is stubbed.
 */
async function loadConstructor(): Promise<Constructor> {
  const scope = globalThis as { document?: unknown };
  const inWorkerScope = typeof scope.document === 'undefined' && typeof self !== 'undefined';
  if (inWorkerScope) scope.document = {};
  try {
    const Elk = constructorOf(await import('elkjs/lib/elk.bundled.js'));
    new Elk(); // runs `elk-worker` (and GWT's initialisation) once, under the stub; later instances reuse its exports
    return Elk;
  } finally {
    if (inWorkerScope) delete scope.document;
  }
}

/** Loads ELK once and answers a function that makes an instance (the adapter makes a fresh one per layout). */
export async function loadElk(): Promise<() => ElkLike> {
  const Elk = await loadConstructor();
  return () => new Elk();
}
