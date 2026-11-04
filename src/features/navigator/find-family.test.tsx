// @vitest-environment jsdom
/** "Find a family" (step 8.2b, E): matching order and the box. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FindFamily } from './find-family';
import { matchFamilies } from './find-family-match';

afterEach(cleanup);

const families = [
  { id: 'f1', name: 'Carboxylic acids' },
  { id: 'f2', name: 'Alcohols' },
  { id: 'f3', name: 'Haloalkanes' },
  { id: 'f4', name: 'Phenols' },
  { id: 'f5', name: 'Éthers' },
];

describe('matchFamilies', () => {
  it('starts-with first, then contains, each in name order; case and accent insensitive', () => {
    expect(matchFamilies(families, 'al').map((f) => f.name)).toEqual(['Alcohols', 'Haloalkanes']);
    expect(matchFamilies(families, 'ACID').map((f) => f.name)).toEqual(['Carboxylic acids']);
    expect(matchFamilies(families, 'ethers').map((f) => f.name)).toEqual(['Éthers']);
    expect(matchFamilies(families, 'ol').map((f) => f.name)).toEqual(['Alcohols', 'Phenols']);
  });
  it('an empty query matches nothing', () => {
    expect(matchFamilies(families, '  ')).toEqual([]);
  });
});

describe('FindFamily', () => {
  it('Enter with exactly one match chooses it', () => {
    const onChoose = vi.fn();
    render(<FindFamily families={families} onChoose={onChoose} />);
    const box = screen.getByRole('combobox', { name: 'Find a family' });
    fireEvent.change(box, { target: { value: 'phen' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChoose).toHaveBeenCalledWith('f4');
  });
  it('Enter with several matches chooses nothing', () => {
    const onChoose = vi.fn();
    render(<FindFamily families={families} onChoose={onChoose} />);
    const box = screen.getByRole('combobox', { name: 'Find a family' });
    fireEvent.change(box, { target: { value: 'al' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChoose).not.toHaveBeenCalled();
  });
  it('picking a suggestion (the box then holds a whole family name) chooses it', () => {
    const onChoose = vi.fn();
    render(<FindFamily families={families} onChoose={onChoose} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Find a family' }), { target: { value: 'Alcohols' } });
    expect(onChoose).toHaveBeenCalledWith('f2');
  });
  it('Esc clears the box', () => {
    render(<FindFamily families={families} onChoose={() => undefined} />);
    const box = screen.getByRole('combobox', { name: 'Find a family' }) as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'al' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box.value).toBe('');
  });
  it('the suggestions are the matches, in order', () => {
    const { container } = render(<FindFamily families={families} onChoose={() => undefined} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Find a family' }), { target: { value: 'al' } });
    expect([...container.querySelectorAll('datalist option')].map((o) => o.getAttribute('value'))).toEqual(['Alcohols', 'Haloalkanes']);
  });
});
