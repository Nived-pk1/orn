/**
 * The top-right bar INSIDE the map (steps 8.3b A4 and B2.2, 8.4e A1): while something is selected it says "Selected: Alcohols → Haloalkanes" with
 * Open family, Zoom to selection and a ✕ that clears the selection; otherwise it holds the quiet hint (or the busy-chapter text), as plain text.
 * It floats over the map, not in a row, so nothing moves when a click selects a family.
 */
import type { ReactNode } from 'react';
import styles from './map-float.module.css';

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
  /** Open family / Open reactions, drawn in the Selected bar. */
  readonly open?: ReactNode;
}

export function MapHint(props: MapHintProps) {
  if (props.selected === undefined && props.hint === undefined) return null;
  return (
    <div className={props.selected === undefined ? styles.hint : styles.selectedBar} data-map-corner="" data-map-control="bar">
      {props.selected !== undefined ? (
        <>
          <span className={styles.cornerSelected} data-map-selected="">
            {props.selected}
          </span>
          {props.open}
          {props.onZoom === undefined ? null : (
            <button type="button" className={styles.barIcon} aria-label={`Zoom to ${props.zoomName ?? 'the selection'}`} title="Zoom to selection (Z)" onClick={props.onZoom}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M7 2.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zM10.5 10.5l3 3M5 7h4M7 5v4" />
              </svg>
            </button>
          )}
          <button type="button" className={styles.barIcon} aria-label="Clear the selection" title="Clear the selection (Esc)" onClick={props.onClear} onKeyDown={(event) => event.key === 'Escape' && props.onClear()}>
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
