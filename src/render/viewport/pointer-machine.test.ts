/**
 * The pointer state machine (step 5.7, item d): a table of gestures, each a list of inputs and the effects it must produce, in order.
 * Timers are inputs here (`long` / `window` with the token the machine asked for), so no clock is needed; `pointer-binding.test.ts`
 * runs the same gestures through the DOM with a fake clock.
 */
import { describe, expect, it } from 'vitest';
import type { SceneHit } from '@/render/svg';
import { DOUBLE_CLICK_MS, INITIAL_POINTER_STATE, LONG_PRESS_MS, MOVE_SLOP_PX, stepPointer } from './pointer-machine';
import type { PointerEffect, PointerInput, PointerState } from './pointer-machine';

const A: SceneHit = { kind: 'node', id: 'a' };
const B: SceneHit = { kind: 'node', id: 'b' };
const down = (hit: SceneHit | null, id = 1, kind: 'mouse' | 'touch' = 'mouse', button = 0): PointerInput => ({ type: 'down', id, kind, x: 10, y: 10, button, hit });
const move = (dx: number, id = 1): PointerInput => ({ type: 'move', id, x: 10 + dx, y: 10 });
const up = (id = 1): PointerInput => ({ type: 'up', id, x: 10, y: 10 });
const timer = (which: 'long' | 'window', token: number): PointerInput => ({ type: 'timer', timer: which, token });
const start = (which: 'long' | 'window', ms: number, token: number): PointerEffect => ({ type: 'startTimer', timer: which, ms, token });
const stop = (token: number): PointerEffect => ({ type: 'cancelTimer', token });

function play(inputs: readonly PointerInput[]): { readonly effects: PointerEffect[]; readonly state: PointerState } {
  let state = INITIAL_POINTER_STATE;
  const effects: PointerEffect[] = [];
  for (const input of inputs) {
    const step = stepPointer(state, input);
    state = step.state;
    effects.push(...step.effects);
  }
  return { effects, state };
}

interface Row {
  readonly name: string;
  readonly inputs: readonly PointerInput[];
  readonly effects: readonly PointerEffect[];
  readonly phase: PointerState['phase'];
}

