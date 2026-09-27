/**
 * Finding construction: stable IDs and plain-text hygiene (docs/VALIDATION_RULES.md §4).
 * A finding ID is a hash of (ruleId, subject, path) only, never of the message or the data, so the same
 * problem keeps its ID across edits and a fixed problem simply disappears (no dismissal state needed).
 */
import { hash64 } from '../hash';
import { OPERATIONAL_ID_PREFIX, type RecordRef } from '../schema';
import type { Finding, FindingDraft, ValidationLevel, ValidationRule } from './contracts';

export const MAX_MESSAGE_LENGTH = 500;
export const MAX_PATH_LENGTH = 200;

/** Everything but printable text (controls, bidi overrides, line and paragraph separators). */
const UNPRINTABLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/** Plain text for display: unprintable characters become U+FFFD; overlong text is cut with an ellipsis. */
export function plainText(text: string, max: number = MAX_MESSAGE_LENGTH): string {
  const clean = text.replace(UNPRINTABLE, '�');
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/** `fnd_` + 64 bits of two independent FNV-1a passes over `ruleId ␀ kind:id ␀ path`. */
export function findingId(ruleId: string, subject: RecordRef, path?: string): string {
  const key = `${ruleId}\u0000${subject.kind}:${subject.id}\u0000${path ?? ''}`;
  return `${OPERATIONAL_ID_PREFIX.finding}_${hash64(key)}`;
}

interface Origin {
  readonly id: string;
  readonly level: ValidationLevel;
  readonly severity: Finding['severity'];
}

export function makeFinding(origin: Origin, subject: RecordRef, draft: FindingDraft): Finding {
  const path = draft.path === undefined ? undefined : plainText(draft.path, MAX_PATH_LENGTH);
  return {
    id: findingId(origin.id, subject, path),
    ruleId: origin.id,
    level: origin.level,
    severity: draft.severity ?? origin.severity,
    subject,
    ...(path === undefined ? {} : { path }),
    message: plainText(draft.message),
    related: draft.related ?? [],
    ...(draft.data === undefined ? {} : { data: draft.data }),
  };
}

export const ruleOrigin = (rule: Pick<ValidationRule, 'id' | 'level' | 'defaultSeverity'>): Origin => ({
  id: rule.id,
  level: rule.level,
  severity: rule.defaultSeverity,
});
