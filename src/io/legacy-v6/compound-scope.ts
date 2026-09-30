/**
 * Bookkeeping for ONE legacy compound while it is mapped: which of its leaves became schema fields (the consumed-path trace), which
 * were kept in `provenance.legacy.unmapped` (and are counted in the report), and the review reasons the record collects. The scope
 * never decides anything; the mapper does, and tells the scope. Review reasons are plain text about the record (values are quoted
 * through `excerpt`, which escapes control and bidi characters and cuts long values: the full value is always in `unmapped`).
 */
import { JsonValueSchema, LIMITS, type JsonValue } from '@/core/schema';
import type { Segment } from './dropped';
import type { ReportBuilder } from './report';
import { generalizePath, type ConsumedTrace } from './trace';

// eslint-disable-next-line no-control-regex -- intentional: finds the characters ShortTextSchema rejects
const FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;
const MAX_REASON_CHARS = 1_900;

/** A value as it may appear in a review reason: quoted, control characters written `\u{hex}`, at most `max` characters. */
export function excerpt(value: unknown, max = 60): string {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
  const escaped = text.replace(FORBIDDEN, (ch) => `\\u{${(ch.codePointAt(0) as number).toString(16)}}`);
  const chars = Array.from(escaped);
  return `"${chars.length > max ? `${chars.slice(0, max).join('')}…` : escaped}"`;
}

/** `value` as something `provenance.legacy.unmapped` can hold. Legacy values are parsed JSON already; anything else is written as text. */
export function jsonSafe(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value !== undefined && JsonValueSchema.safeParse(value).success) return value as JsonValue;
  return String(typeof value === 'object' ? (JSON.stringify(value) ?? value) : value);
}

export interface CompoundScope {
  /** Marks the leaves under `value` (the legacy field at `path` of this compound) as turned into schema fields. */
  consume(path: readonly Segment[], value: unknown): void;
  /** Keeps a legacy value in `provenance.legacy.unmapped` under `path` (`['smiles']`, `['jee', 'level']`) and counts the field. */
  keep(path: readonly string[], value: unknown): void;
  reason(text: string): void;
  readonly reasons: readonly string[];
  /** `undefined` when nothing was kept. */
  unmapped(): { [key: string]: JsonValue } | undefined;
}

export function createCompoundScope(index: number, trace: ConsumedTrace, report: ReportBuilder): CompoundScope {
  return createScope(['compounds', index], trace, report, '');
}

/**
 * The same bookkeeping for any legacy record: `base` is the path of the record in the legacy document (`['reactions', 3]`);
 * `countPrefix` is put before a kept field's name in the report's `preservedUnmappedFields` (`reaction.` keeps a reaction's `image`
 * apart from a compound's).
 */
export function createScope(base: readonly Segment[], trace: ConsumedTrace, report: ReportBuilder, countPrefix: string): CompoundScope {
  const kept = new Map<string, unknown>();
  const reasons: string[] = [];
  return {
    reasons,
    consume: (path, value) => trace.consume([...base, ...path], value),
    keep(path, value) {
      report.preserved(`${countPrefix}${generalizePath(path.join('.'))}`);
      const [head, ...rest] = path as readonly [string, ...string[]];
      if (rest.length === 0) {
        kept.set(head, jsonSafe(value));
        return;
      }
      const nested = kept.get(head) as Map<string, unknown> | undefined;
      const group = nested ?? new Map<string, unknown>();
      group.set(rest.join('.'), jsonSafe(value));
      kept.set(head, group);
    },
    reason(text) {
      if (!reasons.includes(text)) reasons.push(text.length > MAX_REASON_CHARS ? `${text.slice(0, MAX_REASON_CHARS)}…` : text);
    },
    unmapped() {
      if (kept.size === 0) return undefined;
      const entries = [...kept].map(([key, value]) => [key, value instanceof Map ? Object.fromEntries(value as Map<string, JsonValue>) : value] as const);
      return Object.fromEntries(entries) as { [key: string]: JsonValue };
    },
  };
}

/** The reasons a record can carry: the schema allows `LIMITS.reviewReasons`; the overflow is summarised (the report lists all). */
export function fitReasons(reasons: readonly string[]): string[] {
  if (reasons.length <= LIMITS.reviewReasons) return [...reasons];
  const kept = reasons.slice(0, LIMITS.reviewReasons - 1);
  return [...kept, `${reasons.length - kept.length} more review reasons are listed in the import report`];
}
