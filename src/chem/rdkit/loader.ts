/**
 * The real RDKit loader, the only file that imports `@rdkit/rdkit` (dependency-cruiser rule `rdkit-only-in-adapter`). The package
 * is imported lazily, so nothing of RDKit's 105 KB glue or 7 MB WASM is fetched until a structure is first parsed, and the WASM
 * is the package's own file: in the browser the caller passes its URL (`wasm-url.ts`, resolved by the bundler to a local asset,
 * no CDN); under Node the glue reads the file next to itself. Logging is switched off: RDKit would otherwise write every
 * parse failure to the console, and the failure is already a value.
 */
import type { RdkitModule } from './types';
import { browserWasmDeps, instantiateWithFallback } from './wasm-instantiate';

export interface RdkitLoadOptions {
  /** Where the browser gets `RDKit_minimal.wasm` from. Omit under Node. */
  readonly wasmUrl?: string;
}

type Factory = (options?: unknown) => Promise<unknown>;

/** The package's default export is the factory (CommonJS interop puts it at `.default`, sometimes twice). */
function factoryOf(imported: unknown): Factory {
  let candidate: unknown = imported;
  for (let depth = 0; depth < 3 && typeof candidate !== 'function'; depth += 1) candidate = (candidate as { default?: unknown } | null)?.default;
  if (typeof candidate !== 'function') throw new TypeError('@rdkit/rdkit did not export a module factory');
  return candidate as Factory;
}

export async function loadRdkit(options: RdkitLoadOptions = {}): Promise<RdkitModule> {
  const factory = factoryOf(await import('@rdkit/rdkit'));
  const wasmUrl = options.wasmUrl;
  if (wasmUrl === undefined) return finish((await factory()) as RdkitModule);
  // RR1: the browser compiles the WASM itself, streaming first and ONCE from plain bytes if that fails; a second failure rejects.
  let fail: (reason: Error) => void = () => undefined;
  const failed = new Promise<never>((_, reject) => {
    fail = reject;
  });
  const instantiateWasm = (imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void): Record<string, never> => {
    void instantiateWithFallback(wasmUrl, imports, browserWasmDeps()).then((result) => {
      if (result.ok) receive(result.instance, result.module);
      else fail(new Error(`the structure engine could not start: ${result.reason}`));
    });
    return {};
  };
  const options2 = { locateFile: (file: string) => (file.endsWith('.wasm') ? wasmUrl : file), instantiateWasm };
  return finish((await Promise.race([factory(options2), failed])) as RdkitModule);
}

function finish(module: RdkitModule): RdkitModule {
  module.disable_logging?.();
  return module;
}
