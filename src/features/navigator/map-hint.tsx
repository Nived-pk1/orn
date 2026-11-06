/**
 * The top-left corner INSIDE the map (step 8.3b, A4 and B2.2): while something is selected it says "Selected: Alcohols → Haloalkanes" with a ✕
 * that clears the selection; otherwise it holds the quiet hint (or the busy-chapter text). It is a fixed-size overlay, not a row, so nothing
 * moves when a click selects a family.
 */
import styles from './map-room.module.css';

export interface MapHintProps {
  /** "Selected: A → B", or undefined when nothing is selected. */
  readonly selected: string | undefined;
  readonly onClear: () => void;
  /** The quiet hint or the busy-chapter text, or undefined. */
  readonly hint: string | undefined;
  readonly hintKind: 'quiet' | 'busy' | undefined;
}

export function MapHint(props: MapHintProps) {
  if (props.selected === undefined && props.hint === undefined) return null;
  return (
    <div className={`${styles.corner} ${styles.cornerTop}`} data-map-corner="">
      {props.selected !== undefined ? (
        <>
          <span className={styles.cornerSelected} data-map-selected="">
            {props.selected}
          </span>
          <button type="button" className={styles.cornerClear} aria-label="Clear the selection" title="Clear the selection (Esc)" onClick={props.onClear} onKeyDown={(event) => event.key === 'Escape' && props.onClear()}>
            <span aria-hidden="true">✕</span>
          </button>
        </>
      ) : (
        <span {...(props.hintKind === 'quiet' ? { 'data-map-quiet': '' } : { 'data-map-busy': '' })}>{props.hint}</span>
      )}
    </div>
  );
}
