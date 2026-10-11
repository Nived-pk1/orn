/**
 * The pointer state machine of the canvas (step 5.7, item d; UI_ARCHITECTURE §10). Pure: an input and a state in, a state and
 * effects out; timers are asked for by effect and answered by a `timer` input, so the table tests need no clock.
 *
 *   idle -> pressed -> (moved over 4 px) panning | (500 ms still) held, a context menu | (released) a click
 *
 * A click selects at once. A second click on the same target within 300 ms of the first is a double click; when that window
 * passes with no second click the first is CONFIRMED (the inspector pane may open now, because nothing will move under a second
 * click any more). A second pointer (a pinch) cancels the press. Panning itself is d3-zoom's; the machine only decides that the
 * press was one, so it never ends as a click.
 */
import type { SceneHit } from '@/render/svg';

export const MOVE_SLOP_PX = 4;
export const LONG_PRESS_MS = 500;
export const DOUBLE_CLICK_MS = 300;

export type PointerKind = 'mouse' | 'touch' | 'pen';

export type PointerInput =
  | { readonly type: 'down'; readonly id: number; readonly kind: PointerKind; readonly x: number; readonly y: number; readonly button: number; readonly hit: SceneHit | null }
  | { readonly type: 'move'; readonly id: number; readonly x: number; readonly y: number }
  | { readonly type: 'up'; readonly id: number; readonly x: number; readonly y: number }
  | { readonly type: 'cancel'; readonly id: number }
  /** The browser's own context-menu event (a right click, the long press of some touch browsers). */
  | { readonly type: 'context'; readonly x: number; readonly y: number; readonly hit: SceneHit | null }
  | { readonly type: 'timer'; readonly timer: 'long' | 'window'; readonly token: number };

export type PointerEffect =
  | { readonly type: 'click'; readonly hit: SceneHit | null }
  | { readonly type: 'doubleClick'; readonly hit: SceneHit | null }
  | { readonly type: 'confirm'; readonly hit: SceneHit | null }
  | { readonly type: 'contextMenu'; readonly hit: SceneHit | null; readonly x: number; readonly y: number }
  | { readonly type: 'startTimer'; readonly timer: 'long' | 'window'; readonly ms: number; readonly token: number }
  | { readonly type: 'cancelTimer'; readonly token: number };

interface Pending {
  readonly hit: SceneHit | null;
  readonly token: number;
}

export type PointerState =
  | { readonly phase: 'idle'; readonly pending: Pending | null; readonly seq: number }
  | { readonly phase: 'pressed'; readonly id: number; readonly kind: PointerKind; readonly x: number; readonly y: number; readonly hit: SceneHit | null; readonly long: number; readonly pending: Pending | null; readonly seq: number }
  | { readonly phase: 'panning'; readonly id: number; readonly pending: Pending | null; readonly seq: number }
  | { readonly phase: 'held'; readonly id: number; readonly pending: Pending | null; readonly seq: number }
  /** Two or more pointers down: a pinch. Ends when every pointer is up. */
  | { readonly phase: 'multi'; readonly ids: readonly number[]; readonly pending: Pending | null; readonly seq: number };

export const INITIAL_POINTER_STATE: PointerState = { phase: 'idle', pending: null, seq: 0 };

export interface PointerStep {
  readonly state: PointerState;
  readonly effects: readonly PointerEffect[];
}

const same = (a: SceneHit | null, b: SceneHit | null): boolean => a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);
const moved = (from: { readonly x: number; readonly y: number }, to: { readonly x: number; readonly y: number }): boolean => Math.hypot(to.x - from.x, to.y - from.y) > MOVE_SLOP_PX;
const stay = (state: PointerState): PointerStep => ({ state, effects: [] });
const idle = (state: PointerState): PointerState => ({ phase: 'idle', pending: state.pending, seq: state.seq });

