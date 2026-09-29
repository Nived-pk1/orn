/**
 * Format detection (docs/MIGRATION.md §4.1, IMPLEMENTATION_PLAN.md §2 step 3.6): a discriminated result over
 * the already safely-parsed top-level JSON value. Container detection (zip vs plain JSON text) happens one
 * level up, on the raw bytes, before anything here is even reached.
 */
import { DATASET_FORMAT, type JsonValue } from '@/core/schema';
import type { DetectFormatResult } from './contracts';

const ZIP_SIGNATURE: readonly number[] = [0x50, 0x4b]; // 'PK'

/** True for the first few bytes of a `.ornpkg` (or any zip): local-file, empty-archive or spanned-archive markers. */
export function looksLikeZip(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== ZIP_SIGNATURE[0] || bytes[1] !== ZIP_SIGNATURE[1]) return false;
  return bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07;
}

function isPlainObject(value: JsonValue): value is Record<string, JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** v6 "Export JSON": `{ compounds[], reactions[], schemaVersion: 5 }` (MIGRATION.md §4.1). */
function isLegacyV6(value: Record<string, JsonValue>): boolean {
  return Array.isArray(value['compounds']) && Array.isArray(value['reactions']) && value['schemaVersion'] === 5;
}

/** v4 prototype data: any reaction lacking a `participants` array (MIGRATION.md §4.1's stated detection rule). */
function isLegacyV4(value: Record<string, JsonValue>): boolean {
  const reactions = value['reactions'];
  if (!Array.isArray(reactions) || reactions.length === 0) return false;
  return reactions.some((r) => !(isPlainObject(r) && Array.isArray(r['participants'])));
}

export function detectFormat(value: JsonValue): DetectFormatResult {
  if (!isPlainObject(value)) return { ok: false, reason: 'the top level of the file is not a JSON object' };
  if (value['format'] === DATASET_FORMAT && typeof value['schemaVersion'] === 'number') return { ok: true, format: 'orn.dataset' };
  // v6 is checked first: its schemaVersion === 5 marker is exact and unambiguous, unlike v4's "missing a field" rule.
  if (isLegacyV6(value)) return { ok: true, format: 'legacy_v6' };
  if (isLegacyV4(value)) return { ok: true, format: 'legacy_v4' };
  return { ok: false, reason: 'not an ORN dataset (format/schemaVersion) and not a recognised legacy export (MIGRATION.md §4.1)' };
}
