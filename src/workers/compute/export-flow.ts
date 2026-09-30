/**
 * Export in the compute worker (step 4.2e, Phase 4 contract decisions Q1 export part and Q9): the worker side. `planExport`
 * is the scope closure over the replica's state (the same `selectScope` the exporters use) and the asset IDs the chosen
 * format and options will ask bytes of; `buildExportBytes` runs the SAME exporters as the in-process export
 * (`buildOrnJsonExport`, `buildOrnPackageExport`) over the bytes main read and transferred in, so INV-19 holds: the same state,
 * options and clock give the same bytes. The provider is a map lookup; an asset main could not read is answered `undefined` and
 * the exporter reports it in `missingAssets`, never thrown. No chemistry here: what is included is the io layer's decision.
 */
import { buildOrnJsonExport, buildOrnPackageExport, selectScope } from '@/io';
import type { AssetBytesProvider, ExportBuildResult, TaskOptions } from '@/io';
import type { AssetId, CanonicalState } from '@/core/schema';
import { RpcHostError } from '@/workers/rpc/helpers';
import type { ExportBuildParams, ExportFormat, ExportPlanParams } from '@/workers/rpc/contracts';
import { SNAPSHOT_GENERATOR } from './snapshot-build';

export type PlannedAsset = { readonly assetId: AssetId; readonly sha256: string };

/** Does this format read asset bytes for these options? `.orn.json` embeds only on 'embed'; `.ornpkg` writes files on 'embed' and 'package'. */
export function readsAssetBytes(format: ExportFormat, assets: ExportPlanParams['options']['assets']): boolean {
  return format === 'orn.json' ? assets === 'embed' : assets === 'embed' || assets === 'package';
}

export function planExport(state: CanonicalState, params: Pick<ExportPlanParams, 'options' | 'format'>): readonly PlannedAsset[] {
  if (!readsAssetBytes(params.format, params.options.assets)) return [];
  const { included } = selectScope(state, params.options);
  const planned: PlannedAsset[] = [];
  for (const id of Object.keys(state.records.asset).sort()) {
    if (!included.has(id)) continue;
    const record = state.records.asset[id as AssetId];
    if (record !== undefined) planned.push({ assetId: record.id, sha256: record.sha256 });
  }
  return planned;
}

const keyOf = (assetId: string, sha256: string): string => `${assetId}\u0000${sha256}`;

export async function buildExportBytes(state: CanonicalState, params: ExportBuildParams, task: TaskOptions): Promise<ExportBuildResult> {
  const held = new Map<string, Uint8Array>();
  for (const asset of params.assets) held.set(keyOf(asset.assetId, asset.sha256), asset.bytes);
  const assetBytes: AssetBytesProvider = async (assetId, sha256) => held.get(keyOf(assetId, sha256));
  const deps = { exportedAt: params.exportedAt, generator: SNAPSHOT_GENERATOR, assetBytes };
  return params.format === 'orn.json' ? buildOrnJsonExport(state, params.options, deps, task) : buildOrnPackageExport(state, params.options, deps, task);
}

/** `exportedAt` is main's clock: a UTC ISO timestamp with milliseconds (the worker's own clock is monotonic, not a date). */
export function assertUtcInstant(method: string, value: string): void {
  if (Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new RpcHostError('BAD_REQUEST', `${method}: exportedAt must be a UTC ISO timestamp with milliseconds, got ${JSON.stringify(value)}`);
  }
}
