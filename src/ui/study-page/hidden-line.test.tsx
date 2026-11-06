// @vitest-environment jsdom
/** The quiet line of "Only <exam>" (step 8.3b, B2): what is hidden, and the way to show it. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hiddenLineOf } from './hidden-line';
import { HiddenLine } from './hidden-line-view';

afterEach(cleanup);

describe('hiddenLineOf', () => {
  it('plural: "8 reactions outside JEE Main are hidden" and "Show them"', () => {
    expect(hiddenLineOf(8, ['reaction', 'reactions'], 'JEE Main')).toEqual({ text: '8 reactions outside JEE Main are hidden', action: 'Show them' });
  });
  it('singular: "1 reaction outside JEE Main is hidden" and "Show it"', () => {
    expect(hiddenLineOf(1, ['reaction', 'reactions'], 'JEE Main')).toEqual({ text: '1 reaction outside JEE Main is hidden', action: 'Show it' });
  });
  it('nothing hidden, or no exam name: no line (never "(no exam scope)")', () => {
    expect(hiddenLineOf(0, ['reaction', 'reactions'], 'JEE Main')).toBeUndefined();
    expect(hiddenLineOf(3, ['reaction', 'reactions'], undefined)).toBeUndefined();
  });
  it('other nouns', () => {
    expect(hiddenLineOf(2, ['chapter', 'chapters'], 'CBSE Class 11')?.text).toBe('2 chapters outside CBSE Class 11 are hidden');
  });
});

describe('HiddenLine', () => {
  it('shows the words and a button that switches to Everything', () => {
    const onShow = vi.fn();
    render(<HiddenLine count={8} noun={['reaction', 'reactions']} examName="JEE Main" onShow={onShow} />);
    expect(screen.getByText(/8 reactions outside JEE Main are hidden/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show them' }));
    expect(onShow).toHaveBeenCalledTimes(1);
  });
  it('draws nothing when nothing is hidden', () => {
    const { container } = render(<HiddenLine count={0} noun={['reaction', 'reactions']} examName="JEE Main" onShow={() => undefined} />);
    expect(container.textContent).toBe('');
  });
});
