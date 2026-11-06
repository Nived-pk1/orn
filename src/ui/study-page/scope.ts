/**
 * The exam scope as the Named reactions and Mechanisms views use it (7.4, the rule of the Reagents list): a reaction is "outside" when the
 * scope of the chosen exam version says so. `outside` is for the core filters (true = left out), `outsideWords` for the cards ("outside JEE
 * Main"). Both are undefined-safe: with no exam chosen nothing is outside.
 */
import { useMemo } from 'react';
import { createScopeOf } from '@/core/graph';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { ActiveExam } from '@/ui/state';

export interface ScopeLens {
  /** The exam's display name ("JEE Main"), or undefined with no exam chosen. */
  readonly examName: string | undefined;
  readonly versionName: string | undefined;
  readonly outside: ((reactionId: string) => boolean) | undefined;
  readonly outsideWords: (reactionId: string) => string | undefined;
}

export function useScopeLens(state: CanonicalState, indexes: ReadonlyIndexes, active: ActiveExam | null, onlyInScope: boolean): ScopeLens {
  const scopeOf = useMemo(() => (active === null ? undefined : createScopeOf(indexes, active.examId, active.examVersionId)), [indexes, active]);
  const examName = active === null ? undefined : (state.records.exam[active.examId as never]?.name ?? active.examId);
  const versionName = active === null ? undefined : (state.records.exam_version[active.examVersionId as never]?.label ?? active.examVersionId);
  const isOutside = (reactionId: string): boolean => scopeOf?.({ kind: 'reaction', id: reactionId } as RecordRef) === 'outside';
  return {
    examName,
    versionName,
    outside: onlyInScope && scopeOf !== undefined ? isOutside : undefined,
    outsideWords: (reactionId) => (examName !== undefined && isOutside(reactionId) ? `outside ${examName}` : undefined),
  };
}
