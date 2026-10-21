/**
 * Committing a draft (ADR-040): strict L1 parse, the conflict check, then ONE `store.dispatch` (one global history entry, ARCHITECTURE §23).
 * Nothing is fixed or trimmed on the way (INV-24); a refused commit leaves the store unchanged.
 */
import type { CanonicalStore, CommandContext, DraftCommitOutcome, EditorSession } from '../commands/contracts';
import { recordAt } from '../commands/lookup';
import type { AnyRecord, CanonicalState, RecordRef } from '../schema';
import { nameOfRef, relationshipWords } from './labels';
import { parseRecord } from '../validation/l1';
import { compareForConflict, sameValue } from './conflict';
import type { CommitOptions, ConflictChoices, FieldComparison } from './contracts';

type Fields = Record<string, unknown>;

/** The merged draft: the draft, with the stored value taken wherever only the stored record changed or the user chose it. */
export function mergeDraft(draft: unknown, comparisons: readonly FieldComparison[], choices: ConflictChoices): unknown {
  const merged = structuredClone(draft) as Fields;
  for (const field of comparisons) {
    const takeTheirs = field.status === 'theirsOnly' || (field.status === 'both' && choices[field.path] === 'theirs');
    if (!takeTheirs) continue;
    let at = merged;
    for (const segment of field.segments.slice(0, -1)) {
      if (typeof at[segment] !== 'object' || at[segment] === null) at[segment] = {};
      at = at[segment] as Fields;
    }
    const last = field.segments[field.segments.length - 1] as string;
    if (field.theirs === undefined) Reflect.deleteProperty(at, last);
    else at[last] = structuredClone(field.theirs);
  }
  return merged;
}

const nameOf = (record: unknown, id: string): string => {
  const fields = record as { names?: { canonical?: unknown }; name?: unknown; title?: unknown; type?: unknown } | null;
  const type = typeof fields?.type === 'string' ? fields.type.replace(/_/g, ' ') : undefined; // a relationship has no name: its type names it
  const own = fields?.names?.canonical ?? fields?.name ?? fields?.title ?? type; // a reaction has `name`, a source `title`, the others `names.canonical`
  return typeof own === 'string' && own !== '' ? own : id;
};

/** A relationship is named by both its ends ("Create relationship: A commonly confused with B"); the others by their name. */
function labelOf(verb: string, noun: string, record: AnyRecord, state: CanonicalState): string {
  if (record.kind !== 'relationship') return `${verb} ${noun} ${nameOf(record, record.id)}`;
  return `${verb} ${noun}: ${relationshipWords(record.type, nameOfRef(state, record.from), nameOfRef(state, record.to))}`;
}

export function commitDraft(
  store: CanonicalStore,
  session: EditorSession,
  _ctx: CommandContext,
  choices?: ConflictChoices,
  options: CommitOptions = {},
): DraftCommitOutcome {
  // timestamps: the existing update builders set none, so neither does this (`_ctx` is part of the contract for later steps)
  const first = parseRecord(session.kind, session.draft);
  if (!first.ok) return { ok: false, reason: 'invalid', findings: first.findings };

  let candidate: unknown = session.draft;
  const current: AnyRecord | undefined = session.target === null ? undefined : recordAt(store.getState(), session.target);
  if (session.target !== null) {
    if (current === undefined) return { ok: false, reason: 'conflict', current: null };
    if (session.baseRecord === null || !sameValue(session.baseRecord, current)) {
      if (choices === undefined) return { ok: false, reason: 'conflict', current };
      const comparisons = compareForConflict(session.baseRecord, current, session.draft);
      if (comparisons.some((field) => field.status === 'both' && choices[field.path] === undefined)) return { ok: false, reason: 'conflict', current };
      candidate = mergeDraft(session.draft, comparisons, choices);
    }
  }
  const parsed = parseRecord(session.kind, candidate);
  if (!parsed.ok) return { ok: false, reason: 'invalid', findings: parsed.findings };
  const record = parsed.record;
  const ref = { kind: record.kind, id: record.id } as RecordRef;
  const result = store.dispatch({
    label: current === undefined ? labelOf('Create', record.kind.replace(/_/g, ' '), record, store.getState()) : labelOf('Edit', options.section ?? 'record', current, store.getState()),
    commands: [session.target === null ? { type: 'record.create', record } : { type: 'record.update', record }],
    expectedRevision: store.getRevision(),
    selectionHint: [ref],
  });
  if (result.ok) return { ok: true, changes: result.changes };
  if (result.error.code === 'VALIDATION_FAILED') return { ok: false, reason: 'invalid', findings: result.error.findings ?? [] };
  if (result.error.code === 'ID_CONFLICT') return { ok: false, reason: 'conflict', current: recordAt(store.getState(), ref) ?? null };
  return { ok: false, reason: 'refused', error: result.error };
}
