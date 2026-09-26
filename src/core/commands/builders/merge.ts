/**
 * Merge duplicates (ADV-021): re-point every reference from `from` to `into`, then delete `from`, as one
 * undoable batch. The delete is `restrict`, so anything the re-pointing could not move (references to
 * `from`'s nested IDs, for instance) makes the whole merge fail visibly instead of being dropped.
 * `mergedRecord` is the caller's field-level merge result for `into` (names, aliases, citations …);
 * nothing of `from` is copied automatically.
 */
import type { AnyRecord, CanonicalState, RecordRef } from '../../schema';
import { recordAt } from '../lookup';
import { built, rejected, type BuildResult } from './types';

export interface MergeOptions {
  readonly mergedRecord?: AnyRecord;
  readonly label?: string;
}

export function mergeRecords(
  state: CanonicalState,
  from: RecordRef,
  into: RecordRef,
  options: MergeOptions = {},
): BuildResult {
  if (from.kind !== into.kind || from.id === into.id) {
    return rejected({ code: 'VALIDATION_FAILED', message: 'A merge needs two different records of the same kind.' });
  }
  for (const ref of [from, into]) {
    if (recordAt(state, ref) === undefined) return rejected({ code: 'NOT_FOUND', message: `${ref.kind} ${ref.id} does not exist.` });
  }
  const { mergedRecord } = options;
  if (mergedRecord !== undefined && (mergedRecord.kind !== into.kind || mergedRecord.id !== into.id)) {
    return rejected({ code: 'VALIDATION_FAILED', message: 'The merged record must be the target record.' });
  }
  return built({
    label: options.label ?? `Merge ${from.kind} ${from.id} into ${into.id}`,
    commands: [
      ...(mergedRecord === undefined ? [] : [{ type: 'record.update', record: mergedRecord } as const]),
      { type: 'record.replaceReferences', from, to: into },
      { type: 'record.delete', ref: from, mode: 'restrict' },
    ],
    selectionHint: [into],
  });
}
