/**
 * The legend (step 5.5c): a row under the toolbar listing each family group once with its swatch and its name. The swatch is the tone's
 * tint, border and ink from the tokens; the name is always written (colour is never the only carrier).
 */
import type { LegendItem } from './legend';
import styles from './navigator.module.css';

export function NavigatorLegend(props: { readonly items: readonly LegendItem[] }) {
  if (props.items.length === 0) return null;
  return (
    <ul className={styles.legend} aria-label="Family groups">
      {props.items.map((item) => (
        <li key={item.group} className={styles.legendItem} data-group={item.group}>
          <span className={styles.swatch} data-tone={item.tone} aria-hidden="true" />
          {item.group}
        </li>
      ))}
    </ul>
  );
}
