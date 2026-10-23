/**
 * Pointer gestures for component tests (step 5.7): the canvas classifies presses with the pointer state machine, so a test taps with
 * pointer events (a `click` event alone does nothing on the map). jsdom has no PointerEvent here, so the properties the binding reads
 * are defined on a MouseEvent. The clock is the app's injected one (`navigator.timers`), never a real timer.
 */
import { act } from '@testing-library/react';

export interface PointerInit {
  readonly id?: number;
  readonly kind?: 'mouse' | 'touch' | 'pen';
  readonly x?: number;
  readonly y?: number;
  /** Shift held (multi-selection, step 6.8b). */
  readonly shift?: boolean;
}

export function firePointer(target: Element | Document, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', init: PointerInit = {}): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.x ?? 10, clientY: init.y ?? 10, button: 0, shiftKey: init.shift === true });
  Object.defineProperty(event, 'pointerId', { value: init.id ?? 1 });
  Object.defineProperty(event, 'pointerType', { value: init.kind ?? 'mouse' });
  act(() => {
    target.dispatchEvent(event);
  });
}

/** A press and a release on the target. */
export function tap(target: Element, init: PointerInit = {}): void {
  firePointer(target, 'pointerdown', init);
  firePointer(target.ownerDocument, 'pointerup', init);
}

/** Two taps in a row (inside the 300 ms window: no time passes between them). */
export function doubleTap(target: Element, init: PointerInit = {}): void {
  tap(target, init);
  tap(target, init);
}
