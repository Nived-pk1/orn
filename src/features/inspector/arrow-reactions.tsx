/**
 * The reactions of the arrow that was picked on the map (ADR-039: a tap on an arrow opens the sheet with that arrow's reactions). An arrow of
 * several reactions is not one record, so the inspector shows its source family and says so; this list names every reaction the arrow
 * carries, each a button that shows that reaction. Nothing is added: the same roll-up the family page and the arrow's count come from.
 */
import { useStore } from 'zustand';
import { exampleLookupOf, foldExamples } from '@/core/graph';
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
  // 7.3a C3: the rows are CARDS; an example folds under its general reaction (a closed "Examples (n)"), and the count says so in words
  const folding = foldExamples(ids, exampleLookupOf(state));
  const row = (id: string) => {
    const ref = { kind: 'reaction', id } as const;
    const record = recordOf(state, ref);
    return (
      <button type="button" onClick={() => open(ref)}>
        {record === undefined ? id : nameOfRecord(record)}
      </button>
    );
  };
  const generalName = (id: string): string => {
    const record = recordOf(state, { kind: 'reaction', id });
    return record === undefined ? id : nameOfRecord(record);
  };
  const examples = folding.folded === 0 ? '' : ` (+ ${folding.folded} ${folding.folded === 1 ? 'example' : 'examples'})`;
  return (
    <section aria-label="Reactions on this arrow" className={styles.arrowReactions}>
      <h4 className={styles.arrowTitle}>{`Reactions on this arrow (${folding.shown.length})${examples}`}</h4>
      {host.showArrowReactions === undefined ? null : (
        <button type="button" onClick={() => host.showArrowReactions?.(ends)}>
          {`Open these ${folding.shown.length} reactions in Reactions`}
        </button>
      )}
      <ul className={styles.arrowList}>
        {folding.shown.map((id) => {
          const mine = folding.examplesOf.get(id) ?? [];
          const general = folding.exampleOf.get(id);
          return (
            <li key={id}>
              {row(id)}
              {general === undefined ? null : <span className={styles.arrowTitle}>{`Example of ${generalName(general)}`}</span>}
              {mine.length === 0 ? null : (
                <details>
                  <summary>{`Examples (${mine.length})`}</summary>
                  <ul className={styles.arrowList}>
                    {mine.map((one) => (
                      <li key={one}>{row(one)}</li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
