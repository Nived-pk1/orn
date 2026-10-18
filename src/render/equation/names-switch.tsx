/**
 * The "Names" switch of the textbook equation (equation step, part 5; moved onto the "Show full equation" line in part 6): a checkbox that
 * shows or hides the name lines under the drawings. It is a component of its own so the card can put it on its disclosure line and the
 * inspector can keep it in the scheme's header.
 */
import styles from './equation-scheme.module.css';

export function NamesSwitch(props: { readonly names: boolean; readonly onChange: (names: boolean) => void }) {
  return (
    <label className={styles.names}>
      <input type="checkbox" checked={props.names} onChange={(event) => props.onChange(event.target.checked)} />
      <span>Names</span>
    </label>
  );
}
