/**
 * The phone's inspector: a bottom sheet with three heights (ADR-039, UI_ARCHITECTURE §13). Closed; PEEK (about 35% of the screen: the record's
 * name, kind, key line and main actions as large buttons; the part marked `data-sheet-full` is hidden); FULL (everything). A drag handle (a
 * button too, so a keyboard or a screen reader can use it), a swipe up or down on the head, a Close button, Escape. It is a NON-MODAL region
 * labelled by the record's name (the page above stays reachable); the focus moves into it when it opens and goes back to what was focused
 * when it closes. The inspector content inside is the one the desktop shows (no second inspector).
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { IconButton, openLayers } from '@/ui/primitives';
import styles from './phone-sheet.module.css';

export type SheetHeight = 'closed' | 'peek' | 'full';
/** The id of the record's name inside the sheet: the sheet is labelled by it (the inspector puts it on its title). */
export const SHEET_TITLE_ID = 'inspector-record-title';
/** A swipe is a vertical move of at least this many pixels. */
export const SWIPE_PX = 40;

export function heightAfterSwipe(height: SheetHeight, dy: number): SheetHeight {
  if (dy <= -SWIPE_PX) return height === 'peek' ? 'full' : height;
  if (dy >= SWIPE_PX) return height === 'full' ? 'peek' : 'closed';
  return height;
}

export function PhoneSheet(props: {
  readonly title: string;
  /** A number that goes up each time something asks for the sheet (a tap on the map, a pick in a list): a closed sheet opens at peek. */
  readonly openRequest: number;
  readonly children: ReactNode;
  readonly onHeight?: (height: SheetHeight) => void;
}) {
  const { openRequest, onHeight } = props;
  const [height, setHeight] = useState<SheetHeight>('closed');
  const sheet = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const seen = useRef(openRequest);
  const swipe = useRef<{ y: number; swiped: boolean } | null>(null);
  const was = useRef<SheetHeight>('closed');
  const change = useCallback(
    (next: SheetHeight) => {
      setHeight(next);
      onHeight?.(next);
    },
    [onHeight],
  );
  useEffect(() => {
    if (seen.current === openRequest) return;
    seen.current = openRequest;
    change(height === 'closed' ? 'peek' : height);
  }, [openRequest, height, change]);
  // focus: in when it opens, back to what had it when it closes
  useEffect(() => {
    const before = was.current;
    was.current = height;
    if (before === 'closed' && height !== 'closed') {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      sheet.current?.focus({ preventScroll: true });
    } else if (before !== 'closed' && height === 'closed') {
      const back = opener.current;
      opener.current = null;
      if (back !== null && back.isConnected) back.focus({ preventScroll: true });
    }
  }, [height]);
  const escape = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape' && !event.defaultPrevented && openLayers() === 0) change('closed');
  };
  const down = (event: PointerEvent<HTMLElement>): void => {
    swipe.current = { y: event.clientY, swiped: false };
    // a mouse has no implicit capture (a touch has): without it the release is delivered to whatever is under the pointer, not to the head
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const up = (event: PointerEvent<HTMLElement>): void => {
    const start = swipe.current;
    if (start === null) return;
    const next = heightAfterSwipe(height, event.clientY - start.y);
    if (next !== height) {
      start.swiped = true;
      change(next);
    }
  };
  const toggle = (): void => {
    // a click that ends a swipe is not a tap on the handle
    if (swipe.current?.swiped === true) {
      swipe.current = null;
      return;
    }
    change(height === 'peek' ? 'full' : 'peek');
  };
  return (
    <aside
      ref={sheet}
      className={styles.sheet}
      data-sheet={height}
      aria-label={props.title}
      aria-labelledby={SHEET_TITLE_ID}
      tabIndex={-1}
      hidden={height === 'closed'}
      onKeyDown={escape}
    >
      <div className={styles.head} onPointerDown={down} onPointerUp={up} onPointerCancel={() => (swipe.current = null)}>
        <button type="button" className={styles.handle} aria-label={height === 'peek' ? 'Show the whole record' : 'Show less'} onClick={toggle}>
          <span className={styles.grip} aria-hidden="true" />
        </button>
        <IconButton label="Close inspector" icon="close" onClick={() => change('closed')} />
      </div>
      <div className={styles.body}>{props.children}</div>
    </aside>
  );
}
