// @vitest-environment jsdom
/** The map's chapter select (step 8.2a, D2): "All chapters" and each chapter; the phone's is a 44 px native select. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChapterSelect } from './chapter-select';

afterEach(cleanup);
const chapters = [{ id: 'top_a', title: 'Alcohols' }, { id: 'top_b', title: 'Amines' }];

describe('ChapterSelect', () => {
  it('lists All chapters first, then each chapter, and shows the chosen one', () => {
    render(<ChapterSelect chapters={chapters} value="top_b" onChange={() => undefined} />);
    const select = screen.getByRole('combobox', { name: 'Chapter' }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual(['All chapters', 'Alcohols', 'Amines']);
    expect(select.value).toBe('top_b');
  });

  it('choosing a chapter, or All chapters (null), tells the owner', () => {
    const onChange = vi.fn();
    render(<ChapterSelect chapters={chapters} value={null} onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Chapter' });
    fireEvent.change(select, { target: { value: 'top_a' } });
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange.mock.calls).toEqual([['top_a'], [null]]);
  });

  it('the phone one is a native select at least 44 px high', () => {
    render(<ChapterSelect chapters={chapters} value={null} onChange={() => undefined} phone />);
    const select = screen.getByRole('combobox', { name: 'Chapter' });
    expect(select.tagName).toBe('SELECT');
    expect(select.getAttribute('data-phone')).toBe('');
  });
});
