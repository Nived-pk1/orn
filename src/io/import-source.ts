/**
 * Top-level import parse (docs/PERSISTENCE.md §6, IMPLEMENTATION_PLAN.md §2 step 3.6): caps → safe parse →
 * format detection → (package unpack, if a zip) → migration → per-record L1 → quarantine → asset
 * verification. The result is plain data (no Map/Set/class) for step 3.7 to consume; nothing is written
 * anywhere. An aborted signal returns a value with no partial result; progress is reported per phase.
 */
import type { MigrationRunner } from '@/core/migrations/contracts';
import type { AnyRecord, AssetId, JsonValue } from '@/core/schema';
import { resolveAssets } from './asset-resolve';
import { IMPORT_LIMITS, type ImportParseOutcome, type ImportSource, type RejectedAsset, type TaskOptions } from './contracts';
import { detectFormat, looksLikeZip } from './format-detect';
import { parseDatasetEnvelope } from './import-envelope';
import { unpackPackage } from './package-unpack';
import { sha256Hex } from './hash';
import { parseJsonSafely } from './safe-json';

export interface ImportParseDeps {
  readonly runner: MigrationRunner;
}

const EMPTY_RESULT_FIELDS = { migrationsApplied: [], records: {}, counts: {}, quarantined: [], kindMismatches: [], assets: [], rejectedAssets: [], packageIssues: [] } as const;
const CAP_LIMITS = { maxDepth: IMPORT_LIMITS.maxJsonDepth, maxStringLength: IMPORT_LIMITS.maxStringLength };

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * An `embeddedAssets` entry carries `assetId` + `base64`, not its own sha256: each is decoded, its SHA-256 computed and
 * compared with the sha256 its matching asset record declares (SECURITY.md §3: "SHA-256 verified"), and only then keyed by
 * it so `resolveAssets` treats it exactly like a package's `assets/<sha256>.<ext>` file — one shared verification path.
 * Every entry that cannot be used is REPORTED as a `RejectedAsset` with a reason (step 3.6 review, item c): a malformed
 * entry, malformed or oversized base64, an ID with no asset record, bytes that do not hash to the record's value. The asset
 * RECORD still imports either way (AST-002 shows the missing bytes later); nothing is thrown and nothing is silent.
 */
async function embeddedAssetBytesBySha256(
  value: JsonValue,
  assetRecords: readonly AnyRecord[],
): Promise<{ readonly bytesBySha256: ReadonlyMap<string, Uint8Array>; readonly rejected: readonly RejectedAsset[] }> {
  const embedded = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as { embeddedAssets?: unknown }).embeddedAssets : undefined;
  const bytesBySha256 = new Map<string, Uint8Array>();
  const rejected: RejectedAsset[] = [];
  if (embedded === undefined) return { bytesBySha256, rejected };
  if (!Array.isArray(embedded)) return { bytesBySha256, rejected: [{ sha256: '', reason: 'embeddedAssets is not an array; no embedded bytes were read' }] };
  const recordById = new Map<string, { readonly id: AssetId; readonly sha256: string }>(
    assetRecords.map((r) => [String(r.id), r as unknown as { id: AssetId; sha256: string }]),
  );
  for (const [index, entry] of embedded.entries()) {
    const assetId = typeof entry === 'object' && entry !== null ? (entry as { assetId?: unknown }).assetId : undefined;
    const base64 = typeof entry === 'object' && entry !== null ? (entry as { base64?: unknown }).base64 : undefined;
    if (typeof assetId !== 'string' || typeof base64 !== 'string') {
      rejected.push({ sha256: '', reason: `embeddedAssets[${index}] has no string assetId and base64` });
      continue;
    }
    const record = recordById.get(assetId);
    if (record === undefined) {
      rejected.push({ sha256: '', reason: `embeddedAssets[${index}] (${assetId}): no asset record with that ID in the import` });
      continue;
    }
    if ((base64.length * 3) / 4 > IMPORT_LIMITS.maxAssetBytes) {
      rejected.push({ sha256: record.sha256, assetId: record.id, reason: `embedded bytes exceed the ${IMPORT_LIMITS.maxAssetBytes}-byte asset cap` });
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(base64);
    } catch {
      rejected.push({ sha256: record.sha256, assetId: record.id, reason: 'embedded bytes are not valid base64' });
      continue;
    }
    if ((await sha256Hex(bytes)) !== record.sha256) {
      rejected.push({ sha256: record.sha256, assetId: record.id, reason: "embedded bytes do not match the record's SHA-256" });
      continue;
    }
    bytesBySha256.set(record.sha256, bytes);
  }
  return { bytesBySha256, rejected };
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
  const embedded = await embeddedAssetBytesBySha256(parsed.value, assetRecords);
  const resolved = resolveAssets(embedded.bytesBySha256, assetRecords);
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
      kindMismatches: envelope.data.kindMismatches,
      assets: resolved.assets,
      rejectedAssets: [...embedded.rejected, ...resolved.rejected],
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
      kindMismatches: envelope.data.kindMismatches,
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
