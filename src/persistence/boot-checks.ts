/** Small pure parts of boot: what an open failure means, and the tolerant uiState restore. */
import type { JsonValue } from '@/core/schema';
import { describeError } from './events';
import type { UiStateValidators } from './boot-ports';
import type { OpenResult } from './contracts';
import type { UiStateRow } from './db';

const MAX_JSON_NODES = 100_000;
const MAX_JSON_DEPTH = 64;

/** Plain JSON only (what `JsonValue` promises), bounded in size and depth; iterative, so no recursion limit. */
export function isJsonValue(value: unknown): boolean {
  const stack: { readonly value: unknown; readonly depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const { value: v, depth } = stack.pop() as { value: unknown; depth: number };
    nodes += 1;
    if (nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) return false;
    if (v === null || typeof v === 'string' || typeof v === 'boolean') continue;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return false;
      continue;
    }
    if (Array.isArray(v)) {
      for (const item of v) stack.push({ value: item, depth: depth + 1 });
      continue;
    }
    if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      for (const item of Object.values(v as object)) stack.push({ value: item, depth: depth + 1 });
      continue;
    }
    return false;
  }
  return true;
}

export interface RestoredUiState {
  readonly valid: Readonly<Record<string, JsonValue>>;
  /** Keys whose value is not plain JSON or failed the caller's validator for that key. */
  readonly reset: readonly string[];
}

/** Tolerant: an invalid entry never blocks boot (PERSISTENCE.md §13); it is reset and reported. */
export function restoreUiState(rows: readonly UiStateRow[], validators: UiStateValidators = {}): RestoredUiState {
  const valid: Record<string, JsonValue> = {};
  const reset: string[] = [];
  for (const row of [...rows].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))) {
    const check = validators[row.key];
    let ok = isJsonValue(row.value);
    if (ok && check !== undefined) {
      try {
        ok = check(row.value);
      } catch {
        ok = false;
      }
    }
    if (ok) valid[row.key] = row.value as JsonValue;
    else reset.push(row.key);
  }
  return { valid, reset };
}

function namesOf(error: unknown, depth = 0): string[] {
  if (typeof error !== 'object' || error === null || depth > 3) return [];
  const { name, inner } = error as { name?: unknown; inner?: unknown };
  return [...(typeof name === 'string' ? [name] : []), ...namesOf(inner, depth + 1)];
}

/** An open that failed: IndexedDB missing, refused (private mode, policy) or out of quota. */
export function unavailable(error: unknown): Extract<OpenResult, { mode: 'unavailable' }> {
  const names = namesOf(error);
  const reason = names.includes('QuotaExceededError')
    ? 'private_mode_quota'
    : names.some((n) => ['MissingAPIError', 'SecurityError', 'InvalidStateError', 'OpenFailedError', 'VersionError'].includes(n))
      ? 'indexeddb_blocked'
      : 'unknown';
  return { mode: 'unavailable', reason, detail: describeError(error) };
}
