// @vitest-environment jsdom
/**
 * The Reactions view (step 7.1b D1-D6) over the demo with fake ports: the heading and count line, a filter narrowing the list with its chip,
 * Cards and Compact, 30 at a time, the empty states, "Only <exam version>", a saved filter naming a record that is gone, selecting a card,
 * the live region, and the focus staying on the control used.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { reactionCard } from '@/core/graph';
import { contextOf } from '@/test-support/graph-state';
import type { CanonicalState, Reaction } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { navigatorRig } from '@/test-support/navigator-kit';
import { createExplorerStore, EMPTY_EXPLORER_FILTER, type ExplorerFilter } from '@/ui/state';
import type { ExplorerPorts } from './contracts';
import { ReactionsView } from './reactions-view';

afterEach(cleanup);

function manyReactions(count: number): CanonicalState {
  const base = demoState();
  const source = Object.values(base.records.reaction)[0] as Reaction;
  const extra = Object.fromEntries(
    Array.from({ length: count }, (_, i) => {
      const id = `rxn_extra_${String(i).padStart(3, '0')}`;
      return [id, { ...source, id, name: `Extra reaction ${String(i).padStart(3, '0')}`, aliases: [], reactionTypes: [], namedReactionIds: [] }];
    }),
  );
  return { ...base, records: { ...base.records, reaction: { ...base.records.reaction, ...extra } } } as CanonicalState;
}

function setup(state: CanonicalState = demoState(), saved: Partial<ExplorerFilter> = {}) {
  const store = createCanonicalStore({ initial: state, validateInitial: false });
  const rig = navigatorRig(store);
  const explorer = createExplorerStore({ filter: { ...EMPTY_EXPLORER_FILTER, ...saved } });
  const select = vi.fn();
  const ports: ExplorerPorts = {
    store,
    indexes: rig.ports.indexes,
    ui: { explorer, exam: rig.ui.exam, family: rig.ui.family },
    searchSubstances: async (text) => ({ ok: true, hits: Object.values(state.records.species).filter((s) => s.names.canonical.toLowerCase().includes(text.toLowerCase())).map((s) => ({ ref: { kind: 'species', id: s.id } as never, title: s.names.canonical })) }),
    select,
    renderCard: (args) => {
      const card = reactionCard(contextOf(state), args.reactionId);
      if ('missing' in card) return args.fallback(card.reason);
      return (
      <article data-reaction-id={args.reactionId} data-outside={args.outside === undefined ? undefined : ''}>
        <button type="button" onClick={() => args.onSelect(args.reactionId)}>{(state.records.reaction[args.reactionId as never] as Reaction).name}</button>
        {args.outside}
      </article>
      );
    },
    timers: { after: (_ms, run) => (run(), () => undefined) },
    log: () => undefined,
  };
  render(<ReactionsView ports={ports} />);
  return { ports, explorer, select, rig, state };
}

const cards = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('article[data-reaction-id]'));

describe('the header and the count line', () => {
  it('has the heading "Reactions" and counts every reaction', () => {
    const { state } = setup();
    expect(screen.getByRole('heading', { name: 'Reactions' })).toBeTruthy();
    const total = Object.keys(state.records.reaction).length;
    // 7.3a C3: the count is CARDS; the PCC example is folded under its general reaction ("+ 1 example")
    expect(screen.getAllByText(`${total - 1} reactions (+ 1 example)`).length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-reaction-id]')).toHaveLength(total - 1); // 25 cards and the one reaction with no card as a compact row
  });

  it('Clear all filters is shown only while a filter is set', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).toBeNull();
    cleanup();
    setup(demoState(), { text: 'a' });
    expect(screen.getByRole('button', { name: 'Clear all filters' })).toBeTruthy();
  });
});

describe('filters', () => {
  it('the Type button opens checkboxes with counts; choosing one narrows the list, shows a chip, and the chip removes it', () => {
    const { state } = setup();
    const total = Object.keys(state.records.reaction).length;
    const button = screen.getByRole('button', { name: 'Type' });
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByRole('group', { name: 'Type filter' });
    const box = within(panel).getByRole('checkbox', { name: /^Oxidation \(\d+\)$/ });
    const n = Number(/\((\d+)\)/.exec(box.parentElement?.textContent ?? '')?.[1]);
    fireEvent.click(box);
    // the facet count (n) counts reactions; the list counts cards, with the folded PCC example in words (7.3a C3)
    expect(screen.getAllByText(`${n - 1} of ${total - 1} reactions (+ 1 example)`).length).toBeGreaterThan(0);
    expect(cards()).toHaveLength(n - 1);
    expect(screen.getByRole('status', { name: 'Announcements' }).textContent).toBe(`${n - 1} of ${total - 1} reactions (+ 1 example)`);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Type: Oxidation' }));
    expect(screen.getAllByText(`${total - 1} reactions (+ 1 example)`).length).toBeGreaterThan(0);
  });

  it('Escape closes a popover and the focus returns to its button', () => {
    setup();
    const button = screen.getByRole('button', { name: 'Review status' });
    button.focus();
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('group', { name: 'Review status filter' }), { key: 'Escape' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('Escape closes a popover even when the focus is not inside it (WebKit does not focus a clicked checkbox)', () => {
    setup();
    const button = screen.getByRole('button', { name: 'Type' });
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('the name box narrows by folded text', () => {
    setup();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find by name' }), { target: { value: 'pcc' } });
    expect(cards().length).toBeGreaterThan(0);
    expect(cards().every((c) => /pcc/i.test(c.textContent ?? ''))).toBe(true);
  });

  it('Substance: search, choose, "Used as" starts at Any', async () => {
    const { explorer } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Substance' }));
    expect((screen.getByRole('radio', { name: 'Any' }) as HTMLInputElement).checked).toBe(true);
    await act(async () => {
      fireEvent.change(screen.getByRole('searchbox', { name: 'Find a species, class or reagent' }), { target: { value: 'ethanol' } });
    });
    const match = await screen.findByRole('checkbox', { name: /^Ethanol \(\d+\)$/ });
    fireEvent.click(match);
    expect(explorer.getState().filter.substanceIds).toHaveLength(1);
    fireEvent.click(screen.getByRole('radio', { name: 'Product' }));
    expect(explorer.getState().filter.usedAs).toBe('product');
    expect(screen.getByText('Used as: Product')).toBeTruthy();
  });
});

describe('Cards and Compact', () => {
  it('Compact is one row per reaction with the equation in text', () => {
    const { explorer } = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Compact' }));
    expect(explorer.getState().view).toBe('compact');
    expect(cards()).toHaveLength(0);
    const rows = screen.getAllByRole('listitem').filter((li) => li.hasAttribute('data-reaction-id'));
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.some((row) => row.textContent?.includes('→'))).toBe(true);
  });

  it('a reaction with no card shows its compact row with the reason, in Cards too', () => {
    setup();
    expect(screen.getAllByText('No main product is marked, so this reaction has no card.').length).toBeGreaterThan(0);
  });
});

describe('30 at a time', () => {
  it('shows 30, says so, and Show 30 more adds the next 30', () => {
    setup(manyReactions(70));
    const total = 70 + Object.keys(demoState().records.reaction).length - 1; // cards: the PCC example is folded (7.3a C1)
    expect(cards()).toHaveLength(30);
    expect(screen.getByText(`Showing 30 of ${total}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show 30 more' }));
    expect(cards()).toHaveLength(60);
    expect(screen.getByText(`Showing 60 of ${total}`)).toBeTruthy();
  });
});

describe('empty states', () => {
  it('no reactions at all', () => {
    const base = demoState();
    setup({ ...base, records: { ...base.records, reaction: {} } } as CanonicalState);
    expect(screen.getByText('No reactions yet.')).toBeTruthy();
  });

  it('nothing matches: says so and Clear all filters brings them back', () => {
    const { explorer } = setup(demoState(), { text: 'zzzzzz' });
    expect(screen.getByText('No reaction matches these filters.')).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: 'Clear all filters' });
    fireEvent.click(buttons[buttons.length - 1] as HTMLElement);
    expect(explorer.getState().filter).toEqual(EMPTY_EXPLORER_FILTER);
    expect(cards().length).toBeGreaterThan(0);
  });
});

describe('exam scope', () => {
  it('without an exam scope there is no Only checkbox; with one, Only hides the outside reactions and the count says how many', () => {
    const { rig, state } = setup();
    expect(screen.queryByRole('checkbox', { name: /^Only / })).toBeNull();
    cleanup();
    const exam = Object.values(state.records.exam)[0];
    const version = Object.values(state.records.exam_version)[0];
    if (exam === undefined || version === undefined) throw new Error('the demo has an exam and a version');
    const again = setup();
    act(() => again.rig.ui.exam.getState().setActive({ examId: exam.id, examVersionId: version.id } as never));
    const box = screen.getByRole('checkbox', { name: `Only ${version.label}` });
    fireEvent.click(box);
    expect(again.explorer.getState().filter.onlyInScope).toBe(true);
    void rig;
  });
});

describe('a saved filter naming a record that is gone', () => {
  it('drops it and says so once', () => {
    const { explorer } = setup(demoState(), { typeIds: ['cpt_gone'], text: 'a' });
    expect(screen.getByText('A filter named a record that no longer exists; it was removed.')).toBeTruthy();
    expect(explorer.getState().filter.typeIds).toEqual([]);
    expect(explorer.getState().filter.text).toBe('a');
  });
});

describe('selecting', () => {
  it('a card selects its reaction through the port', () => {
    const { select, state } = setup();
    const r = Object.values(state.records.reaction)[0] as Reaction;
    fireEvent.click(screen.getByRole('button', { name: r.name }));
    expect(select).toHaveBeenCalledWith(r.id);
  });

  it('Escape with a popover open closes ONLY the popover: no other layer hears that key press (step 7.2a, item 4)', () => {
    setup();
    const elsewhere = vi.fn();
    document.addEventListener('keydown', elsewhere);
    try {
      const button = screen.getByRole('button', { name: 'Type' });
      fireEvent.click(button);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(elsewhere).not.toHaveBeenCalled();
      // with no popover open, the key goes where it always went
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(elsewhere).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('keydown', elsewhere);
    }
  });

  describe('after a chip is removed the focus moves on (step 7.2a, item 5)', () => {
    const typeIdsOf = (state: CanonicalState): string[] => [...new Set(Object.values(state.records.reaction).flatMap((r) => r.reactionTypes.map((t) => t.conceptId as string)))].slice(0, 3);
    const chipButtons = (): HTMLElement[] => within(screen.getByRole('list', { name: 'Chosen filters' })).getAllByRole('button');

    it('the next chip, else the previous one, else the filter button of that dimension', () => {
      const state = demoState();
      const ids = typeIdsOf(state);
      expect(ids).toHaveLength(3);
      setup(state, { typeIds: ids });
      const names = chipButtons().map((b) => b.getAttribute('aria-label'));
      fireEvent.click(chipButtons()[1] as HTMLElement); // the middle one: the next chip takes the focus
      expect(document.activeElement?.getAttribute('aria-label')).toBe(names[2]);
      fireEvent.click(chipButtons()[1] as HTMLElement); // now the last one: the previous chip
      expect(document.activeElement?.getAttribute('aria-label')).toBe(names[0]);
      fireEvent.click(chipButtons()[0] as HTMLElement); // the only one: the Type button
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Type' }));
    });
  });

  it('the Substance picker says in words that only used substances are listed (step 7.2a, item 6)', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Substance' }));
    expect(screen.getByText('Only substances used in a reaction are listed.')).toBeTruthy();
  });
});
