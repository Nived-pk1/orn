/**
 * Duplicate a record (ADV-020). Every ID the record defines (its own and every nested one, from the
 * registry) is regenerated through the injected factory, and references between the record's own parts
 * follow the new IDs. References to other records are kept.
 *
 * The copy is a new user-made record: provenance restarts (origin user, both timestamps now; the source's
 * import batch and legacy trace stay with the source), and a verified review does not carry over — a
 * person has not checked the copy. Everything else is copied unchanged, including names, so a copy that
 * shares a canonical name is reported by the name-twin rules rather than silently renamed.
 */
import type { AnyRecord, CanonicalState, RecordRef } from '../../schema';
import { referenceEngine } from '../../references';
import type { CommandContext } from '../contracts';
import { recordAt } from '../lookup';
import { built, rejected, type BuildResult } from './types';

const prefixOf = (id: string): string => id.slice(0, id.indexOf('_'));

export interface DuplicateOptions {
  /** Undo-history label; default "Duplicate <kind>". */
  readonly label?: string;
}

function freshMeta(copy: AnyRecord, now: string): AnyRecord {
  const { importBatchId: _batch, legacy: _legacy, ...kept } = copy.provenance;
  const provenance = { ...kept, origin: 'user' as const, createdAt: now, updatedAt: now };
  if (!('review' in copy) || copy.review.status !== 'verified') return { ...copy, provenance } as AnyRecord;
  const { reviewedAt: _at, confidence: _confidence, ...review } = copy.review;
  return { ...copy, provenance, review: { ...review, status: 'unreviewed' as const } } as AnyRecord;
}

export function duplicateRecord(
  state: CanonicalState,
  ref: RecordRef,
  ctx: CommandContext,
  options: DuplicateOptions = {},
): BuildResult {
  const source = recordAt(state, ref);
  if (source === undefined) return rejected({ code: 'NOT_FOUND', message: `${ref.kind} ${ref.id} does not exist.` });
  const idMap = new Map<string, string>();
  const regenerate = (id: string): void => {
    if (!idMap.has(id)) idMap.set(id, ctx.newId(prefixOf(id)));
  };
  regenerate(source.id);
  for (const nested of referenceEngine.nestedIds(source)) regenerate(nested.id);
  const copy = freshMeta(referenceEngine.remap(source, idMap), ctx.now());
  return built({
    label: options.label ?? `Duplicate ${ref.kind}`,
    commands: [{ type: 'record.create', record: copy }],
    selectionHint: [{ kind: copy.kind, id: copy.id } as RecordRef],
  });
}
