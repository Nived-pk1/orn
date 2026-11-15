/**
 * Which notice the single band shows (step 8.4a, Part C): the most severe first (error and warning before the rest), newest first within
 * a kind. Nothing is dropped: the band shows the first and offers "+n more" for the rest. Pure.
 */
import type { NoticeKind } from '@/ui/primitives';

export interface NoticeEntry {
  readonly id: string;
  readonly kind: NoticeKind;
  /** Larger is newer. */
  readonly order: number;
  /** The backup notice (8.4f C3): before the warnings, so it is not hidden behind "+1 more". An error still comes first. */
  readonly first?: boolean;
}

const RANK: Readonly<Record<NoticeKind, number>> = { error: 0, warning: 1, review: 2, info: 3 };

export function orderNotices<T extends NoticeEntry>(entries: readonly T[]): T[] {
  const rank = (e: NoticeEntry): number => (e.kind === 'error' ? 0 : e.first === true ? 1 : RANK[e.kind] + 1);
  return [...entries].sort((a, b) => rank(a) - rank(b) || b.order - a.order);
}
