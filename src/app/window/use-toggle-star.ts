/**
 * Star for revision (step 8.4g Part B, G2): the one place that says what a star did ("Starred", "Star removed", or that the list is full). The
 * same call serves the header button, the key and the palette command. In the entry, so it holds no rule: the limit is the words only
 * (a test keeps 500 in step with the rule).
 */
import { useToasts } from '@/ui/primitives';
import type { RecordRef } from '@/core/schema';
import type { MyRecords } from './my-records';

export const STAR_FULL_TEXT = 'You can star up to 500 records';

/** Stars or un-stars, and tells the reader what happened. */
export function useToggleStar(mine: Pick<MyRecords, 'toggle'>): (ref: RecordRef) => void {
  const toasts = useToasts();
  return (ref) => {
    const result = mine.toggle(ref);
    toasts.push({ kind: 'info', text: result === 'full' ? STAR_FULL_TEXT : result === 'added' ? 'Starred' : 'Star removed' });
  };
}
