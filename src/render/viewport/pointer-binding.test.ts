// @vitest-environment jsdom
/**
 * The pointer binding (step 5.7, item d): the gestures of the table run through real DOM events and the fake clock of the tests
 * (never a real timer): a click at once, the confirmation after 300 ms, a double click, a 500 ms hold, a pan, a pinch.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { manualTimers } from '@/test-support/navigator-kit';
import { bindPointer } from './pointer-binding';
import type { PointerHandlers } from './pointer-binding';

type Log = string[];
let svg: SVGSVGElement;
let log: Log;
let timers: ReturnType<typeof manualTimers>;
let unbind: () => void;

function fire(target: Element | Document, type: string, init: { id?: number; kind?: string; x?: number; y?: number; button?: number; shift?: boolean } = {}): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.x ?? 10, clientY: init.y ?? 10, button: init.button ?? 0, shiftKey: init.shift === true });
  Object.defineProperty(event, 'pointerId', { value: init.id ?? 1 });
  Object.defineProperty(event, 'pointerType', { value: init.kind ?? 'mouse' });
  target.dispatchEvent(event);
}
const node = (id: string): Element => svg.querySelector(`[data-node-id="${id}"]`) as Element;

beforeEach(() => {
  document.body.replaceChildren();
  const ns = 'http://www.w3.org/2000/svg';
  svg = document.createElementNS(ns, 'svg');
  for (const id of ['a', 'b']) {
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('data-node-id', id);
    group.append(document.createElementNS(ns, 'rect'));
    svg.append(group);
  }
  document.body.append(svg);
  log = [];
  timers = manualTimers();
  const handlers: PointerHandlers = {
    onClick: (hit) => log.push(`click ${hit?.id ?? 'none'}`),
    onDoubleClick: (hit) => log.push(`double ${hit?.id ?? 'none'}`),
    onConfirm: (hit) => log.push(`confirm ${hit?.id ?? 'none'}`),
    onContextMenu: (hit, point) => log.push(`menu ${hit?.id ?? 'none'} ${point.x},${point.y}`),
  };
  unbind = bindPointer(svg, handlers, timers);
});
afterEach(() => unbind());

const tap = (target: Element, init = {}): void => {
  fire(target, 'pointerdown', init);
  fire(document, 'pointerup', init);
};

describe('the pointer binding, with a fake clock', () => {
  it('a click selects at once and is confirmed when 300 ms pass', () => {
    tap(node('a'));
    expect(log).toEqual(['click a']);
    timers.advance(299);
    expect(log).toEqual(['click a']);
    timers.advance(1);
    expect(log).toEqual(['click a', 'confirm a']);
  });

  it('a second click within 300 ms is a double click and the first is never confirmed', () => {
    tap(node('a'));
    timers.advance(200);
    tap(node('a'));
    timers.advance(1000);
    expect(log).toEqual(['click a', 'double a']);
    expect(timers.pending()).toBe(0);
  });

  it('a second click after 300 ms is a new click', () => {
    tap(node('a'));
    timers.advance(300);
    tap(node('a'));
    timers.advance(300);
    expect(log).toEqual(['click a', 'confirm a', 'click a', 'confirm a']);
  });

  it('a click on empty canvas has no hit', () => {
    tap(svg);
    expect(log).toEqual(['click none']);
  });

  it('holding 500 ms opens the menu where the finger is; the release is not a click', () => {
    fire(node('b'), 'pointerdown', { kind: 'touch', x: 30, y: 40 });
    timers.advance(499);
    expect(log).toEqual([]);
    timers.advance(1);
    expect(log).toEqual(['menu b 30,40']);
    fire(document, 'pointerup', { kind: 'touch' });
    timers.advance(1000);
    expect(log).toEqual(['menu b 30,40']);
  });

  it('after a hold the browsers own touchend, mousedown and click are cancelled (they would dismiss the menu); the next press clears that', () => {
    fire(node('b'), 'pointerdown', { kind: 'touch' });
    timers.advance(500);
    fire(document, 'pointerup', { kind: 'touch' });
    for (const type of ['touchend', 'mousedown', 'click']) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      node('b').dispatchEvent(event);
      expect(event.defaultPrevented, type).toBe(true);
    }
    fire(node('a'), 'pointerdown');
    const later = new Event('mousedown', { bubbles: true, cancelable: true });
    node('a').dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });

  it('a drag over 4 px pans: no click, no menu, and the timer is gone', () => {
    fire(node('a'), 'pointerdown');
    fire(document, 'pointermove', { x: 20 });
    fire(document, 'pointerup', { x: 20 });
    timers.advance(1000);
    expect(log).toEqual([]);
    expect(timers.pending()).toBe(0);
  });

  it('a drag that ends outside the drawing still ends (the release is seen on the document)', () => {
    fire(node('a'), 'pointerdown');
    fire(document.body, 'pointerup');
    expect(log).toEqual(['click a']);
  });

  it('a pinch (two pointers) clicks nothing', () => {
    fire(node('a'), 'pointerdown', { id: 1, kind: 'touch' });
    fire(node('b'), 'pointerdown', { id: 2, kind: 'touch' });
    fire(document, 'pointerup', { id: 1, kind: 'touch' });
    fire(document, 'pointerup', { id: 2, kind: 'touch' });
    timers.advance(1000);
    expect(log).toEqual([]);
  });

  it('a right click opens the menu on the target and is not a click', () => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 7, clientY: 8 });
    node('a').firstElementChild?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(log).toEqual(['menu a 7,8']);
  });

  it('unbinding removes the listeners and the pending timers', () => {
    tap(node('a'));
    unbind();
    expect(timers.pending()).toBe(0);
    tap(node('a'));
    expect(log).toEqual(['click a']);
  });
});

describe('Shift (step 6.8b), only when the handlers say multi-selection is on', () => {
  const bindMulti = (on: boolean): void => {
    unbind();
    unbind = bindPointer(
      svg,
      {
        onClick: (hit) => log.push(`click ${hit?.id ?? 'none'}`),
        onToggle: (hit) => log.push(`toggle ${hit.id}`),
        onMarquee: (rect, done) => log.push(`marquee ${rect.x0},${rect.y0}-${rect.x1},${rect.y1}${done ? ' done' : ''}`),
        onMarqueeCancel: () => log.push('marquee cancelled'),
        multi: () => on,
      },
      timers,
    );
  };
  it('a Shift click toggles instead of clicking, and a plain click still clicks', () => {
    bindMulti(true);
    tap(node('a'), { shift: true });
    tap(node('b'));
    expect(log).toEqual(['toggle a', 'click b']);
  });
  it('a Shift drag reports a normalised rectangle, then done on the release', () => {
    bindMulti(true);
    fire(svg, 'pointerdown', { x: 100, y: 80, shift: true });
    fire(document, 'pointermove', { x: 40, y: 20 });
    fire(document, 'pointerup', { x: 40, y: 20 });
    expect(log).toEqual(['marquee 40,20-100,80', 'marquee 40,20-100,80 done']);
  });
  it('with multi-selection off Shift means nothing: the click is a click', () => {
    bindMulti(false);
    tap(node('a'), { shift: true });
    expect(log).toEqual(['click a']);
  });
});
