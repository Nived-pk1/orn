/** Which notice the single band shows first (step 8.4a, Part C): WARNING (and error) before NOTICE; newest first within a kind. */
import { describe, expect, it } from 'vitest';
import { orderNotices, type NoticeEntry } from './notice-order';

const n = (id: string, kind: NoticeEntry['kind'], order: number): NoticeEntry => ({ id, kind, order });

describe('orderNotices', () => {
  it('error and warning come before notice; review and info are notices', () => {
    const out = orderNotices([n('a', 'info', 1), n('b', 'warning', 2), n('c', 'error', 3), n('d', 'review', 4)]);
    expect(out.map((x) => x.id)).toEqual(['c', 'b', 'd', 'a']);
  });
  it('newest first within a kind', () => {
    const out = orderNotices([n('old', 'warning', 1), n('new', 'warning', 9), n('mid', 'warning', 5)]);
    expect(out.map((x) => x.id)).toEqual(['new', 'mid', 'old']);
  });
  it('drops nothing and does not change its input', () => {
    const input = [n('a', 'info', 1), n('b', 'info', 2)];
    const out = orderNotices(input);
    expect(out).toHaveLength(2);
    expect(input.map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('the one shown plus the rest is everything: "+n more" is the length minus one', () => {
    expect(orderNotices([n('a', 'info', 1), n('b', 'warning', 2), n('c', 'info', 3)]).slice(1)).toHaveLength(2);
  });
});
