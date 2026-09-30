/**
 * Level-4 findings and the commit step (Phase 4 contract decisions Q10 b). L4 findings arrive later from the chem worker and are
 * merged by the L4 service; L1-L3 commits never replace or clear them (`commitFindings` only writes levels 1-3). The one thing the
 * commit step does about them: a finding about a record that no longer exists is cleared in the same step, so no finding outlives
 * its subject, whatever removed it (a delete, an undo or redo, `replaceState`, `reload`, `applyRemote`).
 */
import type { RecordRef } from '../schema';
import type { FindingStore } from './contracts';

const keyOf = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;

/** Clears the level-4 findings of `refs` (records that were deleted). Nothing else of theirs is touched. */
export function clearLevel4(store: FindingStore, refs: readonly RecordRef[]): void {
  if (refs.length > 0) store.replaceForSubjects(refs, [], 4);
}

/** The records of `before` that are not in `after`. */
export function vanishedRefs(before: readonly RecordRef[], after: readonly RecordRef[]): readonly RecordRef[] {
  const kept = new Set(after.map(keyOf));
  return before.filter((ref) => !kept.has(keyOf(ref)));
}
