/**
 * The Unanchored panel (step 5.5d, item f; ADV-014 UI part): every reaction no family holds, in a virtualised list (name, then ID), so
 * a list of any length keeps the DOM small and nothing is left out. A click selects the reaction (the inspector of step 5.6a will show
 * it). It sits under the legend and over the drawing; "Close" puts the map back.
 */
import { useCallback, useMemo } from 'react';
import { useStore } from 'zustand';
import { Button, VirtualList } from '@/ui/primitives';
import { useNavigator } from './navigator-context';
import { unanchoredItems, type UnanchoredItem } from './unanchored';
import { useScope } from './use-scope';
import styles from './unanchored-panel.module.css';

const keyOf = (item: UnanchoredItem): string => item.id;
const estimate = (): number => 44;

export function UnanchoredPanel(props: { readonly ids: readonly string[]; readonly onClose: () => void }) {
  const { ports } = useNavigator();
  const selected = useStore(ports.ui.family, (s) => s.reaction);
  const items = useMemo(() => {
    const reactions = ports.store.getState().records.reaction;
    return unanchoredItems(props.ids, (id) => reactions[id]?.name);
  }, [ports, props.ids]);
  const scope = useScope(ports, props.ids);
  const select = useCallback((id: string): void => ports.ui.family.getState().selectReaction(id), [ports]);
  const renderItem = useCallback(
    (item: UnanchoredItem) => (
      <button type="button" className={styles.row} aria-pressed={selected === item.id} onClick={() => select(item.id)} data-reaction-id={item.id} data-outside={scope.note !== undefined && scope.isOutside(item.id) ? '' : undefined}>
        <span className={styles.name}>{item.name}</span>
        {scope.note !== undefined && scope.isOutside(item.id) ? <span className={styles.outside}>{scope.note}</span> : null}
        <span className={styles.id}>{item.id}</span>
      </button>
    ),
    [select, selected, scope],
  );
  return (
    <section className={styles.panel} aria-label="Unanchored reactions" data-unanchored-panel="">
      <div className={styles.head}>
        <h2 className={styles.title}>
          {items.length} {items.length === 1 ? 'reaction is' : 'reactions are'} not in any family
        </h2>
        <Button onClick={props.onClose}>Close</Button>
      </div>
      <p className={styles.help}>These reactions have a substrate or product that no family holds yet, so they are drawn on Unclassified. Select one to pick it.</p>
      <div className={styles.list}>
        <VirtualList items={items} itemKey={keyOf} estimateSize={estimate} renderItem={renderItem} label="Unanchored reactions" />
      </div>
    </section>
  );
}
