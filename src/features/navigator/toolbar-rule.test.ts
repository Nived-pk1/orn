/** The map toolbar's one-row rule (step 8.3b, A1): when the row is too narrow, From A to B and then Open family go into More. */
import { describe, expect, it } from 'vitest';
import { movedToMore, TOOLBAR_FULL_WIDTH, TOOLBAR_MOVE_SAVES } from './toolbar-rule';

describe('movedToMore', () => {
  it('a wide row keeps every button in the row', () => {
    expect(movedToMore(TOOLBAR_FULL_WIDTH)).toEqual([]);
    expect(movedToMore(2000)).toEqual([]);
  });
  it('one pixel short: From A to B goes into More first', () => {
    expect(movedToMore(TOOLBAR_FULL_WIDTH - 1)).toEqual(['chain']);
  });
  it('still short after that: Open family goes too, in that order', () => {
    expect(movedToMore(TOOLBAR_FULL_WIDTH - TOOLBAR_MOVE_SAVES.chain - 1)).toEqual(['chain', 'open']);
    expect(movedToMore(TOOLBAR_FULL_WIDTH - TOOLBAR_MOVE_SAVES.chain)).toEqual(['chain']);
  });
  it('never more than those two, whatever the width (zero, negative, not a number)', () => {
    expect(movedToMore(0)).toEqual(['chain', 'open']);
    expect(movedToMore(-5)).toEqual(['chain', 'open']);
    expect(movedToMore(Number.NaN)).toEqual(['chain', 'open']);
  });
  it('the zoom buttons, the chapter select, Find, Key and More are never moved', () => {
    for (const width of [0, 300, 600, 900]) expect(movedToMore(width).every((one) => one === 'chain' || one === 'open')).toBe(true);
  });
});
