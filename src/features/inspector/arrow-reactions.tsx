/**
 * The reactions of the arrow that was picked on the map (ADR-039: a tap on an arrow opens the sheet with that arrow's reactions). An arrow of
 * several reactions is not one record, so the inspector shows its source family and says so; this list names every reaction the arrow
 * carries, each a button that shows that reaction. Nothing is added: the same roll-up the family page and the arrow's count come from.
 */
import { useStore } from 'zustand';
import { arrowReactionIds } from './model/focus';
import { nameOfRecord, recordOf } from './model/describe';
import { useInspectorEnv } from './env';
import styles from './inspector.module.css';

export function ArrowReactions() {
  const { ports, host, state, open } = useInspectorEnv();
  const selected = useStore(ports.ui.selection, (s) => s.selected);
  if (selected === null || selected.kind !== 'edge') return null;
  const ends = host.edgeEnds(selected.id);
  if (ends === undefined) return null;
  const ids = arrowReactionIds(ends, ports.indexes.current());
  if (ids.length < 2) return null;
  return (
    <section aria-label="Reactions on this arrow" className={styles.arrowReactions}>
      <h4 className={styles.arrowTitle}>Reactions on this arrow ({ids.length})</h4>
      {host.showArrowReactions === undefined ? null : (
        <button type="button" onClick={() => host.showArrowReactions?.(ends)}>
          {`Open these ${ids.length} reactions in Reactions`}
        </button>
      )}
      <ul className={styles.arrowList}>
        {ids.map((id) => {
          const ref = { kind: 'reaction', id } as const;
          const record = recordOf(state, ref);
          return (
            <li key={id}>
              <button type="button" onClick={() => open(ref)}>
                {record === undefined ? id : nameOfRecord(record)}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
