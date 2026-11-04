// @vitest-environment jsdom
/** The inspector's view of the Unclassified box (step 8.2b, B4 b): a chip, a title, a line with the count, the compounds with their reaction counts. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnclassifiedView } from './unclassified-view';

afterEach(cleanup);

const products = [
  { ref: { kind: 'species', id: 'spc_a' }, reactionIds: ['r1', 'r2'], reactions: 2 },
  { ref: { kind: 'class', id: 'cls_b' }, reactionIds: ['r2'], reactions: 1 },
];

describe('UnclassifiedView', () => {
  it('shows the chip, the title, how many reactions lead there and the compounds with their counts', () => {
    render(<UnclassifiedView products={products as never} nameOf={(ref) => (ref.id === 'spc_a' ? 'Ethanal' : 'Some class')} open={() => undefined} titleId="t" />);
    expect(screen.getByText('Not in a family yet')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Unclassified' })).toBeTruthy();
    expect(screen.getByText('2 reactions lead to compounds that are in no family yet')).toBeTruthy(); // r1 and r2, once each
    const rows = within(screen.getByRole('list', { name: 'Compounds in no family' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual(['Ethanal2 reactions', 'Some class1 reaction']);
  });
  it('a row opens the compound', () => {
    const open = vi.fn();
    render(<UnclassifiedView products={products as never} nameOf={(ref) => ref.id} open={open} titleId="t" />);
    fireEvent.click(screen.getByRole('button', { name: /spc_a/ }));
    expect(open).toHaveBeenCalledWith({ kind: 'species', id: 'spc_a' });
  });
  it('with no compound: says so and has no list', () => {
    render(<UnclassifiedView products={[]} nameOf={(ref) => ref.id} open={() => undefined} titleId="t" />);
    expect(screen.getByText('0 reactions lead to compounds that are in no family yet')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
