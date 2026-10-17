// @vitest-environment jsdom
/**
 * The phone shell through the real window (ADR-039): a stubbed `matchMedia` makes the layout mode phone. The desktop tests elsewhere
 * run without matchMedia and are not touched.
 */
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PHONE_QUERIES } from '@/ui/hooks';
import { tierState } from '@/test-support/perf-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog } from '@/test-support/window-kit';
import { prefetchPalette } from './lazy-palette';

beforeAll(async () => {
  await prefetchPalette(); // the palette is a lazy chunk since step 6.1a: load it once so these tests open it at once
  stubDialog();
  fakeLayout();
});
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const loaded = () => fakeApp({ state: tierState('tiny', 'dense') });

describe('the phone shell', () => {
  it('is one slim top bar: the title ORN (the page heading keeps its full name), Search and More', () => {
    renderWithApp(fakeApp());
    const heading = screen.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' });
    expect(heading.textContent).toBe('ORN');
    const bar = screen.getByRole('banner');
    expect(within(bar).getByRole('button', { name: 'Search' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'More' })).toBeTruthy();
  });

  it('shows no Undo, Redo, inspector toggle, mode list or Phase 7 placeholders', () => {
    renderWithApp(loaded());
    for (const name of ['Undo', 'Redo', 'Show inspector', 'Hide inspector', 'File']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('navigation', { name: /mode/i })).toBeNull();
    expect(screen.queryByText(/Phase 7/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Workbench' })).toBeNull();
  });

  it('hides the status line: Status is under More, not on the page', () => {
    renderWithApp(loaded());
    expect(screen.queryByText(/Findings: E/)).toBeNull();
    expect(screen.queryByRole('contentinfo')).toBeNull();
  });

  it('More holds the File items, Exam scope, Dataset counts, About this preview and Status', () => {
    renderWithApp(loaded());
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const more = screen.getByRole('dialog', { name: 'More' });
    const file = within(more).getByRole('region', { name: 'File' });
    for (const name of ['Import a file...', 'Export...', 'Undo import', 'About this preview']) expect(within(file).getByRole('button', { name })).toBeTruthy();
    expect(within(more).getByRole('combobox', { name: /exam/i })).toBeTruthy();
    expect(within(more).getByRole('list', { name: 'Record counts' })).toBeTruthy();
    expect(within(more).getByRole('button', { name: 'Status' })).toBeTruthy();
  });

  it('Status in More opens the whole status line in its own dialog', () => {
    renderWithApp(loaded());
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'More' })).getByRole('button', { name: 'Status' }));
    expect(within(screen.getByRole('dialog', { name: 'Status' })).getByText(/Findings: E/)).toBeTruthy();
  });

  it('About this preview in More opens the about dialog', () => {
    renderWithApp(loaded());
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'More' })).getByRole('button', { name: 'About this preview' }));
    expect(screen.getByRole('dialog', { name: 'About this preview' })).toBeTruthy();
  });
});

describe('the phone alert line and the folded notices', () => {
  const failing = () =>
    fakeApp({ state: tierState('tiny', 'dense'), status: { save: { state: 'failed', lastSavedRevision: 1, pendingRevisions: 1, lastError: 'disk full', failureReason: null, deletablePeriodicSnapshotIds: [] } } });

  it('shows no alert while nothing needs the user', () => {
    renderWithApp(loaded());
    expect(screen.queryByRole('button', { name: /Saving failed/ })).toBeNull();
  });

  it('shows ONE alert line when saving failed, and a tap opens Status', () => {
    renderWithApp(failing());
    const alert = screen.getByRole('button', { name: /Saving failed/ });
    fireEvent.click(alert);
    expect(within(screen.getByRole('dialog', { name: 'Status' })).getByText(/NOT saved/)).toBeTruthy();
  });

  it('folds the notices into one line that expands on tap', () => {
    renderWithApp(failing());
    const fold = screen.getByRole('button', { name: /^\d+ notices?$/ });
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Notices' })).toBeNull();
    fireEvent.click(fold);
    expect(fold.getAttribute('aria-expanded')).toBe('true');
    expect(within(screen.getByRole('region', { name: 'Notices' })).getByText(/Saving failed/)).toBeTruthy();
    fireEvent.click(fold);
    expect(screen.queryByRole('region', { name: 'Notices' })).toBeNull();
  });

  it('has no notices line when there is nothing to say', () => {
    renderWithApp(loaded());
    expect(screen.queryByRole('button', { name: /notices?$/ })).toBeNull();
  });
});

describe('the keyboard hints', () => {
  it('are not shown on a phone', () => {
    renderWithApp(loaded());
    expect(screen.queryByText(/Alt\+Left/)).toBeNull();
  });
});
