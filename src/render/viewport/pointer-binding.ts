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
  const cancels = new Map<number, () => void>();

  const run = (effect: PointerEffect): void => {
    switch (effect.type) {
      case 'click':
        return handlers.onClick?.(effect.hit);
      case 'doubleClick':
        return handlers.onDoubleClick?.(effect.hit);
      case 'confirm':
        return handlers.onConfirm?.(effect.hit);
      case 'contextMenu':
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
    feed({ type: 'down', id: e.pointerId, kind: kindOf(e.pointerType), x: e.clientX, y: e.clientY, button: e.button, hit: hitOf(e.target) });
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

  const doc = element.ownerDocument;
  element.addEventListener('pointerdown', down);
  element.addEventListener('contextmenu', context);
  doc.addEventListener('pointermove', move);
  doc.addEventListener('pointerup', up);
  doc.addEventListener('pointercancel', cancel);
  return () => {
    element.removeEventListener('pointerdown', down);
    element.removeEventListener('contextmenu', context);
    doc.removeEventListener('pointermove', move);
    doc.removeEventListener('pointerup', up);
    doc.removeEventListener('pointercancel', cancel);
    for (const stop of cancels.values()) stop();
    cancels.clear();
  };
}
