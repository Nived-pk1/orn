/**
 * Compiling the RDKit WASM in the browser (RR1, step 8.1). Streaming compile is tried first; WebKit sometimes answers
 * "wasm streaming compile failed: Load failed". Then, ONCE, the file is fetched again as bytes and instantiated the plain way.
 * If that fails too the caller gets a value (`{ ok: false }`) and the existing "unavailable" path runs. No DOM, no globals:
 * the three platform calls are injected.
 */
export interface WasmDeps {
  readonly fetchUrl: (url: string) => Promise<Response>;
  readonly instantiateStreaming: (response: Response, imports: WebAssembly.Imports) => Promise<WebAssembly.WebAssemblyInstantiatedSource>;
  readonly instantiateBytes: (bytes: ArrayBuffer, imports: WebAssembly.Imports) => Promise<WebAssembly.WebAssemblyInstantiatedSource>;
}

export type WasmResult =
  | { readonly ok: true; readonly instance: WebAssembly.Instance; readonly module: WebAssembly.Module }
  | { readonly ok: false; readonly reason: string };

export async function instantiateWithFallback(url: string, imports: WebAssembly.Imports, deps: WasmDeps): Promise<WasmResult> {
  try {
    const streamed = await deps.instantiateStreaming(await deps.fetchUrl(url), imports);
    return { ok: true, instance: streamed.instance, module: streamed.module };
  } catch {
    // fall through to the one retry
  }
  try {
    const bytes = await (await deps.fetchUrl(url)).arrayBuffer();
    const plain = await deps.instantiateBytes(bytes, imports);
    return { ok: true, instance: plain.instance, module: plain.module };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** The browser's real calls. */
export function browserWasmDeps(): WasmDeps {
  return {
    fetchUrl: (url) => fetch(url),
    instantiateStreaming: (response, imports) => WebAssembly.instantiateStreaming(response, imports),
    instantiateBytes: (bytes, imports) => WebAssembly.instantiate(bytes, imports),
  };
}
