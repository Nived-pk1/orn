// @vitest-environment jsdom
/**
 * VirtualTable (step 5.7, item j): a table of any length keeps the DOM small and still says its whole size; the row that holds the
 * tab stop is always rendered; sortable headers say how they are sorted; a row reports click, Space, Enter and double click.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { VirtualTable, type TableColumn } from './virtual-table';

afterEach(cleanup);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 300 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 600 });
  HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 600, bottom: 300, width: 600, height: 300, toJSON: () => ({}) });
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => undefined;
});

interface Row {
  readonly id: string;
  readonly name: string;
  readonly count: number;
}
const rows: Row[] = Array.from({ length: 2_000 }, (_, i) => ({ id: `r${i}`, name: `Row ${i}`, count: i % 7 }));
const columns: TableColumn<Row>[] = [
  { id: 'name', header: 'Name', width: '2fr', sortable: true, cell: (row) => row.name },
  { id: 'count', header: 'Count', width: '6rem', sortable: true, numeric: true, cell: (row) => row.count },
  { id: 'fixed', header: 'Fixed', width: '4rem', cell: () => 'x' },
];

function show(over: Partial<Parameters<typeof VirtualTable<Row>>[0]> = {}) {
  const calls = { open: vi.fn(), enter: vi.fn(), double: vi.fn(), sort: vi.fn() };
  render(
    <VirtualTable
      label="Things"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      sort={null}
      onSort={calls.sort}
      onRowOpen={calls.open}
      onRowEnter={calls.enter}
      onRowDouble={calls.double}
      {...over}
    />,
  );
  return calls;
}

describe('VirtualTable', () => {
  it('renders only the rows near the viewport and says the size of the whole table', () => {
    show();
    const table = screen.getByRole('table', { name: 'Things' });
    expect(table.getAttribute('aria-rowcount')).toBe('2001');
    expect(table.getAttribute('aria-colcount')).toBe('3');
    const rendered = table.querySelectorAll('[data-row-key]');
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(40);
    expect(rendered[0]?.getAttribute('aria-rowindex')).toBe('2');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
  });

  it('has ONE tab stop in the body, on the first row, and arrow keys move it (End brings the last row into the DOM)', async () => {
    show();
    const stops = (): string[] => [...document.querySelectorAll('[data-row-key][tabindex="0"]')].map((row) => row.getAttribute('data-row-key') as string);
    expect(stops()).toEqual(['r0']);
    const first = document.querySelector('[data-row-key="r0"]') as HTMLElement;
    act(() => first.focus());
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(stops()).toEqual(['r1']);
    fireEvent.keyDown(document.querySelector('[data-row-key="r1"]') as HTMLElement, { key: 'End' });
    expect(stops()).toEqual(['r1999']);
    expect(document.querySelector('[data-row-key="r1999"]')).not.toBeNull();
    fireEvent.keyDown(document.querySelector('[data-row-key="r1999"]') as HTMLElement, { key: 'Home' });
    expect(stops()).toEqual(['r0']);
  });

  it('sortable headers are buttons that say how they are sorted; a column that is not sortable has no button', () => {
    const calls = show({ sort: { column: 'count', direction: 'descending' } });
    const count = screen.getByRole('columnheader', { name: /^Count/ });
    expect(count.getAttribute('aria-sort')).toBe('descending');
    expect(screen.getByRole('columnheader', { name: /^Name/ }).getAttribute('aria-sort')).toBe('none');
    expect(screen.getByRole('columnheader', { name: 'Fixed' }).hasAttribute('aria-sort')).toBe(false);
    expect(within(screen.getByRole('columnheader', { name: 'Fixed' })).queryByRole('button')).toBeNull();
    fireEvent.click(within(screen.getByRole('columnheader', { name: /^Name/ })).getByRole('button'));
    expect(calls.sort).toHaveBeenCalledWith('name');
  });

  it('a row reports click and Space as open, Enter as enter (open when there is no enter handler), and a double click', () => {
    const calls = show();
    const row = document.querySelector('[data-row-key="r3"]') as HTMLElement;
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: ' ' });
    expect(calls.open).toHaveBeenCalledTimes(2);
    expect(calls.open).toHaveBeenCalledWith(rows[3]);
    act(() => row.focus());
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(calls.enter).toHaveBeenCalledWith(rows[3]);
    expect(calls.open).toHaveBeenCalledTimes(2);
    fireEvent.doubleClick(row);
    expect(calls.double).toHaveBeenCalledWith(rows[3]);
    cleanup();
    const plain = show({ onRowEnter: undefined });
    fireEvent.keyDown(document.querySelector('[data-row-key="r0"]') as HTMLElement, { key: 'Enter' });
    expect(plain.open).toHaveBeenCalledWith(rows[0]);
  });

  it('an empty table has a header and no rows, and does not fail', () => {
    show({ rows: [] });
    expect(screen.getByRole('table', { name: 'Things' }).getAttribute('aria-rowcount')).toBe('1');
    expect(document.querySelectorAll('[data-row-key]')).toHaveLength(0);
  });
});
