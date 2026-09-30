/**
 * Helpers for the tests of export in the compute worker (step 4.2e): the whole worker-side rig in memory (real handlers behind
 * an in-memory port pair, a real store on the real adapter over fake IndexedDB, the real replica sync, the real export flow over
 * a bytes provider that logs what it was asked) and `inProcessExport`, the Phase 3 export of the same state with the same
 * clock and generator, the reference INV-19 compares with. Test-only.
 */
import type { StoreHandle } from '@/core/commands';
import type { CanonicalState } from '@/core/schema';
import { buildOrnJsonExport, buildOrnPackageExport, type AssetBytesProvider, type ExportBuildResult, type ExportOptions } from '@/io';
import { SNAPSHOT_GENERATOR } from '@/workers/compute/snapshot-build';
import { createComputeExport, type ComputeExport } from '@/workers/compute/export-main';
import type { ExportFormat } from '@/workers/rpc/contracts';
import { persistedStore } from './compute-import-kit';
import { rig, type Rig, type RigOptions } from './compute-rig';
import type { TestAdapter } from './persistence-kit';

export const EXPORTED_AT = '2026-09-30T12:00:00.000Z';

export interface ExportRig {
  readonly store: StoreHandle;
  readonly t: TestAdapter;
  readonly r: Rig;
  readonly flow: ComputeExport;
  /** The asset IDs main's provider was asked for, in order. */
  readonly asked: string[];
  /** Replaces the provider for one test (default: the map given to `exportRig`). */
  provider: AssetBytesProvider;
}

export async function exportRig(state: CanonicalState, bytes: ReadonlyMap<string, Uint8Array> = new Map(), options: { readonly rig?: Omit<RigOptions, 'store'> } = {}): Promise<ExportRig> {
  const { store, t } = await persistedStore(state);
  const r = rig({ store, ...options.rig });
  await r.sync.settled();
  const asked: string[] = [];
  const held: { provider: AssetBytesProvider } = { provider: async (assetId) => bytes.get(assetId) };
  const flow = createComputeExport({
    sync: r.sync,
    store,
    assetBytes: (assetId, sha256) => {
      asked.push(assetId);
      return held.provider(assetId, sha256);
    },
    ids: { now: () => EXPORTED_AT },
  });
  return {
    store,
    t,
    r,
    flow,
    asked,
    get provider() {
      return held.provider;
    },
    set provider(next) {
      held.provider = next;
    },
  };
}

/** The Phase 3 export, in process, with the worker's clock and generator (the reference of INV-19). */
export async function inProcessExport(state: CanonicalState, format: ExportFormat, options: ExportOptions, assetBytes: AssetBytesProvider = async () => undefined): Promise<ExportBuildResult> {
  const deps = { exportedAt: EXPORTED_AT, generator: SNAPSHOT_GENERATOR, assetBytes };
  return format === 'orn.json' ? buildOrnJsonExport(state, options, deps) : buildOrnPackageExport(state, options, deps);
}

export const FORMATS: readonly ExportFormat[] = ['orn.json', 'ornpkg'];
