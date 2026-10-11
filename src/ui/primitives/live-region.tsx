/**
 * The ONE polite live region of a screen (step 5.7, item h): a status region, visually hidden, that says in words what just changed.
 * `message` is replaced, never appended; `serial` makes a message that repeats (the same zoom level twice) announce again.
 */
import styles from './visually-hidden.module.css';

export function LiveRegion(props: { readonly message: string; readonly serial?: number; readonly label?: string }) {
  return (
    <div className={styles.hidden} role="status" aria-live="polite" aria-atomic="true" aria-label={props.label ?? 'Announcements'} data-serial={props.serial}>
      {props.message}
    </div>
  );
}
