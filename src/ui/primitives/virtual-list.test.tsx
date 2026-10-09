// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { VirtualList, type VirtualListHandle, type VirtualListProps } from './virtual-list';

afterEach(cleanup);

// jsdom does no layout: every element would measure 0 px. Give items the height the estimate says.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 50 });
  HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 50, width: 400, height: 50, toJSON: () => ({}) });
});

interface Row {
  readonly id: string;
  readonly text: string;
}
const items: Row[] = Array.from({ length: 1_000 }, (_, i) => ({ id: `item-${i}`, text: `Item ${i}` }));
const props: VirtualListProps<Row> = {
  items,
  itemKey: (item: Row) => item.id,
  estimateSize: () => 50,
  renderItem: (item: Row) => <button type="button">{item.text}</button>,
  label: 'Things',
  initialRect: { width: 400, height: 300 },
};

describe('VirtualList', () => {
  it('is a list of listitems that renders only the items near the viewport', () => {
    render(<VirtualList {...props} />);
    const list = screen.getByRole('list', { name: 'Things' });
    const rows = screen.getAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(30);
    expect(list.children.length).toBe(rows.length);
  });

  it('each item says its position in the whole list, so a screen reader hears "1 of 1000"', () => {
    render(<VirtualList {...props} />);
    const first = screen.getAllByRole('listitem')[0] as HTMLElement;
    expect(first.getAttribute('aria-posinset')).toBe('1');
    expect(first.getAttribute('aria-setsize')).toBe('1000');
  });

  it('the content of an item is reachable by keyboard: a button inside an item takes focus', () => {
    render(<VirtualList {...props} />);
    const button = screen.getByRole('button', { name: 'Item 0' });
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it('positions items through style properties and gives the list its whole height (1000 x 50 px)', () => {
    render(<VirtualList {...props} />);
    const list = screen.getByRole('list', { name: 'Things' }) as HTMLElement;
    expect(list.style.height).toBe('50000px');
    const rows = screen.getAllByRole('listitem') as HTMLElement[];
    expect(rows[0]?.style.transform).toBe('translateY(0px)');
    expect(rows[1]?.style.transform).toBe('translateY(50px)');
  });

  it('keeps the same item under the same key when the list changes order', () => {
    const { rerender } = render(<VirtualList {...props} items={items.slice(0, 5)} />);
    const before = screen.getByRole('button', { name: 'Item 2' });
    rerender(<VirtualList {...props} items={[...items.slice(0, 5)].reverse()} />);
    expect(screen.getByRole('button', { name: 'Item 2' })).toBe(before);
  });

  it('an empty list is an empty list', () => {
    render(<VirtualList {...props} items={[]} />);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('offers scrollToIndex through a ref and does not throw', () => {
    const ref = createRef<VirtualListHandle>();
    render(<VirtualList {...props} ref={ref} />);
    expect(() => ref.current?.scrollToIndex(500)).not.toThrow();
  });
});
