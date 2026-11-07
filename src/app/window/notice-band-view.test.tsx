// @vitest-environment jsdom
/** The single notice band (step 8.4a, Part C): the most severe notice with its actions, "+n more" for the rest; nothing is dropped. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoticeBandView, type BandNotice } from './notice-band-view';

afterEach(cleanup);

const notice = (id: string, kind: BandNotice['kind'], text: string, order: number, extra: Partial<BandNotice> = {}): BandNotice => ({ id, kind, text, order, ...extra });

describe('NoticeBandView', () => {
  it('renders nothing for no notices', () => {
    const { container } = render(<NoticeBandView notices={[]} renderList={() => null} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the warning before the notice, with its own actions, and "+1 more"', () => {
    render(
      <NoticeBandView
        notices={[notice('n', 'info', 'newer dataset', 2), notice('w', 'warning', 'storage may be cleared', 1, { actions: <button type="button">Dismiss</button> })]}
        renderList={() => null}
      />,
    );
    expect(screen.getByText('storage may be cleared')).toBeTruthy();
    expect(screen.queryByText('newer dataset')).toBeNull();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '+1 more' })).toBeTruthy();
  });

  it('"+n more" opens the list of the rest, each with its actions', () => {
    const rest = vi.fn((list: readonly BandNotice[]) => <ul>{list.map((n) => <li key={n.id}>{n.text}</li>)}</ul>);
    render(<NoticeBandView notices={[notice('w', 'warning', 'first', 3), notice('a', 'info', 'second', 2), notice('b', 'info', 'third', 1)]} renderList={rest} />);
    fireEvent.click(screen.getByRole('button', { name: '+2 more' }));
    expect(rest).toHaveBeenCalled();
    expect(rest.mock.calls.at(-1)?.[0].map((n) => n.id)).toEqual(['a', 'b']);
    expect(screen.getByText('second')).toBeTruthy();
    expect(screen.getByText('third')).toBeTruthy();
  });

  it('has no "+n more" when there is one notice', () => {
    render(<NoticeBandView notices={[notice('w', 'warning', 'only', 1)]} renderList={() => null} />);
    expect(screen.queryByRole('button', { name: /more/ })).toBeNull();
  });

  it('is one landmark region named Notices', () => {
    render(<NoticeBandView notices={[notice('w', 'warning', 'only', 1)]} renderList={() => null} />);
    expect(screen.getByRole('region', { name: 'Notices' })).toBeTruthy();
  });
});
