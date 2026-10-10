// @vitest-environment jsdom
/**
 * Navigator completeness (step 5.5d, Part 2): the Unanchored panel lists every reaction no family holds (ADV-014 UI part) and a click
 * selects one; the empty states say what they mean and what to do (UI_ARCHITECTURE §12); a family page with no reactions says so.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { produce } from 'immer';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeApp, renderWithApp } from '@/test-support/window-kit';

afterEach(cleanup);

// jsdom does no layout: the lists' scroll areas are made tall and every other element short, so a list renders every item it holds
// (the windowing itself is proved by the VirtualList tests and the e2e).
const isScroller = (el: Element): boolean => el.hasAttribute('data-virtual-list');
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return isScroller(this) ? 20_000 : 40; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 900 });
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const height = isScroller(this) ? 20_000 : 40;
    return { x: 0, y: 0, top: 0, left: 0, right: 900, bottom: height, width: 900, height, toJSON: () => ({}) };
  };
});

const drawing = (): Promise<HTMLElement> => screen.findByRole('group', { name: /^Navigator:/ });
const unanchoredButton = (): HTMLElement => screen.getByRole('button', { name: /^Unanchored reactions \(\d+\)$/ });
const countOf = (): number => Number(/\((\d+)\)/.exec(unanchoredButton().textContent ?? '')?.[1]);

/** The demo with its navigator anchors removed: no family is set up, so every reaction is unanchored. */
const withoutAnchors = () =>
  produce(demoState(), (draft) => {
    draft.records.navigator_anchor = {};
  });

describe('the Unanchored panel', () => {
  it('lists every unanchored reaction, by name then ID, and a click selects the reaction', async () => {
    const state = withoutAnchors();
    const total = Object.keys(state.records.reaction).length;
    const app = fakeApp({ state });
    renderWithApp(app);
    await drawing();
    await waitFor(() => expect(countOf()).toBe(total));
    fireEvent.click(unanchoredButton());
    const panel = await screen.findByRole('region', { name: 'Unanchored reactions' });
    expect(within(panel).getByText(`${total} reactions are not in any family`)).toBeTruthy();
    const list = within(panel).getByRole('list', { name: 'Unanchored reactions' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(0);
    // the list is virtualised, but every row says its place in the WHOLE list: nothing is left out
    expect(rows[0]?.getAttribute('aria-setsize')).toBe(String(total));
    expect(rows).toHaveLength(total); // every row is in the DOM here (jsdom has no layout); the windowing is proved elsewhere
    const first = within(rows[0] as HTMLElement).getByRole('button');
    fireEvent.click(first);
    const picked = first.getAttribute('data-reaction-id') as string;
    expect(app.navigator.ports.ui.family.getState().reaction).toBe(picked);
    expect(within(screen.getByRole('toolbar', { name: 'Canvas tools' })).getByText(/^Selected: reaction /)).toBeTruthy();
    expect(first.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('region', { name: 'Unanchored reactions' })).toBeNull();
  });

  it('the demo has 2 reactions no family holds: the button says 2 and the panel lists both', async () => {
    renderWithApp(fakeApp({ state: demoState() }));
    await drawing();
    await waitFor(() => expect(countOf()).toBe(2));
    expect(unanchoredButton().getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(unanchoredButton());
    const panel = await screen.findByRole('region', { name: 'Unanchored reactions' });
    expect(within(panel).getByText('2 reactions are not in any family')).toBeTruthy();
    expect(within(panel).getAllByRole('listitem')).toHaveLength(2);
  });

  it('with nothing unanchored the button says why it cannot open, and no panel opens', async () => {
    const state = produce(demoState(), (draft) => {
      draft.records.reaction = {};
    });
    renderWithApp(fakeApp({ state }));
    await drawing();
    await waitFor(() => expect(countOf()).toBe(0));
    const button = unanchoredButton();
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-describedby')).not.toBeNull();
    expect(screen.getByText('every reaction is in a family')).toBeTruthy();
    fireEvent.click(button);
    expect(screen.queryByRole('region', { name: 'Unanchored reactions' })).toBeNull();
  });
});

describe('empty states say what they mean and what to do', () => {
  it('no reactions: the map says the dataset has none and where to load some', async () => {
    const state = produce(demoState(), (draft) => {
      draft.records.reaction = {};
    });
    renderWithApp(fakeApp({ state }));
    await drawing();
    const notice = await screen.findByText(/This dataset has no reactions yet\./);
    expect(notice.parentElement?.textContent).toMatch(/Open the File menu to load the demo or to import a file with reactions\./);
  });

  it('reactions but no family on the map: it says every reaction is under Unclassified and what to do', async () => {
    renderWithApp(fakeApp({ state: withoutAnchors() }));
    await drawing();
    const notice = await screen.findByText(/No family is set up on the map\./);
    expect(notice.parentElement?.textContent).toMatch(/every reaction is listed under Unclassified/);
    expect(notice.parentElement?.textContent).toMatch(/Import a file that has them, or open Unclassified/);
  });

  it('the demo has neither notice', async () => {
    renderWithApp(fakeApp({ state: demoState() }));
    await drawing();
    expect(screen.queryByText(/This dataset has no reactions yet\./)).toBeNull();
    expect(screen.queryByText(/No family is set up on the map\./)).toBeNull();
  });

  it('a family page of a family with no reactions says so, as a sentence with what to do', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    await drawing();
    act(() => app.navigator.ports.ui.family.getState().openFamily('cls_alkanes'));
    const page = await screen.findByRole('region', { name: /^Family page/ });
    act(() => app.navigator.timers.advance(0));
    await screen.findByRole('heading', { level: 2, name: /^Reactions of / });
    await waitFor(() => expect(within(page).getByText(/Alkanes has no reactions in this dataset: none starts from it and none makes it\./)).toBeTruthy());
    expect(within(page).getByText(/import reactions that involve its members/)).toBeTruthy();
  });
});
