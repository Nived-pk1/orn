/**
 * The Explore tab's switch (7.2b D1): "Reactions | Precursors", two 44 px choices, the current one marked, remembered as the last
 * explorer in the UI state. Only the choice is made here; the window shows the mode that choice names.
 */
import { useStore } from 'zustand';
import type { ExplorerKind } from '@/ui/state';
import { useApp } from './context';
import styles from './window.module.css';

const CHOICES: readonly { readonly kind: ExplorerKind; readonly label: string }[] = [
  { kind: 'reactions', label: 'Reactions' },
  { kind: 'precursors', label: 'Precursors' },
];

export function ExploreSwitch() {
  const { navigator } = useApp();
  const last = useStore(navigator.ui.explorer, (s) => s.last);
  return (
    <div role="group" aria-label="Explorer" className={styles.exploreSwitch}>
      {CHOICES.map((choice) => (
        <button key={choice.kind} type="button" aria-pressed={last === choice.kind} onClick={() => navigator.ui.explorer.getState().setLast(choice.kind)}>
          {choice.label}
        </button>
      ))}
    </div>
  );
}
