/**
 * `.ornpkg` unpack (docs/PERSISTENCE.md §6, §8, IMPLEMENTATION_PLAN.md §2 step 3.6). fflate's `unzipSync`
 * pre-allocates each entry's OUTPUT buffer at the zip's own declared "original size" and decompresses INTO
 * that fixed buffer (`node_modules/fflate`'s `unzipSync`) — so a zip bomb (a tiny compressed stream that
 * would inflate to gigabytes) cannot allocate more than the declared size, and the `filter` callback below
 * additionally rejects any entry whose DECLARED size already exceeds its own cap before fflate even attempts
 * to inflate it. `manifest.json` is required; `dataset.json`'s SHA-256 must match the manifest or the whole
 * import is refused (never a partial result); everything else (unsafe/duplicate names, files the manifest
 * never named, manifest entries with no file, an asset's own hash mismatch) is reported, never silent, and
 * never fatal on its own.
 */
import { unzipSync } from 'fflate';
import { IMPORT_LIMITS, type ImportRejectionCode, type PackageEntryIssue } from './contracts';
import { sha256Hex } from './hash';

const MANIFEST_MAX_BYTES = 10 * 1024 * 1024;
const MANIFEST_PATH = 'manifest.json';
const DATASET_PATH = 'dataset.json';
const ASSET_PREFIX = 'assets/';

/** Thrown from the entry filter to stop reading the archive directory at once (caught below, never escapes). */
class EntryCapExceeded extends Error {}

export interface UnpackedPackage {
  readonly datasetText: string;
  /** sha256 -> bytes, only for `assets/<sha256>.<ext>` entries whose bytes match their manifest-declared hash. */
  readonly assetBytesBySha256: ReadonlyMap<string, Uint8Array>;
  readonly packageIssues: readonly PackageEntryIssue[];
  /** Manifest-declared asset hashes whose actual bytes did NOT match (magic-byte check is the caller's: it needs the parsed dataset to know each asset's declared media type). */
  readonly assetHashMismatches: readonly { readonly sha256: string; readonly path: string }[];
}

export type PackageUnpackOutcome = { readonly ok: true; readonly unpacked: UnpackedPackage } | { readonly ok: false; readonly code: ImportRejectionCode; readonly message: string };

function unsafeNameReason(name: string): string | undefined {
  if (name.length === 0) return 'empty entry name';
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return 'an absolute path';
  if (name.split('/').includes('..')) return 'contains ".."';
  if (name.includes('\\')) return 'contains a backslash';
  return undefined;
}

function capFor(name: string): number | undefined {
  if (name === MANIFEST_PATH) return MANIFEST_MAX_BYTES;
  if (name === DATASET_PATH) return IMPORT_LIMITS.maxJsonBytes;
  if (name.startsWith(ASSET_PREFIX)) return IMPORT_LIMITS.maxAssetBytes;
  return undefined;
}

interface ManifestFile {
  readonly path: string;
  readonly sha256: string;
}

interface ParsedManifest {
  readonly format: unknown;
  readonly files: readonly ManifestFile[];
}

function readManifest(bytes: Uint8Array): ParsedManifest | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { files?: unknown }).files)) return undefined;
  const files = (raw as { files: unknown[] }).files.filter(
    (f): f is ManifestFile => typeof f === 'object' && f !== null && typeof (f as ManifestFile).path === 'string' && typeof (f as ManifestFile).sha256 === 'string',
  );
  return { format: (raw as { format?: unknown }).format, files };
}

