// @vitest-environment jsdom
/** The phone map's controls row (step 8.2b-fix, E1): the chapter select keeps the room; Find is a 44 px icon button that opens the box over the row. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhoneMapBar } from './phone-bar';

afterEach(cleanup);

const families = [{ id: 'f2', name: 'Alcohols' }, { id: 'f4', name: 'Phenols' }];
const bar = (over: Partial<Parameters<typeof PhoneMapBar>[0]> = {}) =>
  render(<PhoneMapBar chapters={[]} chapterId={null} onChapter={() => undefined} families={families} onFind={() => undefined} chainOpen={false} onToggleChain={() => undefined} {...over} />);

describe('PhoneMapBar', () => {
  it('closed: the chapter select, a Find button of at least 44 px (no text box), and From A to B', () => {
    bar();
    expect(screen.getByRole('combobox', { name: 'Chapter' })).toBeTruthy();
    const find = screen.getByRole('button', { name: 'Find a family' });
    expect(find.getAttribute('data-icon-button')).not.toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Find a family' })).toBeNull();
    expect(screen.getByRole('button', { name: 'From A to B' })).toBeTruthy();
  });
  it('the Find button opens the box (focused) over the controls row; the chapter select steps aside', async () => {
    bar();
    fireEvent.click(screen.getByRole('button', { name: 'Find a family' }));
    const box = await screen.findByRole('combobox', { name: 'Find a family' });
    expect(document.activeElement).toBe(box);
    expect(screen.queryByRole('combobox', { name: 'Chapter' })).toBeNull();
  });
  it('Esc closes it, and so does the close button; the row is back', async () => {
    bar();
    fireEvent.click(screen.getByRole('button', { name: 'Find a family' }));
    fireEvent.keyDown(await screen.findByRole('combobox', { name: 'Find a family' }), { key: 'Escape' });
    expect(screen.getByRole('combobox', { name: 'Chapter' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Find a family' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Close find' }));
    expect(screen.getByRole('combobox', { name: 'Chapter' })).toBeTruthy();
  });
  it('choosing a family reports it and closes the box', async () => {
    const onFind = vi.fn();
    bar({ onFind });
    fireEvent.click(screen.getByRole('button', { name: 'Find a family' }));
    fireEvent.change(await screen.findByRole('combobox', { name: 'Find a family' }), { target: { value: 'Alcohols' } });
    expect(onFind).toHaveBeenCalledWith('f2');
    expect(screen.getByRole('combobox', { name: 'Chapter' })).toBeTruthy();
  });
  it('From A to B reports its press', () => {
    const onToggleChain = vi.fn();
    bar({ onToggleChain });
    fireEvent.click(screen.getByRole('button', { name: 'From A to B' }));
    expect(onToggleChain).toHaveBeenCalled();
  });
});
