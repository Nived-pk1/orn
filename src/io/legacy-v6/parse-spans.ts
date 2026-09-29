/**
 * Shared vocabulary of the legacy label and condition parsers (steps 3.9): source spans, review items, and the conversion of
 * left-over text into schema-valid `other[]` entries. Nothing here throws, whatever the input string.
 *
 * NO CHARACTER IS LOST. Every parser returns `segments` that tile the input exactly: consecutive, no gap, no overlap, and
 * `segments.map(s => s.text).join('') === input`. A segment with a `field` is text a parser turned into that field; a segment
 * without one is remainder (returned as text for matching, or as `other[]` entries). Only whitespace may be normalised when the
 * remainder is turned into a value, and that is stated where it happens.
 */
import { LIMITS } from '@/core/schema';

export interface Segment {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  /** What the text was turned into, e.g. `phase`, `temperature`; absent for remainder. */
  readonly field?: string;
}

export type ParseReviewCode =
  | 'CONFLICTING_TOKENS'
  | 'NEGATED_TOKEN'
  | 'EMPTY_REMAINDER'
  | 'LABEL_LOOKS_LIKE_STAGE_PARAMETER'
  | 'REMAINDER_LOOKS_LIKE_TEMPERATURE'
  | 'QUANTITY_NOT_DECIDED'
  | 'UNPARSED_FIELD_VALUE'
  | 'PARTIAL_FIELD_PARSE'
  | 'FLAG_SUBSUMED'
  | 'NON_BOOLEAN_FLAG'
  | 'UNSUPPORTED_VALUE_TYPE'
  | 'CONTROL_CHARACTERS_ESCAPED'
  | 'OTHER_OVERFLOW'
  | 'TEXT_NOT_REPRESENTABLE';

/** Something a person has to look at (a REVIEW REQUIRED trigger of MIGRATION.md §4.7 once the mapper reports it). */
export interface ParseReview {
  readonly code: ParseReviewCode;
  readonly message: string;
  /** The legacy field or label token the item is about, when there is one. */
  readonly field?: string;
  readonly start?: number;
  readonly end?: number;
}

export interface Parsed {
  readonly start: number;
  readonly end: number;
  readonly field: string;
}

/** Cuts `text` into segments: the given parsed spans (sorted, non-overlapping) and remainder between and around them. */
export function tile(text: string, parsed: readonly Parsed[]): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const span of [...parsed].sort((a, b) => a.start - b.start)) {
    if (span.start < at || span.end < span.start || span.end > text.length) continue; // a caller bug must not corrupt the tiling
    if (span.start > at) out.push({ start: at, end: span.start, text: text.slice(at, span.start) });
    out.push({ start: span.start, end: span.end, text: text.slice(span.start, span.end), field: span.field });
    at = span.end;
  }
  if (at < text.length) out.push({ start: at, end: text.length, text: text.slice(at) });
  return out;
}

/** The remainder segments' text, whitespace runs collapsed to one space and trimmed (the only normalisation applied). */
export function remainderText(segments: readonly Segment[]): string {
  return segments
    .filter((segment) => segment.field === undefined)
    .map((segment) => segment.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// eslint-disable-next-line no-control-regex -- intentional: finds the characters LabelTextSchema rejects
const FORBIDDEN_IN_LABEL = /[\u0000-\u001F\u007F‪-‮⁦-⁩]/;
const escapeCode = (ch: string): string => `\\u{${(ch.codePointAt(0) as number).toString(16)}}`;

export interface OtherEntries {
  readonly entries: string[];
  /** True when a control or bidi-override character had to be written as `\u{hex}` to be storable. */
  readonly escaped: boolean;
}

/**
 * `text` as `other[]` entries that pass `LabelTextSchema` (single line, not blank, at most LIMITS.label characters): whitespace
 * runs become one space, forbidden control / bidi characters are written as `\u{hex}` (reported by `escaped`), and a text that
 * is too long is split over several entries at a character boundary, each carrying the `prefix`. Nothing is truncated. A text
 * with no non-whitespace character gives no entry.
 */
export function toOtherEntries(prefix: string, text: string): OtherEntries {
  const units: string[] = [];
  let escaped = false;
  for (const ch of text.replace(/\s+/g, ' ').trim()) {
    if (FORBIDDEN_IN_LABEL.test(ch)) {
      units.push(escapeCode(ch));
      escaped = true;
    } else units.push(ch);
  }
  if (units.length === 0) return { entries: [], escaped };
  const lead = prefix === '' ? '' : `${prefix}: `;
  const room = Math.max(1, LIMITS.label - lead.length);
  const entries: string[] = [];
  let current = '';
  for (const unit of units) {
    if (current.length + unit.length > room && current !== '') {
      entries.push(lead + current);
      current = '';
    }
    current += unit;
  }
  entries.push(lead + current);
  return { entries, escaped };
}