const TABLE: readonly Row[] = [
  { name: 'a press asks for the 500 ms timer', inputs: [down(A)], effects: [start('long', LONG_PRESS_MS, 1)], phase: 'pressed' },
  {
    name: 'press and release: a click at once, then the 300 ms window',
    inputs: [down(A), up()],
    effects: [start('long', 500, 1), stop(1), { type: 'click', hit: A }, start('window', DOUBLE_CLICK_MS, 2)],
    phase: 'idle',
  },
  {
    name: 'a click on empty canvas is a click with no hit',
    inputs: [down(null), up()],
    effects: [start('long', 500, 1), stop(1), { type: 'click', hit: null }, start('window', 300, 2)],
    phase: 'idle',
  },
  {
    name: 'the window passing confirms the click',
    inputs: [down(A), up(), timer('window', 2)],
    effects: [start('long', 500, 1), stop(1), { type: 'click', hit: A }, start('window', 300, 2), { type: 'confirm', hit: A }],
    phase: 'idle',
  },
  {
    name: 'a second click on the same target inside the window is a double click (no confirm)',
    inputs: [down(A), up(), down(A), up()],
    effects: [
      start('long', 500, 1), stop(1), { type: 'click', hit: A }, start('window', 300, 2),
      start('long', 500, 3), stop(3), stop(2), { type: 'doubleClick', hit: A },
    ],
    phase: 'idle',
  },
  {
    name: 'a second click on ANOTHER target confirms the first and clicks the new one',
    inputs: [down(A), up(), down(B), up()],
    effects: [
      start('long', 500, 1), stop(1), { type: 'click', hit: A }, start('window', 300, 2),
      start('long', 500, 3), stop(3), stop(2), { type: 'confirm', hit: A }, { type: 'click', hit: B }, start('window', 300, 4),
    ],
    phase: 'idle',
  },
  {
    name: 'a third click after a double click is a new click',
    inputs: [down(A), up(), down(A), up(), down(A), up()],
    effects: [
      start('long', 500, 1), stop(1), { type: 'click', hit: A }, start('window', 300, 2),
      start('long', 500, 3), stop(3), stop(2), { type: 'doubleClick', hit: A },
      start('long', 500, 4), stop(4), { type: 'click', hit: A }, start('window', 300, 5),
    ],
    phase: 'idle',
  },
  {
    name: 'moving more than 4 px pans: no click, no menu',
    inputs: [down(A), move(MOVE_SLOP_PX + 1), up()],
    effects: [start('long', 500, 1), stop(1)],
    phase: 'idle',
  },
  { name: 'moving exactly 4 px is still a press', inputs: [down(A), move(MOVE_SLOP_PX)], effects: [start('long', 500, 1)], phase: 'pressed' },
  {
    name: 'a small wobble then release is a click',
    inputs: [down(A), move(2), up()],
    effects: [start('long', 500, 1), stop(1), { type: 'click', hit: A }, start('window', 300, 2)],
    phase: 'idle',
  },
  {
    name: 'held still 500 ms: the context menu, and the release is not a click',
    inputs: [down(A), timer('long', 1), up()],
    effects: [start('long', 500, 1), { type: 'contextMenu', hit: A, x: 10, y: 10 }],
    phase: 'idle',
  },
  {
    name: 'a stale long-press timer does nothing',
    inputs: [down(A), up(), timer('long', 1)],
    effects: [start('long', 500, 1), stop(1), { type: 'click', hit: A }, start('window', 300, 2)],
    phase: 'idle',
  },
  {
    name: 'a pan cancels the long press',
    inputs: [down(A), move(20), timer('long', 1)],
    effects: [start('long', 500, 1), stop(1)],
    phase: 'panning',
  },
  {
    name: 'a second finger (a pinch) cancels the press; nothing is clicked when both lift',
    inputs: [down(A, 1, 'touch'), down(B, 2, 'touch'), up(1), up(2)],
    effects: [start('long', 500, 1), stop(1)],
    phase: 'idle',
  },
  { name: 'a right button is not a press', inputs: [down(A, 1, 'mouse', 2), up()], effects: [], phase: 'idle' },
  {
    name: 'a right click (the browser context event) opens the menu on the target',
    inputs: [{ type: 'context', x: 5, y: 6, hit: A }],
    effects: [{ type: 'contextMenu', hit: A, x: 5, y: 6 }],
    phase: 'idle',
  },
  {
    name: 'a touch browser context event during a press stands for the long press, once',
    inputs: [down(A, 1, 'touch'), { type: 'context', x: 10, y: 10, hit: A }, { type: 'context', x: 10, y: 10, hit: A }, timer('long', 1), up()],
    effects: [start('long', 500, 1), stop(1), { type: 'contextMenu', hit: A, x: 10, y: 10 }],
    phase: 'idle',
  },
  {
    name: 'a cancelled pointer ends the press without a click',
    inputs: [down(A), { type: 'cancel', id: 1 }],
    effects: [start('long', 500, 1), stop(1)],
    phase: 'idle',
  },
  {
    name: 'a press of the same target after the window is a new click, not a double click',
    inputs: [down(A), up(), timer('window', 2), down(A), up()],
    effects: [
      start('long', 500, 1), stop(1), { type: 'click', hit: A }, start('window', 300, 2), { type: 'confirm', hit: A },
      start('long', 500, 3), stop(3), { type: 'click', hit: A }, start('window', 300, 4),
    ],
    phase: 'idle',
  },
  { name: 'events of another pointer are ignored', inputs: [down(A), move(30, 9), up(9)], effects: [start('long', 500, 1)], phase: 'pressed' },
];

describe('the pointer state machine', () => {
  it.each(TABLE.map((row) => [row.name, row] as const))('%s', (_name, row) => {
    const result = play(row.inputs);
    expect(result.effects).toEqual(row.effects);
    expect(result.state.phase).toBe(row.phase);
  });

  it('uses the constants of UI_ARCHITECTURE section 10: 4 px, 500 ms, 300 ms', () => {
    expect([MOVE_SLOP_PX, LONG_PRESS_MS, DOUBLE_CLICK_MS]).toEqual([4, 500, 300]);
  });

  it('is deterministic: the same inputs give the same effects', () => {
    const inputs = [down(A), up(), down(A), up(), down(B), move(9), up()];
    expect(play(inputs)).toEqual(play(inputs));
  });
});