/** `limits.maxEntries` exists so a test can reach the cap without building a 65,536-entry archive. */
export async function unpackPackage(bytes: Uint8Array, limits: { readonly maxEntries: number } = { maxEntries: IMPORT_LIMITS.maxPackageEntries }): Promise<PackageUnpackOutcome> {
  const packageIssues: PackageEntryIssue[] = [];
  const seenNames = new Set<string>();
  let totalAccepted = 0;
  let entriesSeen = 0;

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        entriesSeen += 1;
        if (entriesSeen > limits.maxEntries) throw new EntryCapExceeded();
        const unsafe = unsafeNameReason(file.name);
        if (unsafe !== undefined) {
          packageIssues.push({ path: file.name, reason: `unsafe entry name: ${unsafe}` });
          return false;
        }
        if (seenNames.has(file.name)) {
          packageIssues.push({ path: file.name, reason: 'duplicate entry name' });
          return false;
        }
        const cap = capFor(file.name);
        if (cap === undefined) {
          packageIssues.push({ path: file.name, reason: 'unexpected path in the package (not manifest.json, dataset.json or assets/…)' });
          return false;
        }
        if (file.originalSize > cap) {
          packageIssues.push({ path: file.name, reason: `declared size ${file.originalSize} exceeds the ${cap}-byte cap for this kind of entry` });
          return false;
        }
        if (totalAccepted + file.originalSize > IMPORT_LIMITS.maxPackageBytes) {
          packageIssues.push({ path: file.name, reason: 'total inflated size of the package exceeds the cap' });
          return false;
        }
        seenNames.add(file.name);
        totalAccepted += file.originalSize;
        return true;
      },
    });
  } catch (error) {
    if (error instanceof EntryCapExceeded) {
      return { ok: false, code: 'PACKAGE_INVALID', message: `the package has more than ${limits.maxEntries} entries; refused before any entry was inflated` };
    }
    return { ok: false, code: 'PACKAGE_INVALID', message: `not a readable zip archive: ${error instanceof Error ? error.message : String(error)}` };
  }

  const manifestBytes = files[MANIFEST_PATH];
  if (manifestBytes === undefined) return { ok: false, code: 'PACKAGE_INVALID', message: 'the package has no manifest.json' };
  const manifest = readManifest(manifestBytes);
  if (manifest === undefined) return { ok: false, code: 'PACKAGE_INVALID', message: 'manifest.json is not a readable ORN package manifest' };

  const manifestByPath = new Map(manifest.files.map((f) => [f.path, f] as const));
  const datasetEntry = manifestByPath.get(DATASET_PATH);
  const datasetBytes = files[DATASET_PATH];
  if (datasetEntry === undefined || datasetBytes === undefined) {
    return { ok: false, code: 'PACKAGE_INVALID', message: 'dataset.json is missing from the manifest or the package' };
  }
  const datasetHash = await sha256Hex(datasetBytes);
  if (datasetHash !== datasetEntry.sha256) {
    return { ok: false, code: 'PACKAGE_INVALID', message: 'dataset.json does not match the hash in manifest.json' };
  }

  // Every extracted file the manifest never named (excluding manifest.json/dataset.json, already handled).
  for (const path of Object.keys(files)) {
    if (path === MANIFEST_PATH || path === DATASET_PATH) continue;
    if (!manifestByPath.has(path)) packageIssues.push({ path, reason: 'present in the package but not named in the manifest' });
  }
  // Every manifest entry (other than dataset.json) with no matching file.
  for (const entry of manifest.files) {
    if (entry.path === DATASET_PATH) continue;
    if (files[entry.path] === undefined) packageIssues.push({ path: entry.path, reason: 'named in the manifest but has no file in the package' });
  }

  const assetBytesBySha256 = new Map<string, Uint8Array>();
  const assetHashMismatches: { sha256: string; path: string }[] = [];
  for (const entry of manifest.files) {
    if (entry.path === DATASET_PATH || !entry.path.startsWith(ASSET_PREFIX)) continue;
    const assetBytes = files[entry.path];
    if (assetBytes === undefined) continue; // already reported above
    const hash = await sha256Hex(assetBytes);
    if (hash === entry.sha256) assetBytesBySha256.set(entry.sha256, assetBytes);
    else assetHashMismatches.push({ sha256: entry.sha256, path: entry.path });
  }

  return {
    ok: true,
    unpacked: { datasetText: new TextDecoder().decode(datasetBytes), assetBytesBySha256, packageIssues, assetHashMismatches },
  };
}
