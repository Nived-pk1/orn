/**
 * What a thrown value from RDKit means. A WASM trap (`WebAssembly.RuntimeError`: "memory access out of bounds", "unreachable",
 * an `abort()`) or a JS stack/memory overflow (`RangeError`) leaves the module in an unknown state: the adapter drops it and
 * loads a fresh one, and the call answers `unavailable`. Anything else (a C++ exception surfaces as a
 * `WebAssembly.Exception`, which carries no message) is a refusal of THIS input by RDKit and the module is still good.
 */
export function isTrap(error: unknown): boolean {
  if (error instanceof RangeError) return true;
  return typeof WebAssembly !== 'undefined' && error instanceof WebAssembly.RuntimeError;
}

const MAX_MESSAGE = 200;

/** A short, single-line description of a thrown value for a message or a warning. */
export function describe(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : typeof error === 'string' ? error : 'RDKit raised an exception with no message';
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > MAX_MESSAGE ? `${line.slice(0, MAX_MESSAGE)}...` : line;
}
