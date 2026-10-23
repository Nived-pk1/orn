/** The phone's Select toggle (step 6.8b, R2; Studio only): a pill beside Fit and Legend; while it is on, a tap toggles the item under it. */
import styles from './phone-home.module.css';

export function SelectToggle(props: { readonly on: boolean; readonly set: (on: boolean) => void }) {
  return (
    <button type="button" className={`${styles.round} ${styles.pill} ${props.on ? styles.on : ''}`} aria-pressed={props.on} onClick={() => props.set(!props.on)}>
      Select
    </button>
  );
}
