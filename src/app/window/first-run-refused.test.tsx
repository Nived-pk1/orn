// @vitest-environment jsdom
/** Step 8.4f, C2: a tab that opened read-only because the stored data does not fit this build says so, and offers no "Get started". */
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog } from '@/test-support/window-kit';
import { prefetchPalette } from './lazy-palette';

beforeAll(async () => {
  await prefetchPalette();
  stubDialog();
  fakeLayout();
});
afterEach(cleanup);

const DETAIL = '30 of 335 saved records do not fit this version of the app. Nothing was changed or deleted. Reload the page to get the newest version.';

describe('the read-only boot after a mass rejection', () => {
  it('shows the sentence, not "Get started", "no records yet" or "Use the writer tab"', () => {
    renderWithApp(fakeApp({ status: { mode: 'read_only', reason: 'integrity_failure', detail: DETAIL } }));
    const region = screen.getByRole('region', { name: 'Saved data not opened' });
    expect(within(region).getByText(DETAIL)).toBeTruthy();
    expect(screen.queryByText('Get started')).toBeNull();
    expect(screen.queryByText(/This dataset has no records yet/)).toBeNull();
    expect(screen.queryByText(/Use the writer tab/)).toBeNull();
    expect(screen.queryByText(/integrity_failure/)).toBeNull();
    expect(screen.queryByText(/Export them/)).toBeNull();
  });
  it('a follower tab still gets the old first-run words', () => {
    renderWithApp(fakeApp({ status: { mode: 'follower' } }));
    expect(screen.getByText(/Use the writer tab/)).toBeTruthy();
  });
});
