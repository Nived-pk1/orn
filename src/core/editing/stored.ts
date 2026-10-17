/**
 * A stored editor-session row is untrusted (ADR-040, PERSISTENCE §4): it may be old, cut short or hand-made. `parseStoredSession` is the
 * tolerant parse of the `EditorSession` shape: a value that fits becomes a session, anything else is a reason in words and the caller keeps
 * the raw value until the user discards it. It checks the SHAPE only; whether the draft is a valid record is L1's question at commit.
 */
import { z } from 'zod';
import { RECORD_KINDS, idPattern } from '../schema';
import type { EditorSession } from '../commands/contracts';
import { MAX_DRAFT_STEPS } from './contracts';

const MAX_PATCHES_PER_STEP = 10_000;
const MAX_PATH_LENGTH = 64;

const PatchSchema = z.object({
  op: z.enum(['add', 'remove', 'replace']),
  path: z.array(z.union([z.string(), z.number().int().nonnegative()])).max(MAX_PATH_LENGTH),
  value: z.unknown().optional(),
});
const StepsSchema = z.array(z.array(PatchSchema).max(MAX_PATCHES_PER_STEP)).max(MAX_DRAFT_STEPS);
const FieldsSchema = z.record(z.string(), z.unknown());
const KindSchema = z.enum(RECORD_KINDS);
const SESSION_ID = idPattern('eds');

const SessionSchema = z.object({
  id: z.string().regex(SESSION_ID),
  kind: KindSchema,
  target: z.object({ kind: KindSchema, id: z.string().min(1) }).nullable(),
  baseRevision: z.number().int().nonnegative(),
  baseRecord: FieldsSchema.nullable(),
  draft: FieldsSchema,
  past: StepsSchema,
  future: StepsSchema,
  updatedAt: z.string().min(1),
});

export type StoredSessionParse = { readonly ok: true; readonly session: EditorSession } | { readonly ok: false; readonly reason: string };

const where = (path: readonly PropertyKey[]): string => (path.length === 0 ? 'the row' : path.map(String).join('.'));

export function parseStoredSession(value: unknown): StoredSessionParse {
  const parsed = SessionSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, reason: issue === undefined ? 'not an editor session' : `${where(issue.path)}: ${issue.message}` };
  }
  const row = parsed.data;
  if (row.target !== null && row.target.kind !== row.kind) return { ok: false, reason: 'target: the kind of the target is not the kind of the session' };
  return { ok: true, session: row as unknown as EditorSession };
}
