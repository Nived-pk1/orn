/**
 * "Continue from here" (step C6): a compound at the end of a 5-step route that has its own makers can start a new search of its own. The
 * move is ONE history entry, so Back returns to the previous search: the current entry is given the previous target and a new entry is
 * pushed with the new one (both in `history.state`; the address text is unchanged, ADR-047). Nothing is stored. The full map owns its entry.
 */
import type { SubstanceChoice } from '@/ui/state';

export const PRECURSOR_HISTORY = 'precursor-target';

type HistoryLike = Pick<History, 'state' | 'replaceState' | 'pushState'>;

const choiceOf = (value: unknown): SubstanceChoice | undefined => {
  if (value === null || typeof value !== 'object') return undefined;
  const { kind, id } = value as { kind?: unknown; id?: unknown };
  return (kind === 'species' || kind === 'class') && typeof id === 'string' && id !== '' ? { kind, id } : undefined;
};

/** The target a history entry carries, or undefined (not ours, or not valid). */
export function targetOfState(state: unknown): SubstanceChoice | undefined {
  if (state === null || typeof state !== 'object' || (state as { orn?: unknown }).orn !== PRECURSOR_HISTORY) return undefined;
  return choiceOf((state as { target?: unknown }).target);
}

/** Records the step as one history entry; false when the full map owns the current entry (nothing is written). */
export function pushTargetEntry(previous: SubstanceChoice | null, next: SubstanceChoice, h: HistoryLike = history): boolean {
  if ((h.state as { orn?: string } | null)?.orn === 'full-map') return false;
  if (previous !== null) h.replaceState({ orn: PRECURSOR_HISTORY, target: previous }, '');
  h.pushState({ orn: PRECURSOR_HISTORY, target: next }, '');
  return true;
}
