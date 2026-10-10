// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { truncationLineOf } from '@/features/navigator';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeApp, renderWithApp } from '@/test-support/window-kit';

// jsdom has no layout engine (every box is 0 x 0), no ResizeObserver and no SVG text metrics: the viewport is not fitted here and the
// text measurer is the fake of the test kit. What the browser does with the drawing is proved by tests/e2e/navigator.spec.ts.
afterEach(cleanup);

describe('the window with records', () => {
  it('shows the navigator in the canvas, with a toolbar of Zoom in, Zoom out and Fit', async () => {
    renderWithApp(fakeApp({ state: demoState() }));
    const drawing = await screen.findByRole('group', { name: /^Navigator: 16 hubs, \d+ arrows$/ });
    expect(drawing.getAttribute('data-lod')).not.toBeNull();
    const toolbar = screen.getByRole('toolbar', { name: 'Canvas tools' });
    for (const name of ['Zoom in', 'Zoom out', 'Fit']) expect(within(toolbar).getByRole('button', { name })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'First run' })).toBeNull();
  });

  it('the inspector says what to pick and where the record counts are', async () => {
    renderWithApp(fakeApp({ state: demoState(), panels: { stored: { inspectorOpen: true } } }));
    await screen.findByRole('group', { name: /^Navigator:/ });
    const inspector = screen.getByRole('region', { name: 'Inspector empty state' });
    expect(within(inspector).getByText(/Select a family, an arrow or a reaction card/)).toBeTruthy();
    expect(within(inspector).getByText(/record counts of the dataset are under Dataset/)).toBeTruthy();
  });

  it('keeps the record counts reachable under Dataset in the mode list', async () => {
    renderWithApp(fakeApp({ state: demoState() }));
    await screen.findByRole('group', { name: /^Navigator:/ });
    fireEvent.click(screen.getByRole('button', { name: 'Dataset' }));
    const counts = await screen.findByRole('list', { name: 'Record counts' });
    expect(within(counts).getByText('reaction: 27')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /^Navigator:/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Navigator' }));
    expect(await screen.findByRole('group', { name: /^Navigator:/ })).toBeTruthy();
  });

  it('shows a plain error with its code when the layout fails, never a blank canvas', async () => {
    const app = fakeApp({ state: demoState() });
    app.navigator.layout.failure = { ok: false, code: 'UNAVAILABLE', message: 'no worker' };
    renderWithApp(app);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('could not be drawn (UNAVAILABLE)');
    expect(alert.textContent).toContain('no worker');
  });

  it('shows a layout notice as a banner', async () => {
    const app = fakeApp({ state: demoState(), status: { layoutNotice: 'fallback layout (timeout) of "navigator"' } });
    renderWithApp(app);
    const notices = await screen.findByRole('region', { name: 'Notices' });
    expect(within(notices).getByText(/Layout note: fallback layout \(timeout\) of "navigator"/)).toBeTruthy();
  });

  it('has no navigator for an empty dataset: the first-run screen stays', () => {
    renderWithApp(fakeApp());
    expect(screen.getByRole('region', { name: 'First run' })).toBeTruthy();
    expect(screen.queryByRole('toolbar', { name: 'Canvas tools' })).toBeNull();
  });

  it('shows the skeleton only after 300 ms with no Scene', async () => {
    let ready: () => void = () => undefined;
    const app = fakeApp({ state: demoState() });
    // a measurer that is not ready keeps the model waiting
    const pending = new Promise<void>((resolve) => (ready = resolve));
    (app.navigator.ports.measurer as { ready: () => Promise<void> }).ready = () => pending;
    renderWithApp(app);
    expect(screen.queryByRole('status', { name: 'Loading the navigator' })).toBeNull();
    act(() => app.navigator.timers.advance(299));
    expect(screen.queryByRole('status', { name: 'Loading the navigator' })).toBeNull();
    act(() => app.navigator.timers.advance(1));
    expect(screen.getByRole('status', { name: 'Loading the navigator' }).getAttribute('aria-busy')).toBe('true');
    act(() => ready());
    await waitFor(() => expect(screen.getByRole('group', { name: /^Navigator:/ })).toBeTruthy());
    expect(screen.queryByRole('status', { name: 'Loading the navigator' })).toBeNull();
  });
});

describe('what the drawing cut', () => {
  it('says in one plain line how many pairs and arrows are not drawn', () => {
    expect(truncationLineOf(null)).toBeNull();
    expect(truncationLineOf({ reason: 'max_edges', hiddenNodeEstimate: 0, hiddenPairs: 1, hiddenEdges: 1 })).toBe('Not drawn: 1 pair of hubs and 1 arrow (the drawing is limited; reason: max edges).');
    expect(truncationLineOf({ reason: 'max_nodes', hiddenNodeEstimate: 5, hiddenPairs: 12, hiddenEdges: 40 })).toBe(
      'Not drawn: 12 pairs of hubs and 40 arrows and about 5 hubs or members (the drawing is limited; reason: max nodes).',
    );
  });
});
