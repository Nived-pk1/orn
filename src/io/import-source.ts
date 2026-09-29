/**
 * Top-level import parse (docs/PERSISTENCE.md §6, IMPLEMENTATION_PLAN.md §2 step 3.6): caps → safe parse →
 * format detection → (package unpack, if a zip) → migration → per-record L1 → quarantine → asset
 * verification. The result is plain data (no Map/Set/class) for step 3.7 to consume; nothing is written
 * anywhere. An aborted signal returns a value with no partial result; progress is reported per phase.
 */
import type { MigrationRunner } from '@/core/migrations/contracts';
import type { AnyRecord, JsonValue } from '@/core/schema';
import { resolveAssets } from './asset-resolve';
import { IMPORT_LIMITS, type ImportParseOutcome, type ImportSource, type RejectedAsset, type TaskOptions } from './contracts';
import { detectFormat, looksLikeZip } from './format-detect';
import { parseDatasetEnvelope } from './import-envelope';
import { unpackPackage } from './package-unpack';
import { parseJsonSafely } from './safe-json';

export interface ImportParseDeps {
  readonly runner: MigrationRunner;
}

const EMPTY_RESULT_FIELDS = { migrationsApplied: [], records: {}, counts: {}, quarantined: [], assets: [], rejectedAssets: [], packageIssues: [] } as const;
const CAP_LIMITS = { maxDepth: IMPORT_LIMITS.maxJsonDepth, maxStringLength: IMPORT_LIMITS.maxStringLength };

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * An `embeddedAssets` entry carries `assetId` + `base64`, not its own sha256: this decodes each entry and
 * keys it by the sha256 its matching asset record declares, so `resolveAssets` can treat it exactly like a
 * package's `assets/<sha256>.<ext>` file (which IS named by hash) — one shared verification path either way.
 */
function embeddedAssetBytesBySha256(value: JsonValue, assetRecords: readonly AnyRecord[]): ReadonlyMap<string, Uint8Array> {
  const embedded = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as { embeddedAssets?: unknown }).embeddedAssets : undefined;
  const bySha256 = new Map<string, Uint8Array>();
  if (!Array.isArray(embedded)) return bySha256;
  const shaById = new Map<string, string>(assetRecords.map((r) => [String(r.id), (r as unknown as { sha256: string }).sha256]));
  for (const entry of embedded) {
    if (typeof entry !== 'object' || entry === null) continue;
    const assetId = (entry as { assetId?: unknown }).assetId;
    const base64 = (entry as { base64?: unknown }).base64;
    if (typeof assetId !== 'string' || typeof base64 !== 'string') continue;
    const sha256 = shaById.get(assetId);
    if (sha256 === undefined) continue; // no asset record for this ID; nothing to verify against
    try {
      bySha256.set(sha256, base64ToBytes(base64));
    } catch {
      // Malformed base64: no bytes for this entry; never a whole-file rejection (the asset record still imports).
    }
  }
  return bySha256;
}

function isAborted(task: TaskOptions): boolean {
  return task.signal?.aborted === true;
}

async function parseJsonPath(source: ImportSource, deps: ImportParseDeps, task: TaskOptions): Promise<ImportParseOutcome> {
  if (source.bytes.size > IMPORT_LIMITS.maxJsonBytes) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      message: `the file is ${source.bytes.size} bytes, over the ${IMPORT_LIMITS.maxJsonBytes}-byte JSON cap`,
      detail: { size: source.bytes.size, cap: IMPORT_LIMITS.maxJsonBytes },
    };
  }
  if (isAborted(task)) return { ok: false, code: 'CANCELLED', message: 'import aborted' };
  const text = await source.bytes.text();
  task.onProgress?.(1, 4, 'read');
  if (isAborted(task)) return { ok: false, code: 'CANCELLED', message: 'import aborted' };

  const parsed = parseJsonSafely(text, CAP_LIMITS);
  if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message };
  task.onProgress?.(2, 4, 'parsed');

  const detected = detectFormat(parsed.value);
  if (!detected.ok) return { ok: false, code: 'UNKNOWN_FORMAT', message: detected.reason };

  if (detected.format === 'legacy_v6' || detected.format === 'legacy_v4') {
    return { ok: true, result: { format: detected.format, unsafeKeysRenamed: parsed.unsafeKeysRenamed, legacyPayload: parsed.value, ...EMPTY_RESULT_FIELDS } };
  }

  if (isAborted(task)) return { ok: false, code: 'CANCELLED', message: 'import aborted' };
  const envelope = parseDatasetEnvelope(parsed.value, deps);
  if (!envelope.ok) return envelope;
  task.onProgress?.(3, 4, 'envelope');

  const assetRecords = envelope.data.records.asset ?? [];
  const assetBytes = embeddedAssetBytesBySha256(parsed.value, assetRecords);
  const { assets, rejected } = resolveAssets(assetBytes, assetRecords);
  task.onProgress?.(4, 4, 'assets');

  return {
    ok: true,
    result: {
      format: 'orn.dataset',
      detectedSchemaVersion: envelope.data.detectedSchemaVersion,
      migrationsApplied: envelope.data.migrationsApplied,
      ...(envelope.data.meta === undefined ? {} : { meta: envelope.data.meta }),
      records: envelope.data.records,
      counts: envelope.data.counts,
      quarantined: envelope.data.quarantined,
      unsafeKeysRenamed: parsed.unsafeKeysRenamed,
      assets,
      rejectedAssets: rejected,
      packageIssues: [],
    },
  };
}

