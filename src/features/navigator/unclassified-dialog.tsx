/**
 * "See those compounds" (step 8.2a, D5; Studio only, a lazy chunk): the compounds or classes that are in no family and how many reactions
 * lead to each, most first. A row opens that record in the inspector. Putting them into families is content work, not done here.
 */
import { useMemo } from 'react';
import { unclassifiedProducts } from '@/core/graph';
import { Dialog } from '@/ui/primitives';
import { useMapCompounds } from './compounds-context';
import { useNavigator } from './navigator-context';
import styles from './navigator.module.css';

const KIND_WORD: Readonly<Record<string, string>> = { species: 'compound', class: 'class', reagent: 'reagent' };

export function UnclassifiedDialog(props: { readonly open: boolean; readonly onClose: () => void }) {
  const { ports } = useNavigator();
  const compounds = useMapCompounds();
  const rows = useMemo(() => {
    if (!props.open) return [];
    const state = ports.store.getState();
    return unclassifiedProducts(ports.indexes.current()).map((row) => {
      const record = (state.records[row.ref.kind] as Readonly<Record<string, { names?: { display?: string; canonical?: string }; name?: string }>>)[row.ref.id];
      const name = record?.names?.display ?? record?.names?.canonical ?? record?.name ?? row.ref.id;
      return { ...row, name };
    });
  }, [props.open, ports]);
  return (
    <Dialog open={props.open} onClose={props.onClose} title="Compounds in no family yet" size="wide">
      <p className={styles.dialogLine}>
        {rows.length} {rows.length === 1 ? 'compound or class is' : 'compounds or classes are'} in no family. Pick one to see it in the inspector.
      </p>
      <ul className={styles.compoundList} aria-label="Compounds in no family">
        {rows.map((row) => (
          <li key={`${row.ref.kind}:${row.ref.id}`}>
            <button
              type="button"
              className={styles.compoundRow}
              onClick={() => {
                compounds?.open(row.ref);
                props.onClose();
              }}
            >
              <span>{row.name}</span>
              <span className={styles.compoundKind}>{KIND_WORD[row.ref.kind] ?? row.ref.kind}</span>
              <span>
                {row.reactions} {row.reactions === 1 ? 'reaction' : 'reactions'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
