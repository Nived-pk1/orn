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

/** Loads ELK once and answers a function that makes an instance (the adapter makes a fresh one per layout). */
export async function loadElk(): Promise<() => ElkLike> {
  const Elk = constructorOf(await import('elkjs/lib/elk.bundled.js'));
  return () => new Elk();
}
