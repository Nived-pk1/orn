// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NamesSection } from './names-section';

afterEach(cleanup);

const draft = { names: { canonical: 'Ethanol', common: ['Ethyl alcohol', 'Spirit'], aliases: [] } };
const show = (phone: boolean) => render(<NamesSection draft={draft} onEdit={() => undefined} phone={phone} />);

describe('the list rows', () => {
  it('desktop: the buttons keep their numbered names', () => {
    show(false);
    expect(screen.getByRole('button', { name: 'Move common name 1 down' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove common name 2' })).toBeTruthy();
  });

  it('phone: the field and Up, Down, Remove are the children of ONE row, the buttons named by the text', () => {
    show(true);
    const group = screen.getByRole('group', { name: 'Common names' });
    const row = within(group).getAllByRole('listitem')[0] as HTMLElement;
    const names = within(row).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Move Ethyl alcohol up', 'Move Ethyl alcohol down', 'Remove Ethyl alcohol']);
    expect(within(row).getByRole('textbox', { name: 'Common name 1' })).toBeTruthy();
    expect(row.className).toMatch(/rowPhone/);
  });
});
