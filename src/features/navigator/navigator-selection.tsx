/** The selection in one text line for the inspector pane (step 5.5a; the inspector itself is step 5.6a). */
import { useStore } from 'zustand';
import { useNavigator, useNavigatorState } from './navigator-context';

export function NavigatorSelection() {
  const { ports } = useNavigator();
  const selected = useStore(ports.ui.selection, (s) => s.selected);
  const { scene } = useNavigatorState();
  if (selected === null) return <p>Nothing is selected.</p>;
  const found = scene === null ? undefined : selected.kind === 'node' ? scene.nodes.find((n) => n.id === selected.id) : scene.edges.find((e) => e.id === selected.id);
  return <p>{found === undefined ? `Selected: a ${selected.kind} that is not drawn now.` : `Selected: ${found.ariaLabel}.`}</p>;
}
