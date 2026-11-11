/**
 * The reactions of an arrow, as the rows of the arrow view (ADR-039; step 8.2b-fix, S2): each a button that shows that reaction, with the
 * reagent words under it; an example folds under its general reaction (7.3a). The same roll-up the family page and the arrow's count come from.
 */
import { Fragment, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createScopeOf, exampleLookupOf, foldExamples, type ArrowTextPart } from '@/core/graph';
import { Button, Chip, ListRow, ListRows } from '@/ui/primitives';
import { createActiveExamStore } from '@/ui/state';
import { scopeChipOf } from '@/ui/study-page';
import { Runs } from '@/render/equation';
import { partsToRuns } from '@/render/scene';
import { arrowReactionIds } from './model/focus';
import { nameOfRecord, recordOf } from './model/describe';
import { useInspectorEnv } from './env';
import styles from './inspector.module.css';

const NO_EXAM = createActiveExamStore();

export function ArrowReactions(props: { readonly ends: { readonly from: string; readonly to: string }; readonly words: ReadonlyMap<string, readonly ArrowTextPart[]> }) {
  const { ports, host, state, open } = useInspectorEnv();
  const { ends } = props;
  // "Extra" / "Background" on every reaction row, as on the cards (step 8.4d, E4)
  const active = useStore(ports.ui.exam ?? NO_EXAM, (s) => s.active);
  const scopeOf = active === null ? undefined : createScopeOf(ports.indexes.current(), active.examId, active.examVersionId);
  const ids = arrowReactionIds(ends, ports.indexes.current());
  if (ids.length < 1) return null;
  // 7.3a C3: the rows are CARDS; an example folds under its general reaction (a closed "Examples (n)"), and the count says so in words
  const folding = foldExamples(ids, exampleLookupOf(state));
  // 8.4e (B1, B2): each reaction is a LIST ROW (name, the reagent words under it, the scope chip, a chevron); the accessible name stays the reaction's name
  const row = (id: string, sub?: ReactNode) => {
    const ref = { kind: 'reaction', id } as const;
    const record = recordOf(state, ref);
    const chip = scopeChipOf(scopeOf?.(ref));
    const name = record === undefined ? id : nameOfRecord(record);
    return <ListRow key={id} label={name} ariaLabel={name} {...(sub === undefined ? {} : { sub })} {...(chip === undefined ? {} : { trailing: <Chip data-scope-chip="">{chip}</Chip> })} onOpen={() => open(ref)} />;
  };
  const wordsOf = (id: string): ReactNode => {
    const parts = props.words.get(id);
    return parts === undefined || parts.length === 0 ? undefined : <Runs runs={partsToRuns(parts)} />;
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
        <div className={styles.arrowActions}>
          <Button onClick={() => host.showArrowReactions?.(ends)}>{`Open these ${folding.shown.length} reactions in Reactions`}</Button>
        </div>
      )}
      <ListRows label="Reactions of this arrow">
        {folding.shown.map((id) => {
          const mine = folding.examplesOf.get(id) ?? [];
          const general = folding.exampleOf.get(id);
          const lines: ReactNode[] = [wordsOf(id), general === undefined ? undefined : `Example of ${generalName(general)}`].filter((line) => line !== undefined);
          return (
            <Fragment key={id}>
              {row(id, lines.length === 0 ? undefined : lines.map((line, at) => <span key={at} className={styles.arrowLine}>{line}</span>))}
              {mine.length === 0 ? null : (
                <li className={styles.examples}>
                  <details>
                    <summary>{`Examples (${mine.length})`}</summary>
                    <ul className={styles.nestedRows}>{mine.map((one) => row(one))}</ul>
                  </details>
                </li>
              )}
            </Fragment>
          );
        })}
      </ListRows>
    </section>
  );
}
