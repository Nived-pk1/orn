/** The selection in one text line beside the canvas toolbar (step 5.5a review, item g; the inspector itself is step 5.6a). */
import { useStore } from 'zustand';
import { useNavigator, useNavigatorState } from './navigator-context';
import styles from './navigator.module.css';

export function NavigatorSelection(props: { /** The multi-selection in words (Studio; step 6.8b): shown instead of the single selection. */ readonly multiLine?: string }) {
  const { ports } = useNavigator();
  const selected = useStore(ports.ui.selection, (s) => s.selected);
  const reaction = useStore(ports.ui.family, (s) => s.reaction);
  const { scene } = useNavigatorState();
  // a reaction picked in the Unanchored panel (or on a family page) is the selection when nothing on the map is
  const line = (text: string) => (
    <p className={styles.selection} title={text}>
      {text}
    </p>
  );
  if (props.multiLine !== undefined) return line(props.multiLine);
  if (selected === null && reaction !== null) return line(`Selected: reaction ${ports.store.getState().records.reaction[reaction]?.name ?? reaction}.`);
  if (selected === null) return line('Nothing is selected.');
  const found = scene === null ? undefined : selected.kind === 'node' ? scene.nodes.find((n) => n.id === selected.id) : scene.edges.find((e) => e.id === selected.id);
  return line(found === undefined ? `Selected: a ${selected.kind} that is not drawn now.` : `Selected: ${found.ariaLabel}.`);
}
