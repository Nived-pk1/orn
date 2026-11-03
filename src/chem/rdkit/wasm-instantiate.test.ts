import { describe, expect, it } from 'vitest';
import { instantiateWithFallback, type WasmDeps } from './wasm-instantiate';

const instance = { exports: {} } as unknown as WebAssembly.Instance;
const module_ = {} as WebAssembly.Module;
const imports = {} as WebAssembly.Imports;

function deps(over: Partial<WasmDeps>): { deps: WasmDeps; calls: string[] } {
  const calls: string[] = [];
  const base: WasmDeps = {
    fetchUrl: async () => {
      calls.push('fetch');
      return { arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response;
    },
    instantiateStreaming: async () => {
      calls.push('streaming');
      return { instance, module: module_ };
    },
    instantiateBytes: async () => {
      calls.push('bytes');
      return { instance, module: module_ };
    },
  };
  return { deps: { ...base, ...over }, calls };
}

describe('instantiateWithFallback (RR1)', () => {
  it('uses streaming compile when it works', async () => {
    const { deps: d, calls } = deps({});
    expect((await instantiateWithFallback('/x.wasm', imports, d)).ok).toBe(true);
    expect(calls).toEqual(['fetch', 'streaming']);
  });

  it('falls back ONCE to fetch, arrayBuffer and instantiate when streaming fails', async () => {
    const log: string[] = [];
    const { deps: d } = deps({
      instantiateStreaming: async () => {
        log.push('streaming');
        throw new TypeError('Load failed');
      },
      fetchUrl: async () => {
        log.push('fetch');
        return { arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response;
      },
      instantiateBytes: async () => {
        log.push('bytes');
        return { instance, module: module_ };
      },
    });
    expect((await instantiateWithFallback('/x.wasm', imports, d)).ok).toBe(true);
    expect(log).toEqual(['fetch', 'streaming', 'fetch', 'bytes']);
  });

  it('reports a value when the fallback fails too', async () => {
    const { deps: d } = deps({
      instantiateStreaming: async () => {
        throw new TypeError('Load failed');
      },
      instantiateBytes: async () => {
        throw new Error('bad wasm');
      },
    });
    const result = await instantiateWithFallback('/x.wasm', imports, d);
    expect(result).toEqual({ ok: false, reason: 'bad wasm' });
  });
});
