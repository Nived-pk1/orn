/**
 * The Explore tab's switch (7.2b D1, 7.3c E1, 7.4): ONE native select labelled "Show:" with Reactions, Precursors, Reagents, Named reactions and
 * Mechanisms (a 44 px control, full width, the current choice shown), remembered as the last explorer in the UI state. Only the choice is made
 * here; the window shows the mode that choice names.
 */
import { useId } from 'react';
import { useStore } from 'zustand';
import type { ExplorerKind } from '@/ui/state';
import { useApp } from './context';
import styles from './window.module.css';

const CHOICES: readonly { readonly kind: ExplorerKind; readonly label: string }[] = [
  { kind: 'reactions', label: 'Reactions' },
  { kind: 'precursors', label: 'Precursors' },
  { kind: 'reagents', label: 'Reagents' },
  { kind: 'named', label: 'Named reactions' },
  { kind: 'mechanisms', label: 'Mechanisms' },
];

export function ExploreSwitch() {
  const { navigator } = useApp();
  const last = useStore(navigator.ui.explorer, (s) => s.last);
  const id = useId();
  return (
    <div className={styles.exploreSwitch}>
      <label htmlFor={id}>Show:</label>
      <select id={id} value={last} onChange={(event) => navigator.ui.explorer.getState().setLast(event.target.value as ExplorerKind)}>
        {CHOICES.map((choice) => (
          <option key={choice.kind} value={choice.kind}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
}
