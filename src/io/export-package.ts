/**
 * `.ornpkg` export (docs/PERSISTENCE.md §8): an fflate zip — `manifest.json` (format, schemaVersion, one
 * `{ path, sha256 }` entry per file), `dataset.json`, `assets/<sha256>.<ext>`. Determinism (INV-19): every
 * entry uses one FIXED modification time (never the current time) and a fixed entry order (manifest, dataset,
 * then assets sorted by sha256), so the same state and clock give byte-identical bytes on every run. A signal
 * aborted mid-export returns a value with no partial bytes; progress is reported once per included asset plus
 * once for the final zip step.
 */
import { zipSync, type Zippable } from 'fflate';
import { serializeDocument } from '@/core/dataset';
import { PACKAGE_FORMAT, CURRENT_SCHEMA_VERSION, type AssetId, type CanonicalState, type DatasetDocument } from '@/core/schema';
import type { ASSET_MEDIA_TYPES } from '@/core/schema';
import type { AssetBytesProvider, ExportBuildResult, ExportOptions, TaskOptions } from './contracts';
import { buildScopedDocument } from './export-document';
import { sha256Hex } from './hash';

export interface OrnPackageExportDeps {
  readonly exportedAt: string;
  readonly generator: DatasetDocument['generator'];
  readonly assetBytes: AssetBytesProvider;
}

/**
 * Never the current time (INV-19): every entry in every `.ornpkg` this app ever writes carries the same mtime.
 * The ZIP (MS-DOS) date format only represents 1980-2099, so this is the ZIP format's own epoch, not Unix's.
 */
const FIXED_ZIP_MTIME = new Date('1980-01-01T00:00:00.000Z');
const ZIP_LEVEL = 6;

const EXTENSION_OF_MEDIA_TYPE: Readonly<Record<(typeof ASSET_MEDIA_TYPES)[number], string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export async function buildOrnPackageExport(state: CanonicalState, options: ExportOptions, deps: OrnPackageExportDeps, task: TaskOptions = {}): Promise<ExportBuildResult> {
  const scoped = buildScopedDocument(state, options, deps);
  const document = scoped.document;
  const serialized = serializeDocument(document);
  if (!serialized.ok) {
    return { ok: false, code: 'SERIALIZE_FAILED', message: serialized.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ') };
  }
  const datasetBytes = new TextEncoder().encode(serialized.text);

  const missingAssets: { readonly assetId: AssetId; readonly sha256: string }[] = [];
  const wantsAssetFiles = (options.assets === 'embed' || options.assets === 'package') && document.records.asset.length > 0;
  const total = (wantsAssetFiles ? document.records.asset.length : 0) + 1;
  let done = 0;
  const assetFiles: { readonly path: string; readonly sha256: string; readonly bytes: Uint8Array }[] = [];

  if (wantsAssetFiles) {
    // Fixed order: sorted by sha256, independent of any other iteration order.
    const sorted = [...document.records.asset].sort((a, b) => (a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0));
    for (const asset of sorted) {
      if (task.signal?.aborted === true) return { ok: false, code: 'CANCELLED', message: 'export aborted' };
      const bytes = await deps.assetBytes(asset.id, asset.sha256);
      done += 1;
      task.onProgress?.(done, total, `asset ${asset.id}`);
      if (bytes === undefined) {
        missingAssets.push({ assetId: asset.id, sha256: asset.sha256 });
        continue;
      }
      assetFiles.push({ path: `assets/${asset.sha256}.${EXTENSION_OF_MEDIA_TYPE[asset.mediaType]}`, sha256: asset.sha256, bytes });
    }
  }

  if (task.signal?.aborted === true) return { ok: false, code: 'CANCELLED', message: 'export aborted' };
  const datasetSha256 = await sha256Hex(datasetBytes);
  const manifest = {
    format: PACKAGE_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    files: [{ path: 'dataset.json', sha256: datasetSha256 }, ...assetFiles.map(({ path, sha256 }) => ({ path, sha256 }))],
  };
  const manifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);

  const zip: Zippable = {};
  zip['manifest.json'] = [manifestBytes, { mtime: FIXED_ZIP_MTIME, level: ZIP_LEVEL }];
  zip['dataset.json'] = [datasetBytes, { mtime: FIXED_ZIP_MTIME, level: ZIP_LEVEL }];
  for (const file of assetFiles) zip[file.path] = [file.bytes, { mtime: FIXED_ZIP_MTIME, level: ZIP_LEVEL }];
  done += 1;
  task.onProgress?.(done, total, 'zip');

  return {
    ok: true,
    result: { bytes: zipSync(zip, { level: ZIP_LEVEL }), counts: scoped.counts, missingAssets, missingReferences: scoped.missingReferences },
  };
}
