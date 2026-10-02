/**
 * Helpers for the tests of the app flows (step 5.1c): files of the demo and of generated states as Blobs, a "footprint" of a tab
 * (live state, revision, history, every stored row and snapshot) so a failure can be shown to have changed nothing (INV-21), and
 * a one-call import. Test-only.
 */
import { produce } from 'immer';
import type { AppServices, ImportApplyAnswer } from '@/app/services';
import type { AnyRecord, CanonicalState } from '@/core/schema';
import type { ImportPlanRequest } from '@/io';
import { sha256Hex } from '@/io/hash';
import { demoState } from './app-boot-kit';
import type { World } from './app-env-kit';
import { exportBytes } from './import-kit';
import { freshDb } from './persistence-kit';
import { loadFixtureState } from './state-fixture';

export const blobOf = (bytes: Uint8Array): Blob => new Blob([bytes as BlobPart]);

export async function fileOf(state: CanonicalState, format: 'json' | 'pkg' = 'json', assets: 'none' | 'embed' | 'package' = 'none', bytes?: (id: string) => Uint8Array | undefined): Promise<Blob> {
  return blobOf(await exportBytes(state, format, assets, async (id) => bytes?.(id)));
}

export const demoFile = (format: 'json' | 'pkg' = 'json'): Promise<Blob> => fileOf(demoState(), format);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6]);
export const ASSET_ID = 'ast_flow-real-bytes';

/** The maximal fixture plus one asset record whose bytes (`ASSET_BYTES`) really hash to its sha256. */
export async function stateWithAsset(bytes: Uint8Array = PNG, id: string = ASSET_ID): Promise<CanonicalState> {
  const base = loadFixtureState('maximal-valid');
  const template = Object.values(base.records.asset)[0] as unknown as Record<string, unknown>;
  const record = { ...template, id, sha256: await sha256Hex(bytes), byteSize: bytes.length, mediaType: 'image/png' } as unknown as AnyRecord;
  return produce(base, (draft) => {
    (draft.records.asset as Record<string, AnyRecord>)[id] = record;
  });
}
export const ASSET_BYTES = PNG;

export async function packageWithAsset(): Promise<Blob> {
  return fileOf(await stateWithAsset(), 'pkg', 'embed', (id) => (id === ASSET_ID ? PNG : undefined));
}

/** Everything a failed flow must leave alone, as plain comparable values. */
export interface Footprint {
  readonly revision: number;
  readonly state: CanonicalState;
  readonly history: { readonly undo: readonly string[]; readonly redo: readonly string[] };
  /** Stored rows; null for a session-only tab. */
  readonly stored: null | {
    readonly records: string;
    readonly meta: string;
    readonly snapshots: readonly string[];
    readonly batches: readonly string[];
    readonly quarantine: number;
    readonly blobs: readonly string[];
  };
}

export async function footprint(services: AppServices, world: World | undefined): Promise<Footprint> {
  const base = { revision: services.store.getRevision(), state: services.store.getState(), history: services.store.historyLabels() };
  if (world === undefined) return { ...base, stored: null };
  await services.persistence?.flush();
  const tdb = freshDb(undefined, world.indexedDB);
  try {
    const records = (await tdb.db.records.toArray()).sort((a, b) => a.id.localeCompare(b.id));
    const meta = (await tdb.db.meta.toArray()).filter((row) => row.key !== 'lastCleanShutdownAt').sort((a, b) => a.key.localeCompare(b.key));
    return {
      ...base,
      stored: {
        records: JSON.stringify(records),
        meta: JSON.stringify(meta),
        snapshots: (await tdb.db.snapshots.toArray()).map((row) => row.id).sort(),
        batches: (await tdb.db.importBatches.toArray()).map((row) => row.id).sort(),
        quarantine: await tdb.db.quarantine.count(),
        blobs: (await tdb.db.assetBlobs.toArray()).map((row) => String(row.sha256)).sort(),
      },
    };
  } finally {
    tdb.db.close();
  }
}

/** Preview then apply a file; throws on any refusal (a test that wants one calls the flows itself). */
export async function importFile(services: AppServices, file: Blob, name = 'file.orn.json', options?: { readonly inProcess?: boolean; readonly request?: ImportPlanRequest }): Promise<Extract<ImportApplyAnswer, { ok: true }>> {
  const preview = await services.flows.preview(file, name, options?.request, options);
  if (!preview.ok) throw new Error(`preview refused: ${preview.code} ${preview.message}`);
  const applied = await services.flows.apply(preview.plan.preview.batchId, preview.plan, options);
  if (!applied.ok) throw new Error(`apply refused: ${applied.code} ${applied.message}`);
  return applied;
}

