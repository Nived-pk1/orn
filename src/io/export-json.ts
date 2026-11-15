/**
 * `.orn.json` export (docs/PERSISTENCE.md §8): one deterministic `DatasetDocument` (INV-19). `assets: 'embed'`
 * embeds asset bytes as base64 (`embeddedAssets`); `'none'`/`'package'` write no bytes (a package's assets are
 * separate files — meaningless for a single JSON file, so treated the same as `'none'` here). A signal aborted
 * mid-export returns a value with no partial bytes (IMPLEMENTATION_PLAN.md §2 step 3.5); progress is reported
 * once per included asset plus once for the final serialise.
 */
import { serializeDocument } from '@/core/dataset';
import type { AssetId, CanonicalState, DatasetDocument } from '@/core/schema';
import { IMPORT_LIMITS, type AssetBytesProvider, type ExportBuildResult, type ExportOptions, type MissingAsset, type TaskOptions } from './contracts';
import { readAssetBytes } from './export-assets';
import { buildScopedDocument } from './export-document';

export interface OrnJsonExportDeps {
  readonly exportedAt: string;
  readonly generator: DatasetDocument['generator'];
  readonly assetBytes: AssetBytesProvider;
}

const BASE64_CHUNK = 0x8000;

/** `btoa` needs a "binary string"; chunked to avoid a call-stack overflow on a large asset (cap 20 MB). */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let at = 0; at < bytes.length; at += BASE64_CHUNK) binary += String.fromCharCode(...bytes.subarray(at, at + BASE64_CHUNK));
  return btoa(binary);
}

export async function buildOrnJsonExport(state: CanonicalState, options: ExportOptions, deps: OrnJsonExportDeps, task: TaskOptions = {}): Promise<ExportBuildResult> {
  const scoped = buildScopedDocument(state, options, deps);
  let document = scoped.document;
  const missingAssets: MissingAsset[] = [];
  const assetRecords = document.records.asset;
  const embedAssets = options.assets === 'embed' && assetRecords.length > 0;
  const total = (embedAssets ? assetRecords.length : 0) + 1;
  let done = 0;

  if (embedAssets) {
    const embedded: { readonly assetId: AssetId; readonly base64: string }[] = [];
    for (const asset of assetRecords) {
      if (task.signal?.aborted === true) return { ok: false, code: 'CANCELLED', message: 'export aborted' };
      const read = await readAssetBytes(deps.assetBytes, asset.id, asset.sha256);
      done += 1;
      task.onProgress?.(done, total, `asset ${asset.id}`);
      if (!read.ok) {
        missingAssets.push(read.missing);
        continue;
      }
      embedded.push({ assetId: asset.id, base64: toBase64(read.bytes) });
    }
    if (embedded.length > 0) document = { ...document, embeddedAssets: embedded };
  }

  if (task.signal?.aborted === true) return { ok: false, code: 'CANCELLED', message: 'export aborted' };
  const serialized = serializeDocument(document);
  done += 1;
  task.onProgress?.(done, total, 'serialize');
  if (!serialized.ok) {
    return { ok: false, code: 'SERIALIZE_FAILED', message: serialized.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ') };
  }
  const bytes = new TextEncoder().encode(serialized.text);
  // a one-file backup the importer would refuse for its size is never written (step 8.4s, S2); the package has no such cap on its pictures
  if (bytes.length > IMPORT_LIMITS.maxJsonBytes) {
    return { ok: false, code: 'SERIALIZE_FAILED', message: 'This backup is too large for one file. Choose Package (.ornpkg).' };
  }
  return {
    ok: true,
    result: { bytes, counts: scoped.counts, missingAssets, missingReferences: scoped.missingReferences },
  };
}
