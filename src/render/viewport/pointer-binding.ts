/**
 * Binds the pointer state machine to an element (step 5.7, item d): ONE set of delegated listeners (pointerdown on the element,
 * pointermove / pointerup / pointercancel on its document so a drag that leaves the drawing still ends, and contextmenu), the hit
 * resolved with `hitOf`, the machine's timers asked of an injected `after` (the fake clock of the tests; `window` in the app).
 * It never moves the drawing: d3-zoom still pans and pinches, the machine only classifies the press.
 */
import { hitOf } from '@/render/svg';
import type { SceneHit } from '@/render/svg';
import { INITIAL_POINTER_STATE, stepPointer } from './pointer-machine';
import type { PointerEffect, PointerInput, PointerKind, PointerState } from './pointer-machine';

export interface PointerTimers {
  /** Runs `run` after `ms`; answers the cancel function. */
  readonly after: (ms: number, run: () => void) => () => void;
}

export interface PointerPoint {
  readonly x: number;
  readonly y: number;
}

export interface PointerHandlers {
  /** A click: select at once. */
  readonly onClick?: (hit: SceneHit | null) => void;
  /** The second click within the window. */
  readonly onDoubleClick?: (hit: SceneHit | null) => void;
  /** The window of a click passed with no second click. */
  readonly onConfirm?: (hit: SceneHit | null) => void;
  /** A right click, or a press held 500 ms; `point` is in client (screen) coordinates. */
  readonly onContextMenu?: (hit: SceneHit | null, point: PointerPoint) => void;
  /** Multi-selection (step 6.8b): a Shift click. Read live; when `multi()` is not true Shift means nothing here. */
  readonly onToggle?: (hit: SceneHit) => void;
  /** A Shift drag: the rectangle in client coordinates (corners ordered), and `done` on the release. */
  readonly onMarquee?: (rect: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }, done: boolean) => void;
  readonly onMarqueeCancel?: () => void;
  /** Whether multi-selection is on right now (Studio). Absent: off, and a Shift press behaves as a plain one. */
  readonly multi?: () => boolean;
}

export const windowTimers: PointerTimers = {
  after(ms, run) {
    const handle = window.setTimeout(run, ms);
    return () => window.clearTimeout(handle);
  },
};

const kindOf = (type: string): PointerKind => (type === 'touch' || type === 'pen' ? type : 'mouse');

export function bindPointer(element: Element, handlers: PointerHandlers, timers: PointerTimers = windowTimers): () => void {
  let state: PointerState = INITIAL_POINTER_STATE;
  /** A hold opened the menu: the browser's own click after the release is suppressed (it would move the focus and dismiss the menu). */
  let holdOpened = false;
  let late = 0;
  const cancels = new Map<number, () => void>();

  const run = (effect: PointerEffect): void => {
    switch (effect.type) {
      case 'click':
        return handlers.onClick?.(effect.hit);
      case 'doubleClick': {
        // Handed over after the browser has finished delivering this gesture's own mouseup / click / dblclick: opening a page removes
        // the drawing, and WebKit loses the mouseup of a press whose target went away mid-gesture (the next click is then dead).
        const hit = effect.hit;
        const token = (late += 1);
        cancels.set(-token, timers.after(0, () => {
          cancels.delete(-token);
          handlers.onDoubleClick?.(hit);
        }));
        return;
      }
      case 'confirm':
        return handlers.onConfirm?.(effect.hit);
      case 'toggle':
        return handlers.onToggle?.(effect.hit);
      case 'marquee':
        return handlers.onMarquee?.({ x0: Math.min(effect.from.x, effect.to.x), y0: Math.min(effect.from.y, effect.to.y), x1: Math.max(effect.from.x, effect.to.x), y1: Math.max(effect.from.y, effect.to.y) }, effect.done);
      case 'marqueeCancel':
        return handlers.onMarqueeCancel?.();
      case 'contextMenu':
        holdOpened = state.phase === 'held';
        return handlers.onContextMenu?.(effect.hit, { x: effect.x, y: effect.y });
      case 'startTimer': {
        const token = effect.token;
        cancels.set(
          token,
          timers.after(effect.ms, () => {
            cancels.delete(token);
            feed({ type: 'timer', timer: effect.timer, token });
          }),
        );
        return;
      }
      case 'cancelTimer':
        cancels.get(effect.token)?.();
        cancels.delete(effect.token);
        return;
    }
  };
  const feed = (input: PointerInput): void => {
    const step = stepPointer(state, input);
    state = step.state;
    for (const effect of step.effects) run(effect);
  };

  const down = (event: Event): void => {
    const e = event as PointerEvent;
    holdOpened = false;
    feed({ type: 'down', id: e.pointerId, kind: kindOf(e.pointerType), x: e.clientX, y: e.clientY, button: e.button, hit: hitOf(e.target), ...(e.shiftKey && handlers.multi?.() === true ? { shift: true } : {}) });
  };
  const move = (event: Event): void => {
    const e = event as PointerEvent;
    feed({ type: 'move', id: e.pointerId, x: e.clientX, y: e.clientY });
  };
  const up = (event: Event): void => {
    const e = event as PointerEvent;
    feed({ type: 'up', id: e.pointerId, x: e.clientX, y: e.clientY });
  };
  const cancel = (event: Event): void => feed({ type: 'cancel', id: (event as PointerEvent).pointerId });
  const context = (event: Event): void => {
    const e = event as MouseEvent;
    e.preventDefault();
    feed({ type: 'context', x: e.clientX, y: e.clientY, hit: hitOf(e.target) });
  };

  // After a hold the browser still sends touchend and then the compatibility mousedown / mouseup / click at the finger. The mousedown
  // would move the focus onto the drawing and dismiss the menu that just opened, so while `holdOpened` they are cancelled (the flag
  // is cleared by the next pointerdown).
  const endTouch = (event: Event): void => {
    if (holdOpened && event.cancelable) event.preventDefault();
  };
  const compat = (event: Event): void => {
    if (holdOpened && event.cancelable) event.preventDefault();
  };

  const doc = element.ownerDocument;
  element.addEventListener('pointerdown', down);
  element.addEventListener('contextmenu', context);
  element.addEventListener('touchend', endTouch, { passive: false });
  element.addEventListener('mousedown', compat);
  element.addEventListener('click', compat);
  doc.addEventListener('pointermove', move);
  doc.addEventListener('pointerup', up);
  doc.addEventListener('pointercancel', cancel);
  return () => {
    element.removeEventListener('pointerdown', down);
    element.removeEventListener('contextmenu', context);
    element.removeEventListener('touchend', endTouch);
    element.removeEventListener('mousedown', compat);
    element.removeEventListener('click', compat);
    doc.removeEventListener('pointermove', move);
    doc.removeEventListener('pointerup', up);
    doc.removeEventListener('pointercancel', cancel);
    for (const stop of cancels.values()) stop();
    cancels.clear();
  };
}
