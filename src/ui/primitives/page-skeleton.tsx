import { VisuallyHidden } from './visually-hidden';
import styles from './page-skeleton.module.css';

/**
 * What a lazy page shows while its chunk loads (step 8.4f, D4; UI_ARCHITECTURE §12: a skeleton that has the shape of what is coming, so the
 * content arriving does not move anything). `list`: a title, a filter row and cards (Chapters, Reactions, the explorers); `rows`: grouped
 * rows (Settings). A busy status region named by `label`; the blocks are decorative; the shimmer stops with reduced motion.
 */
export function PageSkeleton(props: { readonly label: string; readonly shape?: 'list' | 'rows' }) {
  const rows = props.shape === 'rows';
  return (
    <div role="status" aria-busy="true" className={rows ? `${styles.page} ${styles.narrow}` : styles.page}>
      <VisuallyHidden>{props.label}</VisuallyHidden>
      <span className={styles.block} data-sk="label" aria-hidden="true" />
      <span className={styles.block} data-sk="title" aria-hidden="true" />
      {rows ? (
        <div className={styles.rows} aria-hidden="true">
          {[0, 1, 2].map((n) => (
            <span key={n} className={styles.block} data-sk="row" />
          ))}
        </div>
      ) : (
        <>
          <span className={styles.chips} aria-hidden="true">
            {[0, 1, 2].map((n) => (
              <span key={n} className={styles.block} data-sk="chip" />
            ))}
          </span>
          {[0, 1, 2, 3].map((n) => (
            <span key={n} className={styles.block} data-sk="card" aria-hidden="true" />
          ))}
        </>
      )}
    </div>
  );
}
