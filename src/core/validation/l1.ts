/**
 * L1 structural validation: the Zod record schemas behind the finding vocabulary
 * (VALIDATION_RULES.md §3, rule SCHEMA). Parsing never transforms (INV-24): strict schemas either
 * accept a value unchanged or say why not. One finding per failing path, at most MAX_SCHEMA_FINDINGS
 * per record; when more exist, a summary finding at path `*` says how many were left out.
 */
import { RECORD_SCHEMAS, type AnyRecord, type RecordKind, type RecordRef } from '../schema';
import { formatPath } from '../references';
import type { Finding, Validator } from './contracts';
import { makeFinding, plainText } from './findings';

export const SCHEMA_RULE_ID = 'SCHEMA';
export const MAX_SCHEMA_FINDINGS = 50;
export const OVERFLOW_PATH = '*';
const MAX_LISTED_KEYS = 5;

const ORIGIN = { id: SCHEMA_RULE_ID, level: 1, severity: 'error' } as const;

interface Problem {
  readonly path: string;
  readonly messages: string[];
}

interface ZodIssueLike {
  readonly code: string;
  readonly message: string;
  readonly path: readonly PropertyKey[];
  readonly keys?: readonly string[];
}

const isKind = (kind: unknown): kind is RecordKind =>
  typeof kind === 'string' && Object.hasOwn(RECORD_SCHEMAS, kind);

/** What the caller named the record, best effort: an ID-like string, else empty (never invented). */
function subjectOf(kind: RecordKind, value: unknown): RecordRef {
  const id = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : undefined;
  return { kind, id: typeof id === 'string' ? plainText(id, 80) : '' };
}

function describeKeys(keys: readonly string[]): string {
  const shown = keys.slice(0, MAX_LISTED_KEYS).map((key) => `"${plainText(key, 40)}"`);
  const rest = keys.length - shown.length;
  return `${shown.join(', ')}${rest > 0 ? ` and ${rest} more` : ''}`;
}

/** Groups issues by the path they concern, so two checks failing on one field make one finding. */
function collectProblems(issues: readonly ZodIssueLike[]): Problem[] {
  const byPath = new Map<string, Problem>();
  for (const issue of issues) {
    const path = formatPath(issue.path.map((part) => (typeof part === 'symbol' ? String(part) : part)));
    const message =
      issue.code === 'unrecognized_keys'
        ? `Unknown field ${describeKeys(issue.keys ?? [])}: not part of the schema, so it cannot be stored`
        : issue.message;
    const problem = byPath.get(path) ?? { path, messages: [] };
    if (!problem.messages.includes(message)) problem.messages.push(message);
    byPath.set(path, problem);
  }
  return [...byPath.values()];
}

function parse(kind: unknown, value: unknown): ReturnType<Validator['parseRecord']> {
  if (!isKind(kind)) {
    const subject = { kind: 'reference', id: '' } as const;
    return {
      ok: false,
      findings: [makeFinding(ORIGIN, subject, { message: `"${plainText(String(kind), 40)}" is not a record kind` })],
    };
  }
  const result = RECORD_SCHEMAS[kind].safeParse(value);
  if (result.success) return { ok: true, record: result.data as AnyRecord };
  const subject = subjectOf(kind, value);
  const problems = collectProblems(result.error.issues as readonly ZodIssueLike[]);
  const findings: Finding[] = problems.slice(0, MAX_SCHEMA_FINDINGS).map((problem) =>
    makeFinding(ORIGIN, subject, {
      ...(problem.path === '' ? {} : { path: problem.path }),
      message: problem.messages.join('; '),
    }),
  );
  const omitted = problems.length - findings.length;
  if (omitted > 0) {
    findings.push(
      makeFinding(ORIGIN, subject, {
        path: OVERFLOW_PATH,
        message: `${omitted} further schema problems are not listed`,
        data: { omitted },
      }),
    );
  }
  return { ok: false, findings };
}

/** L1 parse of one unknown value as a record of `kind` (commands, import, boot integrity). */
export const parseRecord: Validator['parseRecord'] = parse;
