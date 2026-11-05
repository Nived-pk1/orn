/**
 * The reactions of an arrow, as the rows of the arrow view (ADR-039; step 8.2b-fix, S2): each a button that shows that reaction, with the
 * reagent words under it; an example folds under its general reaction (7.3a). The same roll-up the family page and the arrow's count come from.
 */
import { exampleLookupOf, foldExamples, type ArrowTextPart } from '@/core/graph';
import { Runs } from '@/render/equation';
import { partsToRuns } from '@/render/scene';
import { arrowReactionIds } from './model/focus';
import { nameOfRecord, recordOf } from './model/describe';
import { useInspectorEnv } from './env';
import styles from './inspector.module.css';

export function ArrowReactions(props: { readonly ends: { readonly from: string; readonly to: string }; readonly words: ReadonlyMap<string, readonly ArrowTextPart[]> }) {
  const { ports, host, state, open } = useInspectorEnv();
  const { ends } = props;
  const ids = arrowReactionIds(ends, ports.indexes.current());
  if (ids.length < 1) return null;
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
  const wordsOf = (id: string) => {
    const parts = props.words.get(id);
    return parts === undefined || parts.length === 0 ? null : <span className={styles.arrowTitle}><Runs runs={partsToRuns(parts)} /></span>;
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
              {wordsOf(id)}
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
