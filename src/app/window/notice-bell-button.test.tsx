// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoticeBellButton } from './notice-bell-button';

afterEach(cleanup);

describe('the notices bell (step 8.4d, Part C)', () => {
  it('with nothing to say it is just "Notices", with no count', () => {
    render(<NoticeBellButton count={0} onOpen={() => undefined} />);
    const bell = screen.getByRole('button', { name: 'Notices' });
    expect(bell.textContent).toBe('');
  });

  it('with notices it shows the count and says it in its name', () => {
    render(<NoticeBellButton count={3} onOpen={() => undefined} />);
    const bell = screen.getByRole('button', { name: 'Notices, 3' });
    expect(bell.textContent).toBe('3');
  });

  it('a large count is cut to 99+ in the badge, the name keeps the number', () => {
    render(<NoticeBellButton count={140} onOpen={() => undefined} />);
    const bell = screen.getByRole('button', { name: 'Notices, 140' });
    expect(bell.textContent).toBe('99+');
  });

  it('a click opens the list (the dialog is the caller\'s)', () => {
    const onOpen = vi.fn();
    render(<NoticeBellButton count={1} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notices, 1' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
