/**
 * The bulk actions of the map's multi-selection (step 6.8b, R2; Studio only): "Mark verified (n)", "Delete (n)" and "Clear", where n is the
 * number of reactions of the selection. On a phone it is the bottom bar and carries the selection line too. Each button says why it cannot
 * act (a read-only tab, a selection with no reactions); the host (`MapBulk`) runs the review queue's path and the aggregated impact dialog.
 */
import { Button } from '@/ui/primitives';
import type { MultiSelect } from './multi-types';
import styles from './navigator.module.css';

export function MultiActions(props: { readonly multi: MultiSelect; readonly bar?: boolean }) {
  const { multi } = props;
  const n = multi.reactionIds.length;
  const off = multi.bulk.unavailable ?? (n === 0 ? 'The selection has no reactions' : undefined);
  return (
    <div role="region" aria-label="Selection actions" className={props.bar === true ? styles.selectionBar : styles.selectionActions}>
      {props.bar === true ? <p className={styles.selectionBarLine}>{multi.line}</p> : null}
      <Button {...(off !== undefined ? { unavailable: off } : { onClick: () => multi.bulk.markVerified(multi.reactionIds) })}>{`Mark verified (${n})`}</Button>
      <Button {...(off !== undefined ? { unavailable: off } : { onClick: () => multi.bulk.remove(multi.reactionIds) })}>{`Delete (${n})`}</Button>
      <Button onClick={multi.clear}>Clear</Button>
    </div>
  );
}
