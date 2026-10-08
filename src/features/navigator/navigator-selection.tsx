/** The selection in one text line beside the canvas toolbar (step 5.5a review, item g; the inspector itself is step 5.6a). */
import { useStore } from 'zustand';
import { useNavigator, useNavigatorState } from './navigator-context';
import styles from './navigator.module.css';

export function NavigatorSelection() {
  const { ports } = useNavigator();
  const selected = useStore(ports.ui.selection, (s) => s.selected);
  const { scene } = useNavigatorState();
  if (selected === null) return <p className={styles.selection}>Nothing is selected.</p>;
  const found = scene === null ? undefined : selected.kind === 'node' ? scene.nodes.find((n) => n.id === selected.id) : scene.edges.find((e) => e.id === selected.id);
  return <p className={styles.selection}>{found === undefined ? `Selected: a ${selected.kind} that is not drawn now.` : `Selected: ${found.ariaLabel}.`}</p>;
}