export function stepPointer(state: PointerState, input: PointerInput): PointerStep {
  switch (input.type) {
    case 'down': {
      if (input.button !== 0) return stay(state);
      if (state.phase === 'idle') {
        const seq = state.seq + 1;
        return {
          state: { phase: 'pressed', id: input.id, kind: input.kind, x: input.x, y: input.y, hit: input.hit, long: seq, pending: state.pending, seq },
          effects: [{ type: 'startTimer', timer: 'long', ms: LONG_PRESS_MS, token: seq }],
        };
      }
      if (state.phase === 'multi') return stay({ ...state, ids: state.ids.includes(input.id) ? state.ids : [...state.ids, input.id] });
      // a second pointer while one is down: a pinch; a press waiting for 500 ms is cancelled
      const effects: PointerEffect[] = state.phase === 'pressed' ? [{ type: 'cancelTimer', token: state.long }] : [];
      return { state: { phase: 'multi', ids: [state.id, input.id], pending: state.pending, seq: state.seq }, effects };
    }
    case 'move': {
      if (state.phase !== 'pressed' || state.id !== input.id || !moved(state, input)) return stay(state);
      return { state: { phase: 'panning', id: state.id, pending: state.pending, seq: state.seq }, effects: [{ type: 'cancelTimer', token: state.long }] };
    }
    case 'up': {
      if (state.phase === 'multi') {
        const ids = state.ids.filter((id) => id !== input.id);
        return stay(ids.length === 0 ? idle(state) : { ...state, ids });
      }
      if (state.phase === 'idle') return stay(state);
      if (state.id !== input.id) return stay(state);
      if (state.phase === 'panning' || state.phase === 'held') return stay(idle(state));
      const effects: PointerEffect[] = [{ type: 'cancelTimer', token: state.long }];
      const { hit, pending } = state;
      if (pending !== null && same(pending.hit, hit)) {
        // the second click of a double click: the first one's window ends here
        effects.push({ type: 'cancelTimer', token: pending.token }, { type: 'doubleClick', hit });
        return { state: { phase: 'idle', pending: null, seq: state.seq }, effects };
      }
      const seq = state.seq + 1;
      if (pending !== null) effects.push({ type: 'cancelTimer', token: pending.token }, { type: 'confirm', hit: pending.hit });
      effects.push({ type: 'click', hit }, { type: 'startTimer', timer: 'window', ms: DOUBLE_CLICK_MS, token: seq });
      return { state: { phase: 'idle', pending: { hit, token: seq }, seq }, effects };
    }
    case 'cancel': {
      if (state.phase === 'idle') return stay(state);
      if (state.phase === 'multi') {
        const ids = state.ids.filter((id) => id !== input.id);
        return stay(ids.length === 0 ? idle(state) : { ...state, ids });
      }
      if (state.id !== input.id) return stay(state);
      const effects: PointerEffect[] = state.phase === 'pressed' ? [{ type: 'cancelTimer', token: state.long }] : [];
      return { state: idle(state), effects };
    }
    case 'context': {
      // a touch browser's own context-menu event for a press that is still waiting stands for the long press; after it, it is a repeat
      if (state.phase === 'held') return stay(state);
      if (state.phase === 'pressed') {
        return {
          state: { phase: 'held', id: state.id, pending: state.pending, seq: state.seq },
          effects: [{ type: 'cancelTimer', token: state.long }, { type: 'contextMenu', hit: state.hit, x: input.x, y: input.y }],
        };
      }
      return { state, effects: [{ type: 'contextMenu', hit: input.hit, x: input.x, y: input.y }] };
    }
    case 'timer': {
      if (input.timer === 'long') {
        if (state.phase !== 'pressed' || state.long !== input.token) return stay(state);
        return {
          state: { phase: 'held', id: state.id, pending: state.pending, seq: state.seq },
          effects: [{ type: 'contextMenu', hit: state.hit, x: state.x, y: state.y }],
        };
      }
      if (state.pending === null || state.pending.token !== input.token) return stay(state);
      return { state: { ...state, pending: null }, effects: [{ type: 'confirm', hit: state.pending.hit }] };
    }
  }
}
