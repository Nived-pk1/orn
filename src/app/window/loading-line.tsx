/** The fallback of every lazy view of the canvas (7.6 A4): a muted "Loading…" line (role status) while its chunk loads, so a page is never silently empty. */
import styles from './window.module.css';

export function LoadingLine() {
  return (
    <p role="status" className={styles.loadingLine}>
      Loading…
    </p>
  );
}
