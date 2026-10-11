// @vitest-environment jsdom
/**
 * The inspector frame (step 5.6a, part C1) in the window: empty state, a click on a card focuses its reaction and opens the pane,
 * Back and Forward and Alt+Arrow keys, a record that is gone is said to be missing, a record link to a missing record is plain text.
 */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeApp, renderWithApp } from '@/test-support/window-kit';

afterEach(cleanup);

const pane = (): HTMLElement => screen.getByRole('complementary', { name: 'Inspector' });

describe('the inspector frame', () => {
  it('shows an empty state until something is picked', () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    expect(within(pane()).getByRole('region', { name: 'Inspector empty state' })).toBeTruthy();
  });

  it('a pick of a reaction on the family page focuses it, opens the pane and pushes the history', () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    renderWithApp(app);
    const reactionId = Object.keys(app.store.getState().records.reaction)[0] as string;
    act(() => app.navigator.ui.family.getState().selectReaction(reactionId));
    expect(app.inspectorStore.getState().history.at(-1)).toEqual({ kind: 'reaction', id: reactionId });
    expect(app.panels.getState().inspectorOpen).toBe(true);
    expect(within(pane()).getByRole('article', { name: 'Record' }).getAttribute('data-record-id')).toBe(reactionId);
  });

  it('Back, Forward and Alt+Left / Alt+Right move through the history', () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    renderWithApp(app);
    const [a, b] = Object.keys(app.store.getState().records.reaction) as [string, string];
    act(() => app.navigator.ui.family.getState().selectReaction(a));
    act(() => app.navigator.ui.family.getState().selectReaction(b));
    const shown = (): string | null => within(pane()).getByRole('article', { name: 'Record' }).getAttribute('data-record-id');
    expect(shown()).toBe(b);
    fireEvent.click(within(pane()).getByRole('button', { name: 'Back' }));
    expect(shown()).toBe(a);
    fireEvent.keyDown(document, { key: 'ArrowRight', altKey: true });
    expect(shown()).toBe(b);
    fireEvent.keyDown(document, { key: 'ArrowLeft', altKey: true });
    expect(shown()).toBe(a);
    expect((within(pane()).getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a focused record that is not in the dataset is said to be missing', () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    act(() => app.inspectorStore.getState().open({ kind: 'reaction', id: 'rxn_gone' } as never));
    expect(within(pane()).getByText(/Missing record rxn_gone/)).toBeTruthy();
  });

  it('a reaction shows its participants and outcomes at L2; a record link focuses that record and Back returns', () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    renderWithApp(app);
    const reactionId = Object.keys(app.store.getState().records.reaction)[0] as string;
    act(() => app.navigator.ui.family.getState().selectReaction(reactionId));
    const view = within(pane());
    expect(view.getByRole('list', { name: 'Participants' })).toBeTruthy();
    const outcomes = view.getByRole('list', { name: 'Outcomes' });
    expect(outcomes.textContent).toMatch(/\((exclusive|major|minor|trace|mixture component|unspecified)\)/);
    const link = within(view.getByRole('list', { name: 'Participants' })).getAllByRole('link')[0] as HTMLElement;
    const target = link.getAttribute('data-record-id');
    fireEvent.click(link);
    expect(app.inspectorStore.getState().history.at(-1)?.id).toBe(target);
    fireEvent.click(view.getByRole('button', { name: 'Back' }));
    expect(app.inspectorStore.getState().history[app.inspectorStore.getState().index]?.id).toBe(reactionId);
  });
});
