// @vitest-environment jsdom
/**
 * The exam scope in the window (step 5.8): the selector names every exam version with its exam and status in words; choosing one dims and
 * marks in words what is outside it and HIDES NOTHING (the demo's Beckmann rearrangement under JEE Main, in the Unanchored panel and on
 * the Unclassified family page; a family whose every reaction is outside on the overview, with the legend); a chosen version that is not
 * in the data is reset and said; the inspector marks the chosen version.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { UNCLASSIFIED_HUB_ID } from '@/core/graph';
import type { CanonicalState, ExamRelevance, Reaction } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeApp, renderWithApp, type FakeApp } from '@/test-support/window-kit';

afterEach(cleanup);

// jsdom does no layout: the list's scroll area is made tall so every item of a page renders (as navigator-family.test.tsx does)
const isScroller = (el: Element): boolean => el.hasAttribute('data-virtual-list');
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return isScroller(this) ? 20_000 : 40; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 900 });
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const height = isScroller(this) ? 20_000 : 40;
    return { x: 0, y: 0, top: 0, left: 0, right: 900, bottom: height, width: 900, height, toJSON: () => ({}) };
  };
});

const MAIN = { examId: 'exm_jee-main', examVersionId: 'exv_jee-main-2026' } as never;
const BECKMANN = 'rxn_cyclohexanone-oxime-beckmann';
const selector = () => screen.getByRole('combobox', { name: /Exam scope/ }) as HTMLSelectElement;

describe('the selector', () => {
  it('lists All and every exam version, each with its exam and status in words', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    await screen.findByRole('group', { name: /^Navigator:/ });
    expect([...selector().options].map((o) => o.textContent)).toEqual(['All (no exam scope)', 'JEE Advanced, provisional, not verified', 'JEE Main, provisional, not verified']);
    expect(selector().value).toBe('');
    fireEvent.change(selector(), { target: { value: 'exv_jee-main-2026' } });
    expect(app.navigator.ui.exam.getState().active).toEqual(MAIN);
    fireEvent.change(selector(), { target: { value: '' } });
    expect(app.navigator.ui.exam.getState().active).toBeNull();
  });

  it('shows a saved choice, and resets a saved choice that is not in the data, in words', async () => {
    const app = fakeApp({ state: demoState() });
    app.navigator.ui.exam.getState().setActive(MAIN);
    renderWithApp(app);
    await screen.findByRole('group', { name: /^Navigator:/ });
    expect(selector().value).toBe('exv_jee-main-2026');

    cleanup();
    const gone = fakeApp({ state: demoState() });
    gone.navigator.ui.exam.getState().setActive({ examId: 'exm_x', examVersionId: 'exv_gone' } as never);
    renderWithApp(gone);
    await screen.findByRole('group', { name: /^Navigator:/ });
    await waitFor(() => expect(gone.navigator.ui.exam.getState().active).toBeNull());
    expect(screen.getByText(/The exam scope you had chosen is not in this data, so all records are shown\./)).toBeTruthy();
    expect(gone.navigator.logs.some((line) => line.type === 'exam_scope_reset')).toBe(true);
  });
});

describe('outside the scope: dimmed, marked in words, never hidden', () => {
  it('the Unanchored panel: Beckmann is marked "outside JEE Main" under JEE Main; both rows stay; nothing is marked under All', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    await screen.findByRole('group', { name: /^Navigator:/ });
    fireEvent.click(screen.getByRole('button', { name: /^Unanchored reactions \(2\)/ }));
    const panel = await screen.findByRole('region', { name: 'Unanchored reactions' });
    expect(panel.querySelectorAll('[data-reaction-id]')).toHaveLength(2);
    expect(panel.querySelectorAll('[data-outside]')).toHaveLength(0);

    act(() => app.navigator.ui.exam.getState().setActive(MAIN));
    await waitFor(() => expect(panel.querySelectorAll('[data-outside]')).toHaveLength(1));
    expect(panel.querySelectorAll('[data-reaction-id]')).toHaveLength(2);
    const row = panel.querySelector(`[data-reaction-id="${BECKMANN}"]`) as HTMLElement;
    expect(row.hasAttribute('data-outside')).toBe(true);
    expect(row.textContent).toContain('outside JEE Main');

    act(() => app.navigator.ui.exam.getState().setActive({ examId: 'exm_jee-advanced', examVersionId: 'exv_jee-advanced-2026' } as never));
    await waitFor(() => expect(panel.querySelectorAll('[data-outside]')).toHaveLength(0));
  });

  it('the Unclassified family page: the Beckmann card is dashed, dimmed and says "outside JEE Main"; every card is still there', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    app.navigator.ui.family.getState().openFamily(UNCLASSIFIED_HUB_ID);
    renderWithApp(app);
    await screen.findByRole('region', { name: /^Family page/ });
    act(() => app.navigator.timers.advance(0));
    await waitFor(() => expect(document.querySelector(`article[data-reaction-id="${BECKMANN}"]`)).not.toBeNull());
    const before = document.querySelectorAll('article[data-reaction-id]').length;
    expect(document.querySelectorAll('article[data-outside]')).toHaveLength(0);

    act(() => app.navigator.ui.exam.getState().setActive(MAIN));
    await waitFor(() => expect(document.querySelectorAll('article[data-outside]').length).toBeGreaterThan(0));
    await act(async () => app.navigator.timers.advance(0));
    const cardOf = document.querySelector(`article[data-reaction-id="${BECKMANN}"]`) as HTMLElement;
    expect(cardOf.hasAttribute('data-outside')).toBe(true);
    expect(within(cardOf).getByText('outside JEE Main')).toBeTruthy();
    expect(document.querySelectorAll('article[data-reaction-id]')).toHaveLength(before);
    const marked = [...document.querySelectorAll('article[data-outside]')];
    expect(marked.length).toBeGreaterThan(0); // the reaction stands in both sections of the Unclassified page
    expect(marked.every((el) => el.getAttribute('data-reaction-id') === BECKMANN)).toBe(true);
  });

  it('the overview: a family whose every reaction is outside is dimmed, says "outside JEE Main" in its box, in its name and in the legend', async () => {
    const base = demoState();
    const probe = fakeApp({ state: base });
    const rollup = probe.navigator.ports.indexes.current().navigatorRollup();
    // the family with the fewest reactions: every one of them is made outside JEE Main by an explicit override (JEE_ONTOLOGY §4.1)
    const hub = [...rollup.hubs]
      .map((h) => ({ id: h.id, reactions: new Set([...rollup.candidatesFrom(h.id), ...rollup.candidatesTo(h.id)].map((c) => c.reactionId)) }))
      .filter((h) => h.reactions.size > 0)
      .sort((a, b) => a.reactions.size - b.reactions.size || (a.id < b.id ? -1 : 1))[0] as { id: string; reactions: Set<string> };
    const template = Object.values(base.records.exam_relevance)[0] as ExamRelevance;
    const overrides = Object.fromEntries(
      [...hub.reactions].map((id) => [`erl_test-${id.slice(4)}`, { ...template, id: `erl_test-${id.slice(4)}`, target: { kind: 'reaction', id }, examId: 'exm_jee-main', examVersionIds: [], scope: 'outside' } as unknown as ExamRelevance]),
    );
    const state = { ...base, records: { ...base.records, exam_relevance: { ...base.records.exam_relevance, ...overrides } } } as unknown as CanonicalState;
    const app = fakeApp({ state });
    renderWithApp(app);
    await screen.findByRole('group', { name: /^Navigator: 16 hubs/ });
    expect(document.querySelectorAll('svg [data-node-id]')).toHaveLength(16);
    const node = () => document.querySelector(`svg [data-node-id="${hub.id}"]`) as SVGElement;
    expect(node().getAttribute('aria-label')).not.toContain('outside');

    act(() => app.navigator.ui.exam.getState().setActive(MAIN));
    await waitFor(() => expect(node().getAttribute('aria-label'), [...hub.reactions].join(',')).toContain('outside JEE Main'));
    expect(node().getAttribute('class') ?? '').toMatch(/dimmed/);
    expect(document.querySelectorAll('svg [data-node-id]')).toHaveLength(16); // nothing is hidden
    expect(node().querySelector('title')?.textContent).toContain('outside JEE Main'); // the words are in the box's text, too
    const legend = screen.getByRole('list', { name: 'What the marks mean' });
    expect(within(legend).getByText(/outside JEE Main: faded and marked in words/)).toBeTruthy();

    act(() => app.navigator.ui.exam.getState().setActive(null));
    await waitFor(() => expect(node().getAttribute('aria-label')).not.toContain('outside'));
    expect(screen.queryByText(/faded and marked in words/)).toBeNull();
  });
});

describe('the inspector', () => {
  it('marks the chosen exam version in the curriculum section of a reaction', async () => {
    const app = fakeApp({ state: demoState() });
    (app.inspector as unknown as { ui: Record<string, unknown> }).ui = { ...app.inspector.ui, exam: app.navigator.ui.exam };
    app.navigator.ui.exam.getState().setActive(MAIN);
    renderWithApp(app);
    await screen.findByRole('group', { name: /^Navigator:/ });
    const reaction = (demoState().records.reaction as Record<string, Reaction>)[BECKMANN] as Reaction;
    act(() => app.inspectorStore.getState().open({ kind: 'reaction', id: reaction.id }));
    for (let round = 0; round < 6; round += 1) for (const button of [...document.querySelectorAll('button[aria-expanded="false"]')]) fireEvent.click(button);
    const chosen = document.querySelector('[data-chosen]') as HTMLElement;
    expect(chosen.textContent).toContain('JEE Main');
    expect(chosen.textContent).toContain('the chosen exam scope');
    expect(chosen.textContent).toMatch(/outside/);
  });
});

export type { FakeApp };
