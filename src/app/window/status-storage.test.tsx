// @vitest-environment jsdom
/**
 * Step 5.5d, items h and k: the storage warning can be dismissed and the choice is kept in the panels store (saved in `uiState` by it:
 * see `panels.test.ts`, and the e2e reload); the status
 * line keeps a short "Storage: not persistent" so it is never silent; a layout the cache refused is a word in the status line.
 */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeApp, renderWithApp, WRITER_STATUS } from '@/test-support/window-kit';
import { Banners, StatusLine } from './status-parts';

afterEach(cleanup);

const refused = { ...WRITER_STATUS, storage: { persistence: 'refused', message: null } } as const;

describe('the storage warning', () => {
  it('has a Dismiss button; dismissing hides the banner and keeps the short status-line word', () => {
    const app = fakeApp({ status: refused });
    renderWithApp(app, <><Banners /><StatusLine /></>);
    const notices = screen.getByRole('region', { name: 'Notices' });
    expect(within(notices).getByText(/did not grant persistent storage/)).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Status' })).getByText('Storage: not persistent')).toBeTruthy();
    fireEvent.click(within(notices).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/did not grant persistent storage/)).toBeNull();
    expect(app.panels.getState().storageNoticeDismissed).toBe(true);
    expect(within(screen.getByRole('region', { name: 'Status' })).getByText('Storage: not persistent')).toBeTruthy();
  });

  it('a dismissal saved earlier keeps the banner away on the next start; the status word stays', () => {
    const app = fakeApp({ status: refused, panels: { stored: { storageNoticeDismissed: true } } });
    renderWithApp(app, <><Banners /><StatusLine /></>);
    expect(screen.queryByText(/did not grant persistent storage/)).toBeNull();
    expect(screen.getByText('Storage: not persistent')).toBeTruthy();
  });

  it('persistent storage (or not asked) shows neither the banner nor the word', () => {
    renderWithApp(fakeApp({ status: WRITER_STATUS }), <><Banners /><StatusLine /></>);
    expect(screen.queryByText(/Storage: not persistent/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });
});

describe('the layout cache in the status line', () => {
  it('says so when the store refused to keep a layout, with the reason, and nothing otherwise', () => {
    const app = fakeApp({ status: WRITER_STATUS });
    renderWithApp(app, <StatusLine />);
    expect(screen.queryByText(/Layout cache/)).toBeNull();
    act(() => void app.status.update({ layoutCache: { state: 'refused', message: 'quota', fromStore: 0 } }));
    expect(screen.getByText('Layout cache: not saved (quota)')).toBeTruthy();
    act(() => void app.status.update({ layoutCache: { state: 'saved', message: null, fromStore: 2 } }));
    expect(screen.queryByText(/Layout cache/)).toBeNull();
  });
});
