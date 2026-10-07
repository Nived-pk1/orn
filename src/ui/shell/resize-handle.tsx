/**
 * The separator between the canvas and the inspector (UI_ARCHITECTURE §2: 360-520 px, resizable). A keyboard-operable
 * `role="separator"` (WAI-ARIA window splitter): Left widens the inspector, Right narrows it, Shift for a large step, Home and End for
 * the extremes. Dragging with a pointer is the same change. The width itself is the caller's (the panels store clamps it).
 */
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import styles from './shell.module.css';

export const STEP = 16;
export const BIG_STEP = 64;

export interface ResizeHandleProps {
  readonly width: number;
  readonly min: number;
  readonly max: number;
  readonly onWidth: (width: number) => void;
  /** The element whose right edge the inspector hugs (the shell), to turn a pointer position into a width. */
  readonly edge: () => number | null;
}

export function ResizeHandle(props: ResizeHandleProps) {
  const dragging = useRef(false);
  const key = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = props.width + step;
    else if (event.key === 'ArrowRight') next = props.width - step;
    else if (event.key === 'Home') next = props.min;
    else if (event.key === 'End') next = props.max;
    if (next === null) return;
    event.preventDefault();
    props.onWidth(next);
  };
  const down = (event: PointerEvent<HTMLDivElement>): void => {
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>): void => {
    if (!dragging.current) return;
    const right = props.edge();
    if (right !== null) props.onWidth(right - event.clientX);
  };
  const up = (event: PointerEvent<HTMLDivElement>): void => {
    dragging.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  return (
    <div
      className={styles.handle}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inspector"
      aria-valuemin={props.min}
      aria-valuemax={props.max}
      aria-valuenow={props.width}
      tabIndex={0}
      onKeyDown={key}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    />
  );
}
