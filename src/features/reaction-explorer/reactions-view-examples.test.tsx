// @vitest-environment jsdom
/**
 * Examples in the Reactions view (7.3a C1 to C3): an example folds under its general reaction's card (the card host is told its example
 * ids), the count line counts cards and says "(+ n examples)", a filter that matches the example but not the general reaction shows the
 * example as its own card with "Example of", and Compact folds the same way. Written first (seen red).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import type { Reaction } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { navigatorRig } from '@/test-support/navigator-kit';
import { createExplorerStore, EMPTY_EXPLORER_FILTER } from '@/ui/state';
import type { CardArgs, ExplorerPorts } from './contracts';
import { ReactionsView } from './reactions-view';

afterEach(cleanup);
const G = 'rxn_alcohol1-to-aldehyde-pcc';
const E = 'rxn_ethanol-to-ethanal-pcc';

function setup() {
  const state = demoState();
  const store = createCanonicalStore({ initial: state, validateInitial: false });
  const rig = navigatorRig(store);
  const explorer = createExplorerStore({ filter: { ...EMPTY_EXPLORER_FILTER } });
  const asked: CardArgs[] = [];
  const ports: ExplorerPorts = {
    store,
    indexes: rig.ports.indexes,
    ui: { explorer, exam: rig.ui.exam, family: rig.ui.family },
    searchSubstances: async () => ({ ok: true, hits: [] }),
    select: vi.fn(),
    renderCard: (args) => {
      asked.push(args);
      return (
        <article data-reaction-id={args.reactionId}>
          <button type="button" onClick={() => args.onSelect(args.reactionId)}>{(state.records.reaction[args.reactionId as never] as Reaction).name}</button>
          {args.exampleOf === undefined ? null : <span>{`Example of ${args.exampleOf.name}`}</span>}
          {(args.examples ?? []).length === 0 ? null : <span>{`Examples (${args.examples?.length})`}</span>}
        </article>
      );
    },
    timers: { after: (_ms, run) => (run(), () => undefined) },
    log: () => undefined,
  };
  render(<ReactionsView ports={ports} />);
  return { asked, explorer, total: Object.keys(state.records.reaction).length };
}
const cards = (): string[] => Array.from(document.querySelectorAll<HTMLElement>('article[data-reaction-id]')).map((el) => el.dataset.reactionId as string);

describe('Cards', () => {
  it('the example is not a card; the general reaction\'s card is handed its example id', () => {
    const { asked } = setup();
    expect(cards()).toContain(G);
    expect(cards()).not.toContain(E);
    expect(asked.find((a) => a.reactionId === G)?.examples).toEqual([E]);
    expect(screen.getByText('Examples (1)')).toBeTruthy();
  });

  it('the count line counts cards and says the folded examples in words', () => {
    const { total } = setup();
    expect(screen.getAllByText(`${total - 1} reactions (+ 1 example)`).length).toBeGreaterThan(0);
  });

  it('a filter that matches the example but not its general reaction shows the example as a card of its own, with "Example of"', () => {
    const { asked } = setup();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find by name' }), { target: { value: 'ethanol' } });
    expect(cards()).toContain(E);
    expect(cards()).not.toContain(G);
    expect(asked.filter((a) => a.reactionId === E).at(-1)?.exampleOf).toEqual({ id: G, name: '1° alcohol → aldehyde (PCC)' });
    expect(screen.getByText('Example of 1° alcohol → aldehyde (PCC)')).toBeTruthy();
  });

  it('a filter that matches both folds again; the count then says "of" the cards', () => {
    setup();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find by name' }), { target: { value: 'pcc' } });
    expect(cards()).toEqual([G]);
    expect(screen.getAllByText(/^1 of \d+ reactions \(\+ 1 example\)$/).length).toBeGreaterThan(0);
  });
});

describe('Compact', () => {
  it('the general reaction\'s row says "1 example" and holds the example\'s row; the example has no row of its own', () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Compact' }));
    const rows = Array.from(document.querySelectorAll<HTMLElement>('li[data-reaction-id]'));
    const general = rows.find((row) => row.dataset.reactionId === G) as HTMLElement;
    expect(within(general).getByText('1 example')).toBeTruthy();
    const top = rows.filter((row) => row.parentElement?.closest('li[data-reaction-id]') === null);
    expect(top.map((row) => row.dataset.reactionId)).not.toContain(E);
    expect((general.querySelector('details') as HTMLDetailsElement).open).toBe(false);
    expect(within(general).getByRole('button', { name: 'Ethanol → ethanal (PCC)' })).toBeTruthy();
  });
});
