// @vitest-environment jsdom
/** The status line's two texts (step 8.4b, G3): the short words are real text hidden from assistive tech; the full words sit beside them, visually hidden. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusWords } from './status-words';

afterEach(cleanup);

const items = [
  { id: 'saved', short: 'Saved r12', full: 'Saved (revision 12)' },
  { id: 'findings', short: '2 to check', full: '2 findings to check' },
];

describe('StatusWords', () => {
  it('has the short words as real text, hidden from assistive technology', () => {
    const { container } = render(<StatusWords items={items} />);
    const hidden = [...container.querySelectorAll('[aria-hidden="true"]')];
    expect(hidden.map((el) => el.textContent)).toEqual(['Saved r12', '2 to check']);
  });
  it('has the full words beside them, in text a reader and a test can find', () => {
    render(<StatusWords items={items} />);
    expect(screen.getByText('Saved (revision 12)')).toBeTruthy();
    expect(screen.getByText('2 findings to check').closest('[aria-hidden="true"]')).toBeNull();
  });
  it('a word that is the same short and full is drawn once, as ordinary text', () => {
    const { container } = render(<StatusWords items={[{ id: 'ro', short: 'Read-only', full: 'Read-only' }]} />);
    expect(screen.getAllByText('Read-only')).toHaveLength(1);
    expect(container.querySelector('[aria-hidden]')).toBeNull();
  });
  it('uses no CSS content for words', () => {
    const { container } = render(<StatusWords items={items} />);
    expect(container.querySelector('[data-short]')).toBeNull();
  });
});
