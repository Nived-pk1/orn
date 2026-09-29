/**
 * Safe JSON parsing (docs/PERSISTENCE.md §6, ADV-035, IMPLEMENTATION_PLAN.md §2 step 3.6): the bounded
 * pre-scan (`json-caps.ts`) runs first; only then `JSON.parse` (native, safe by itself — it builds OWN data
 * properties even for a key literally named `__proto__`, never touching the prototype chain). What is
 * NOT safe is anything downstream that later does `target[key] = value` on a plain object literal with an
 * untrusted `key`: if `key` is exactly `"__proto__"`, that bracket assignment reassigns the object's
 * prototype instead of creating a property. `sanitizeUnsafeKeys` renames `__proto__`/`constructor`/
 * `prototype` at any depth to `__unsafe_key__…` BEFORE the value reaches any such code, so no later
 * consumer (a schema parse, a merge, a spread) ever sees one of those three key names again.
 */
import type { JsonValue } from '@/core/schema';
import type { UnsafeKeyRename } from './contracts';
import { scanJsonCaps, type CapScanLimits } from './json-caps';

const DANGEROUS_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

export type SafeJsonResult =
  | { readonly ok: true; readonly value: JsonValue; readonly unsafeKeysRenamed: readonly UnsafeKeyRename[] }
  | { readonly ok: false; readonly code: 'TOO_DEEP' | 'STRING_TOO_LONG' | 'INVALID_JSON'; readonly message: string };

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function uniqueKey(existing: Record<string, JsonValue>, base: string): string {
  if (!hasOwn(existing, base)) return base;
  let n = 2;
  while (hasOwn(existing, `${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

/**
 * Bounded by the depth the pre-scan already proved (`json-caps.ts`), so ordinary recursion here never
 * risks the call stack (CLAUDE.md's non-negotiable is UNBOUNDED recursion).
 */
function rewrite(node: JsonValue, path: string, renamed: UnsafeKeyRename[]): JsonValue {
  if (Array.isArray(node)) return node.map((item, i) => rewrite(item, `${path}[${i}]`, renamed));
  if (node === null || typeof node !== 'object') return node;
  const source = node as Record<string, JsonValue>;
  const out: Record<string, JsonValue> = {};
  for (const key of Object.keys(source)) {
    const dangerous = DANGEROUS_KEYS.has(key);
    // Disambiguate on EVERY insert, not only a rename: an ordinary key arriving after a renamed one (in
    // JSON's own key order) must never silently overwrite it, and vice versa (CLAUDE.md §1.5).
    const useKey = uniqueKey(out, dangerous ? `__unsafe_key__${key}` : key);
    if (dangerous) renamed.push({ path, originalKey: key });
    out[useKey] = rewrite(source[key] as JsonValue, path === '' ? useKey : `${path}.${useKey}`, renamed);
  }
  return out;
}

export function sanitizeUnsafeKeys(root: JsonValue): { readonly value: JsonValue; readonly unsafeKeysRenamed: readonly UnsafeKeyRename[] } {
  const renamed: UnsafeKeyRename[] = [];
  const value = rewrite(root, '', renamed);
  return { value, unsafeKeysRenamed: renamed };
}

export function parseJsonSafely(text: string, limits: CapScanLimits): SafeJsonResult {
  const scan = scanJsonCaps(text, limits);
  if (!scan.ok) return { ok: false, code: scan.code, message: scan.message };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, code: 'INVALID_JSON', message: error instanceof Error ? error.message : 'invalid JSON' };
  }
  const { value, unsafeKeysRenamed } = sanitizeUnsafeKeys(raw as JsonValue);
  return { ok: true, value, unsafeKeysRenamed };
}
