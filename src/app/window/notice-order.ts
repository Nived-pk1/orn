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
}

const RANK: Readonly<Record<NoticeKind, number>> = { error: 0, warning: 1, review: 2, info: 3 };

export function orderNotices<T extends NoticeEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => RANK[a.kind] - RANK[b.kind] || b.order - a.order);
}
