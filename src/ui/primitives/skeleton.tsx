import styles from './skeleton.module.css';

/**
 * A loading placeholder (UI_ARCHITECTURE §12: skeletons, never a spinner over a blank canvas). It is a status region named by
 * `label`, `aria-busy`; the bars are decorative. The shimmer stops under `prefers-reduced-motion` (base.css).
 */
export function Skeleton(props: { readonly label: string; readonly lines?: number }) {
  const lines = Math.min(Math.max(props.lines ?? 3, 1), 8);
  return (
    <div role="status" aria-busy="true" aria-label={props.label} className={styles.skeleton}>
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className={styles.bar} data-last={index === lines - 1 ? '' : undefined} aria-hidden="true" />
      ))}
    </div>
  );
}
