/**
 * Step 4.2e (PERFORMANCE_ARCHITECTURE.md §2 "Export full dataset" < 2 s), design tier. Export through the compute worker:
 *  - the worker's code alone (`exportBuild` of the real handlers over a loaded replica, no thread, no messages): both formats,
 *    `assets: 'none'`, dense and hub_explosion, the same shapes as the Phase 3 export bench so the rows compare;
 *  - a REAL thread, end to end (wall clock: settle, plan, read bytes on main, build, result back): both formats;
 *  - the first asset-bearing export: the design-tier dense state plus 20 synthetic PNG-signature assets of 1 MiB each (20 MiB
 *    in total, incompressible filler, real SHA-256; `withSyntheticAssets`), `.ornpkg` with assets 'package' and `.orn.json`
 *    with assets 'embed', in the worker's code and through the real thread, and what main does alone (copying the bytes it
 *    transfers). The bytes come from an in-memory map: IndexedDB reads are I/O, not ours.
 * Run once, alone; not `bench:baseline`, not `bench:compare`.
 */
import { afterAll, bench, describe } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import type { CanonicalState } from '@/core/schema';
import type { ExportOptions } from '@/io';
import { providerOf, withSyntheticAssets } from '@/test-support/asset-kit';
import { EXPORTED_AT } from '@/test-support/compute-export-kit';
import { TEST_GENERATOR } from '@/test-support/compute-rig';
import { SLOW_BENCH_OPTIONS, tierState } from '@/test-support/perf-kit';
import { spawnComputeWorker } from '@/test-support/rpc-node-port';
import { createComputeExport } from '@/workers/compute/export-main';
import { createComputeHandlers } from '@/workers/compute/handlers';
import { createReplicaSync } from '@/workers/compute/sync';
import type { ExportFormat, RpcCallContext } from '@/workers/rpc/contracts';

const ctx: RpcCallContext = { signal: new AbortController().signal, progress: () => undefined };
const NONE: ExportOptions = { scope: 'full', includeDependencies: false, assets: 'none' };
const FORMATS: readonly (readonly [string, ExportFormat])[] = [
  ['.orn.json', 'orn.json'],
  ['.ornpkg', 'ornpkg'],
];
const ASSET_COUNT = 20;
const ASSET_BYTES = 1024 * 1024;

const fail = (what: string, answer: unknown): never => {
  throw new Error(`bench: ${what} failed: ${JSON.stringify(answer).slice(0, 300)}`);
};

async function loadedHandlers(state: CanonicalState) {
  const { api } = createComputeHandlers();
  await api.loadReplica({ state, revision: 1 }, ctx);
  return api;
}

for (const shape of ['dense', 'hub_explosion'] as const) {
  describe(`export full dataset in the worker code (design tier, ${shape})`, async () => {
    const api = await loadedHandlers(tierState('design', shape));
    for (const [label, format] of FORMATS) {
      bench(
        `${label}`,
        async () => {
          const built = await api.exportBuild({ options: NONE, format, revision: 1, assets: [], exportedAt: EXPORTED_AT, generator: TEST_GENERATOR }, ctx);
          if (!built.ok) fail('exportBuild', built);
        },
        SLOW_BENCH_OPTIONS,
      );
    }
  });
}

describe('export full dataset through a real thread (design tier, dense): end to end, wall clock', async () => {
  const state = tierState('design', 'dense');
  const store = createCanonicalStore({ initial: state, validateInitial: false });
  const sync = createReplicaSync({ store, factory: () => spawnComputeWorker() });
  afterAll(() => sync.stop());
  await sync.settled();
  const flow = createComputeExport({ sync, store, assetBytes: async () => undefined, ids: { now: () => EXPORTED_AT }, generator: TEST_GENERATOR });
  for (const [label, format] of FORMATS) {
    bench(
      `${label}`,
      async () => {
        const exported = await flow.export({ format, options: NONE });
        if (!exported.ok) fail('export', exported);
      },
      SLOW_BENCH_OPTIONS,
    );
  }
});

const made = await withSyntheticAssets(tierState('design', 'dense'), { count: ASSET_COUNT, bytesEach: ASSET_BYTES });
const listed = Object.keys(made.state.records.asset)
  .sort()
  .map((assetId) => ({ assetId: assetId as never, sha256: (made.state.records.asset[assetId as never] as { sha256: string }).sha256 }));
const ASSET_CASES = [
  ['.ornpkg, assets package', 'ornpkg', { scope: 'full', includeDependencies: false, assets: 'package' }],
  ['.orn.json, assets embed', 'orn.json', { scope: 'full', includeDependencies: false, assets: 'embed' }],
] as const;

describe("asset-bearing export in the worker's code (design tier, dense, 20 assets of 1 MiB = 20 MiB)", async () => {
  const api = await loadedHandlers(made.state);
  for (const [label, format, options] of ASSET_CASES) {
    bench(
      `${label}: exportBuild, the bytes already in the worker`,
      async () => {
        // A fresh copy per run: the handler owns the buffers it is given (a transfer would have moved them).
        const assets = listed.map((asset) => ({ ...asset, bytes: (made.bytes.get(asset.assetId) as Uint8Array).slice() }));
        const built = await api.exportBuild({ options, format, revision: 1, assets, exportedAt: EXPORTED_AT, generator: TEST_GENERATOR }, ctx);
        if (!built.ok) fail('exportBuild', built);
      },
      SLOW_BENCH_OPTIONS,
    );
  }
});

describe('asset-bearing export, what main does alone (20 assets of 1 MiB = 20 MiB)', () => {
  bench(
    'read 20 assets through the provider and copy each for the transfer',
    async () => {
      const provider = providerOf(made.bytes);
      let total = 0;
      for (const asset of listed) total += ((await provider(asset.assetId, asset.sha256)) as Uint8Array).slice().byteLength;
      if (total !== ASSET_COUNT * ASSET_BYTES) fail('copy', total);
    },
    SLOW_BENCH_OPTIONS,
  );
});

describe('asset-bearing export through a real thread (design tier, dense, 20 MiB): end to end, wall clock', async () => {
  const store = createCanonicalStore({ initial: made.state, validateInitial: false });
  const sync = createReplicaSync({ store, factory: () => spawnComputeWorker() });
  afterAll(() => sync.stop());
  await sync.settled();
  const flow = createComputeExport({ sync, store, assetBytes: providerOf(made.bytes), ids: { now: () => EXPORTED_AT }, generator: TEST_GENERATOR });
  for (const [label, format, options] of ASSET_CASES) {
    bench(
      `${label}: settle + plan + read + build + result back`,
      async () => {
        const exported = await flow.export({ format, options });
        if (!exported.ok || exported.result.missingAssets.length > 0) fail('export', exported);
      },
      SLOW_BENCH_OPTIONS,
    );
  }
});
