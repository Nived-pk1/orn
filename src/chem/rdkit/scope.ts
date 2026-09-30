/**
 * The ONE place an RDKit object (mol, qmol) is opened and freed. RDKit objects live in WASM memory, outside the garbage
 * collector: a leak stays until the worker is restarted. `withHandle` opens the object, gives it to `run`, and frees it in a
 * `finally` on every path: a normal return, an early return, a throw. Nothing else in `src/chem` calls `delete()` on an
 * object it got from RDKit. Nest calls for several objects.
 */
import type { RdkitHandle } from './types';

export type Scoped<R> = { readonly opened: true; readonly value: R } | { readonly opened: false };

/**
 * Frees `handle` if it is not freed yet. After a WASM trap `delete()` may trap too: while another exception is already on its
 * way (`failed`) a failing `delete()` must not replace it (the adapter drops the module). On a normal path a failing `delete()`
 * is a leak and is NOT hidden: it propagates.
 */
function release(handle: RdkitHandle, failed: boolean): void {
  try {
    if (!handle.isDeleted()) handle.delete();
  } catch (error) {
    if (!failed) throw error;
  }
}

/**
 * `open` returning `null` (RDKit could not read the input) is `{ opened: false }` and there is nothing to free. If `open`
 * itself throws, nothing was created and the exception passes through.
 */
export function withHandle<H extends RdkitHandle, R>(open: () => H | null, run: (handle: H) => R): Scoped<R> {
  const handle = open();
  if (handle === null) return { opened: false };
  let failed = false;
  try {
    return { opened: true, value: run(handle) };
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    release(handle, failed);
  }
}
