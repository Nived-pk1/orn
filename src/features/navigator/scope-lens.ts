/**
 * The chosen exam scope as the navigator reads it (step 5.8): the `scopeOf` for the active exam version (none chosen: every record is
 * `unmapped`, so nothing is dimmed), and the words for what is outside it ("outside JEE Main"). Derived, never stored. The scope
 * dims and marks; the default request stays UNFILTERED (TEST_STRATEGY §6).
 */
import { createScopeOf, type ScopeOf } from '@/core/graph';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState } from '@/core/schema';
import type { ActiveExam } from '@/ui/state';

export const unscoped: ScopeOf = () => 'unmapped';

export function scopeLens(indexes: ReadonlyIndexes, active: ActiveExam | null): ScopeOf {
  return active === null ? unscoped : createScopeOf(indexes, active.examId, active.examVersionId);
}

/** The exam's name for words ("JEE Main"); its ID when the record is gone. Undefined: no exam scope is chosen. */
export function scopeNameOf(state: CanonicalState, active: ActiveExam | null): string | undefined {
  if (active === null) return undefined;
  return state.records.exam[active.examId]?.name ?? active.examId;
}

/** "outside JEE Main", or undefined when no exam scope is chosen. */
export function outsideNoteOf(state: CanonicalState, active: ActiveExam | null): string | undefined {
  const name = scopeNameOf(state, active);
  return name === undefined ? undefined : `outside ${name}`;
}
