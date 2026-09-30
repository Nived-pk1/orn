/**
 * Helpers for tests of the import flow (step 3.7): export a state to real bytes, parse them with the real importer, and
 * build an import session over a real store with recording fake ports (snapshots, batch sink, asset stage). Test-only.
 */
import type { StoreHandle } from '@/core/commands';
import { createIdFactory } from '@/core/dataset';
import { migrationRunner } from '@/core/migrations';
import type { CanonicalState } from '@/core/schema';
import {
  buildOrnJsonExport,
  buildOrnPackageExport,
  createImportSession,
  parseImportSource,
  type AssetBytesProvider,
  type AssetStagePort,
  type ImportBatchSink,
  type ImportParseResult,
  type ImportSession,
  type ImportStorePort,
  type OrnJsonExportDeps,
  type ParsedAsset,
  type SnapshotPort,
} from '@/io';
import { mulberry32 } from './command-kit';

export const EXPORT_DEPS: OrnJsonExportDeps = { exportedAt: '2026-09-29T00:00:00.000Z', generator: { app: 'orn-test', version: '1' }, assetBytes: async () => undefined };

export async function exportBytes(
  state: CanonicalState,
  format: 'json' | 'pkg' = 'json',
  assets: 'none' | 'embed' | 'package' = 'none',
  assetBytes: AssetBytesProvider = async () => undefined,
): Promise<Uint8Array> {
  const options = { scope: 'full', includeDependencies: false, assets } as const;
  const deps = { ...EXPORT_DEPS, assetBytes };
  const built = format === 'json' ? await buildOrnJsonExport(state, options, deps) : await buildOrnPackageExport(state, options, deps);
  if (!built.ok) throw new Error(`export failed: ${built.message}`);
  return built.result.bytes;
}

export async function parseBytes(bytes: Uint8Array, fileName = 'import.orn.json'): Promise<ImportParseResult> {
  const outcome = await parseImportSource({ fileName, bytes: new Blob([bytes as BlobPart]) }, { runner: migrationRunner });
  if (!outcome.ok) throw new Error(`parse failed: ${outcome.code} ${outcome.message}`);
  return outcome.result;
}

/** Export → the real parser: what the importer would hand the session for a file of `state`. */
export async function parsedFrom(state: CanonicalState, format: 'json' | 'pkg' = 'json'): Promise<ImportParseResult> {
  return parseBytes(await exportBytes(state, format), format === 'json' ? 'import.orn.json' : 'import.ornpkg');
}

export interface FakePorts {
  /** Everything the flow did, in order: 'snapshot', 'snapshot-deleted', 'replaceState', 'stage', 'clear', 'saveBatch', 'addQuarantine'. */
  readonly calls: string[];
  readonly snapshots: { readonly taken: { readonly reason: string; readonly revision: number; readonly state: CanonicalState }[]; failWith?: Error; duringCreate?: () => void };
  readonly batches: { readonly saved: { readonly id: string; readonly report: unknown }[]; readonly quarantine: { readonly importBatchId: string; readonly issues: readonly string[] }[]; failWith?: Error };
  readonly staged: (readonly ParsedAsset[])[];
  readonly snapshotPort: SnapshotPort;
  readonly sink: ImportBatchSink;
  readonly stage: AssetStagePort;
}

export function fakePorts(): FakePorts {
  const calls: string[] = [];
  const snapshots: FakePorts['snapshots'] = { taken: [] };
  const batches: FakePorts['batches'] = { saved: [], quarantine: [] };
  const staged: (readonly ParsedAsset[])[] = [];
  return {
    calls,
    snapshots,
    batches,
    staged,
    snapshotPort: {
      async createSnapshot(reason, state, revision) {
        calls.push('snapshot');
        if (snapshots.failWith !== undefined) throw snapshots.failWith;
        snapshots.taken.push({ reason, revision, state });
        snapshots.duringCreate?.();
        return { id: `snp_fake-${snapshots.taken.length}` };
      },
      async deleteSnapshot() {
        calls.push('snapshot-deleted');
      },
    },
    sink: {
      async saveImportBatch(row) {
        calls.push('saveBatch');
        if (batches.failWith !== undefined) throw batches.failWith;
        batches.saved.push({ id: row.id, report: row.report });
      },
      async addQuarantine(rows) {
        calls.push('addQuarantine');
        if (batches.failWith !== undefined) throw batches.failWith;
        batches.quarantine.push(...rows.map((r) => ({ importBatchId: r.importBatchId, issues: r.issues })));
        return rows.map((r) => r.id);
      },
    },
    stage: {
      stage(assets) {
        calls.push('stage');
        staged.push(assets);
      },
      clear() {
        calls.push('clear');
      },
    },
  };
}

/** A store view that logs `replaceState` into `calls` (order evidence) and otherwise delegates. */
export function loggingStore(store: StoreHandle, calls: string[]): ImportStorePort {
  return {
    getState: () => store.getState(),
    getRevision: () => store.getRevision(),
    isReadOnly: () => store.isReadOnly(),
    replaceState(next, reason) {
      calls.push('replaceState');
      return store.replaceState(next, reason);
    },
  };
}

export interface TestSession {
  readonly session: ImportSession;
  readonly ports: FakePorts;
}

export function testSession(store: StoreHandle, options: { readonly seed?: number; readonly nowMs?: number; readonly ports?: FakePorts; readonly storePort?: ImportStorePort } = {}): TestSession {
  const ports = options.ports ?? fakePorts();
  const ids = createIdFactory({ nowMs: () => options.nowMs ?? 1_790_000_000_000 }, { next: mulberry32(options.seed ?? 7) });
  const session = createImportSession({
    store: options.storePort ?? loggingStore(store, ports.calls),
    ids,
    snapshots: ports.snapshotPort,
    batches: ports.sink,
    assetStage: ports.stage,
  });
  return { session, ports };
}
