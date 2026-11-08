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
  /** Step 8.4b: "Zoom to X" next to the clear button; absent: no button. */
  readonly onZoom?: (() => void) | undefined;
  readonly zoomName?: string | undefined;
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
          {props.onZoom === undefined ? null : (
            <button type="button" className={styles.cornerClear} aria-label={`Zoom to ${props.zoomName ?? 'the selection'}`} title="Zoom to selection (Z)" onClick={props.onZoom}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M7 2.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zM10.5 10.5l3 3M5 7h4M7 5v4" />
              </svg>
            </button>
          )}
          <button type="button" className={styles.cornerClear} aria-label="Clear the selection" title="Clear the selection (Esc)" onClick={props.onClear} onKeyDown={(event) => event.key === 'Escape' && props.onClear()}>
            <span aria-hidden="true">✕</span>
          </button>
          {props.hintKind === 'busy' && props.hint !== undefined ? <span data-map-busy="">{props.hint}</span> : null}
        </>
      ) : (
        <span {...(props.hintKind === 'quiet' ? { 'data-map-quiet': '' } : { 'data-map-busy': '' })}>{props.hint}</span>
      )}
    </div>
  );
}