async function parsePackagePath(source: ImportSource, deps: ImportParseDeps, task: TaskOptions): Promise<ImportParseOutcome> {
  if (isAborted(task)) return { ok: false, code: 'CANCELLED', message: 'import aborted' };
  const bytes = new Uint8Array(await source.bytes.arrayBuffer());
  task.onProgress?.(1, 4, 'read');
  if (isAborted(task)) return { ok: false, code: 'CANCELLED', message: 'import aborted' };

  const unpacked = await unpackPackage(bytes);
  if (!unpacked.ok) return unpacked;
  task.onProgress?.(2, 4, 'unpacked');

  const parsed = parseJsonSafely(unpacked.unpacked.datasetText, CAP_LIMITS);
  if (!parsed.ok) return { ok: false, code: parsed.code, message: parsed.message };

  const detected = detectFormat(parsed.value);
  if (!detected.ok || detected.format !== 'orn.dataset') {
    return { ok: false, code: 'UNKNOWN_FORMAT', message: "a .ornpkg's dataset.json must be an orn.dataset document" };
  }

  if (isAborted(task)) return { ok: false, code: 'CANCELLED', message: 'import aborted' };
  const envelope = parseDatasetEnvelope(parsed.value, deps);
  if (!envelope.ok) return envelope;
  task.onProgress?.(3, 4, 'envelope');

  const assetRecords = envelope.data.records.asset ?? [];
  const { assets, rejected } = resolveAssets(unpacked.unpacked.assetBytesBySha256, assetRecords);
  const hashMismatchRejections: readonly RejectedAsset[] = unpacked.unpacked.assetHashMismatches.map((m) => ({
    sha256: m.sha256,
    reason: `${m.path}: bytes do not match the manifest's SHA-256`,
  }));
  task.onProgress?.(4, 4, 'assets');

  return {
    ok: true,
    result: {
      format: 'orn.package',
      detectedSchemaVersion: envelope.data.detectedSchemaVersion,
      migrationsApplied: envelope.data.migrationsApplied,
      ...(envelope.data.meta === undefined ? {} : { meta: envelope.data.meta }),
      records: envelope.data.records,
      counts: envelope.data.counts,
      quarantined: envelope.data.quarantined,
      unsafeKeysRenamed: parsed.unsafeKeysRenamed,
      assets,
      rejectedAssets: [...rejected, ...hashMismatchRejections],
      packageIssues: unpacked.unpacked.packageIssues,
    },
  };
}

export async function parseImportSource(source: ImportSource, deps: ImportParseDeps, task: TaskOptions = {}): Promise<ImportParseOutcome> {
  if (source.bytes.size > IMPORT_LIMITS.maxPackageBytes) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      message: `the file is ${source.bytes.size} bytes, over the ${IMPORT_LIMITS.maxPackageBytes}-byte package cap`,
      detail: { size: source.bytes.size, cap: IMPORT_LIMITS.maxPackageBytes },
    };
  }
  const head = new Uint8Array(await source.bytes.slice(0, 4).arrayBuffer());
  return looksLikeZip(head) ? parsePackagePath(source, deps, task) : parseJsonPath(source, deps, task);
}
