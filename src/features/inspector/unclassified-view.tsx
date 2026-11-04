/**
 * The inspector's view of the map's Unclassified box (step 8.2b, B4): a chip, the title, how many reactions lead to compounds that are in no
 * family yet, and those compounds with the reactions that lead to each (the same data as Studio's "See those compounds"). A row opens the
 * compound. Both editions. The box is not a record; this is a derived view, never stored. A lazy chunk.
 */
import { useMemo } from 'react';
import { unclassifiedProducts, type UnclassifiedProduct } from '@/core/graph';
import type { RecordRef } from '@/core/schema';
import { SHEET_TITLE_ID } from '@/ui/shell';
import { nameOfRecord, recordOf } from './model/describe';
import type { InspectorPorts } from './contracts';
import study from './study-inspector.module.css';
import styles from './unclassified-view.module.css';

const reactionsWord = (n: number): string => `${n} ${n === 1 ? 'reaction' : 'reactions'}`;

export function UnclassifiedView(props: { readonly products: readonly UnclassifiedProduct[]; readonly nameOf: (ref: RecordRef) => string; readonly open: (ref: RecordRef) => void; readonly titleId: string }) {
  const reactions = new Set(props.products.flatMap((product) => product.reactionIds)).size;
  return (
    <article aria-label="Unclassified">
      <header className={study.head}>
        <div className={study.headText}>
          <span className={study.kindChip}>Not in a family yet</span>
          <h3 id={props.titleId} className={study.titleText}>
            Unclassified
          </h3>
        </div>
      </header>
      <p className={styles.line}>{reactionsWord(reactions)} lead to compounds that are in no family yet</p>
      {props.products.length === 0 ? null : (
        <ul className={styles.list} aria-label="Compounds in no family">
          {props.products.map((product) => (
            <li key={`${product.ref.kind}:${product.ref.id}`}>
              <button type="button" className={styles.row} onClick={() => props.open(product.ref)}>
                <span>{props.nameOf(product.ref)}</span>
                <span className={styles.count}>{reactionsWord(product.reactions)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/** The view wired to the inspector's ports. */
export function UnclassifiedPane(props: { readonly ports: InspectorPorts; readonly open: (ref: RecordRef) => void }) {
  const { ports, open } = props;
  const products = useMemo(() => unclassifiedProducts(ports.indexes.current()), [ports]);
  const nameOf = (ref: RecordRef): string => {
    const record = recordOf(ports.store.getState(), ref);
    return record === undefined ? ref.id : nameOfRecord(record);
  };
  return <UnclassifiedView products={products} nameOf={nameOf} open={open} titleId={SHEET_TITLE_ID} />;
}
