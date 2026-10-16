/**
 * The phone's Families tab (ADR-039): the List view's own families as cards grouped by colour group (name, general formula,
 * "N reactions"); a tap opens the family page (the Unclassified box, which has none, shows it in the inspector). "Unanchored reactions (N)"
 * closes the tab, as it does on the map's toolbar. It reads the Scene like the List view, so it can never show more or less than the map.
 */
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/ui/primitives';
import { familyCardsOf } from './family-cards';
import { Runs } from './family-text';
import { useNavigator, useNavigatorState } from './navigator-context';
import { UnanchoredPanel } from './unanchored-panel';
import styles from './phone-home.module.css';

const plural = (n: number): string => `${n} ${n === 1 ? 'reaction' : 'reactions'}`;

export function FamiliesTab() {
  const { ports } = useNavigator();
  const state = useNavigatorState();
  const groups = useMemo(() => familyCardsOf(state.scene), [state.scene]);
  const [unanchoredOpen, setUnanchoredOpen] = useState(false);
  const unanchored = state.unanchored;
  const open = useCallback(
    (id: string): void => {
      if (state.hubIds.includes(id)) ports.ui.family.getState().openFamily(id);
      else {
        ports.ui.selection.getState().select({ kind: 'node', id });
        ports.ui.selection.getState().reveal();
      }
    },
    [ports, state.hubIds],
  );
  if (state.error !== null) {
    return (
      <div role="alert" className={styles.families}>
        <p>The navigator could not be drawn ({state.error.code}).</p>
        <p>{state.error.message}</p>
      </div>
    );
  }
  return (
    <section className={styles.families} aria-label="Families" data-view="families">
      {groups.map((group) => (
        <section key={group.title} className={styles.group} aria-label={group.title}>
          <h2 className={styles.groupTitle}>{group.title}</h2>
          <ul className={styles.cards}>
            {group.cards.map((card) => (
              <li key={card.id}>
                <button type="button" className={styles.card} data-tone={card.tone} data-family-id={card.id} onClick={() => open(card.id)}>
                  <span className={styles.cardName}>{card.name}</span>
                  {card.formula === undefined ? null : (
                    <span className={styles.cardFormula}>
                      <Runs runs={card.formula} />
                    </span>
                  )}
                  <span className={styles.cardCount}>{plural(card.reactions)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className={styles.group} aria-label="Unanchored reactions">
        <Button
          className={styles.unanchored}
          aria-expanded={unanchoredOpen && unanchored.length > 0}
          onClick={() => setUnanchoredOpen((was) => !was)}
          {...(unanchored.length === 0 ? { unavailable: 'every reaction is in a family' } : {})}
        >
          Unanchored reactions ({unanchored.length})
        </Button>
        {unanchoredOpen && unanchored.length > 0 ? <UnanchoredPanel ids={unanchored} onClose={() => setUnanchoredOpen(false)} /> : null}
      </section>
    </section>
  );
}
