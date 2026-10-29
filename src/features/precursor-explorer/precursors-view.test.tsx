// @vitest-environment jsdom
/**
 * The Precursors view (step 7.2a D1-D6, D8) over the demo with fake ports: the empty prompt, the target, "Made directly from", the route
 * panel and its rules, a search with a start and Cancel, the results in words, saved routes, outside marks, a saved choice naming a record
 * that is gone, the live region and Cards/Compact.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { createScopeOf, directPrecursors, reactionCard, searchRoutes, type RouteQuery } from '@/core/graph';
import { emptyRecordTables, type AnyRecord, type CanonicalState, type Reaction } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf, reaction, sp, species } from '@/test-support/graph-state';
import { navigatorRig } from '@/test-support/navigator-kit';
import { createExplorerStore, createPrecursorsStore, type PrecursorsState } from '@/ui/state';
import type { PrecursorPorts, RoutesAnswer } from './contracts';
import { PrecursorsView } from './precursors-view';

afterEach(cleanup);

type Saved = Partial<Pick<PrecursorsState, 'target' | 'startFrom' | 'maxSteps' | 'onlyListed' | 'onlyInScope' | 'searched'>>;

function setup(saved: Saved = {}, over: { readonly findRoutes?: PrecursorPorts['findRoutes']; readonly state?: CanonicalState; readonly withSave?: boolean } = {}) {
  const state = over.state ?? demoState();
  const store = createCanonicalStore({ initial: state, validateInitial: false });
  const rig = navigatorRig(store);
  const precursors = createPrecursorsStore(saved);
  const explorer = createExplorerStore();
  const select = vi.fn();
  const openMaking = vi.fn();
  const saveAsRoute = vi.fn();
  const openRoute = vi.fn();
  const asked: RouteQuery[] = [];
  const ctx = contextOf(state);
  const ports: PrecursorPorts = {
    store,
    indexes: rig.ports.indexes,
    ui: { precursors, explorer, exam: rig.ui.exam, family: rig.ui.family },
    searchSubstances: async (text) => ({
      ok: true,
      hits: [...Object.values(state.records.species), ...Object.values(state.records.class)]
        .map((r) => ({ ref: { kind: r.kind, id: r.id } as never, title: 'names' in r ? r.names.canonical : (r as { name: string }).name }))
        .filter((hit) => hit.title.toLowerCase().includes(text.toLowerCase())),
    }),
    findRoutes:
      over.findRoutes ??
      (async (query) => {
        asked.push(query);
        return { ok: true, result: searchRoutes(ctx, query) };
      }),
    select,
    showReactionsMaking: openMaking,
    ...(over.withSave === true ? { saveAsRoute, openRoute } : {}),
    renderCard: (args) => {
      const card = reactionCard(ctx, args.reactionId);
      if ('missing' in card) return args.fallback(card.reason);
      return (
        <article data-reaction-id={args.reactionId} data-outside={args.outside === undefined ? undefined : ''}>
          <button type="button" onClick={() => args.onSelect(args.reactionId)}>{(state.records.reaction[args.reactionId as never] as Reaction).name}</button>
          {args.outside}
        </article>
      );
    },
    timers: { after: (_ms, run) => (run(), () => undefined) },
    log: vi.fn(),
  };
  render(<PrecursorsView ports={ports} />);
  return { ports, precursors, explorer, select, openMaking, saveAsRoute, openRoute, asked, rig, state, ctx };
}

const PROPANOL = { kind: 'species', id: 'spc_propan-2-ol' } as const;
const PHENOL = { kind: 'species', id: 'spc_phenol' } as const;
const ETHANOL = { kind: 'species', id: 'spc_ethanol' } as const;
const BENZENE = { kind: 'species', id: 'spc_benzene' } as const; // nothing in the demo makes it
const s = (n: number, one: string, many: string): string => (n === 1 ? `${n} ${one}` : `${n} ${many}`);

describe('the empty view', () => {
  it('the heading and the prompt until a target is chosen', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Make a compound', level: 2 })).toBeTruthy();
    expect(screen.getByText('Choose the compound you want to make.')).toBeTruthy();
    expect(screen.queryByText('Made directly from')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
  });

  it('choosing a target from the search shows what makes it directly', async () => {
    const { precursors } = setup();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Compound to make' }), { target: { value: 'propan-2-ol' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Choose Propan-2-ol' }));
    expect(precursors.getState().target).toEqual(PROPANOL);
    expect(screen.getByRole('heading', { name: 'Made directly from' })).toBeTruthy();
    expect(screen.queryByText('Choose the compound you want to make.')).toBeNull();
  });
});

describe('Made directly from', () => {
  it('one block per starting material, "From <name>, n reactions", each reaction a card', () => {
    const { ctx } = setup({ target: PROPANOL });
    const direct = directPrecursors(ctx, sp('propan-2-ol'), () => 'unmapped');
    expect(direct.groups.length).toBeGreaterThan(0);
    for (const group of direct.groups) {
      expect(screen.getByRole('heading', { name: `From ${group.name}, ${s(group.reactions.length, 'reaction', 'reactions')}` })).toBeTruthy();
    }
    expect(document.querySelectorAll('article[data-reaction-id]')).toHaveLength(direct.reactionCount);
  });

  it('Compact shows one row per reaction with its name and equation', () => {
    const { explorer, ctx } = setup({ target: PROPANOL });
    act(() => explorer.getState().setView('compact'));
    const direct = directPrecursors(ctx, sp('propan-2-ol'), () => 'unmapped');
    expect(document.querySelectorAll('li[data-reaction-id]')).toHaveLength(direct.reactionCount);
    expect(document.querySelectorAll('article[data-reaction-id]')).toHaveLength(0);
  });

  it('a click opens the reaction in the inspector', () => {
    const { select, ctx } = setup({ target: PROPANOL });
    const first = directPrecursors(ctx, sp('propan-2-ol'), () => 'unmapped').groups[0]?.reactions[0];
    fireEvent.click(within(document.querySelector(`[data-reaction-id="${first?.reactionId}"]`) as HTMLElement).getByRole('button', { name: first?.name }));
    expect(select).toHaveBeenCalledWith(first?.reactionId);
  });

  it('a compound nothing makes says so; a class says route search also finds its members', () => {
    setup({ target: BENZENE });
    expect(screen.getByText('No reaction in the data makes Benzene directly.')).toBeTruthy();
    cleanup();
    setup({ target: { kind: 'class', id: 'cls_alcohols' } });
    expect(screen.getByText(/Only reactions that name this class itself are listed here\. Find a route also finds reactions that make its members\./)).toBeTruthy();
  });

  it('marks a reaction outside the chosen exam scope, as the family page does', () => {
    const { rig } = setup({ target: PROPANOL });
    expect(rig).toBeDefined();
    expect(document.querySelectorAll('[data-outside]')).toHaveLength(0);
  });
});

describe('by-products (7.2b A3)', () => {
  const made = (slug: string, role: 'main' | 'byproduct') =>
    reaction({ slug, name: 'Reaction ' + slug, scope: 'specific', participants: [{ ref: sp('alpha'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('target'), role }] }] });
  // the fixture loader of stateOf cannot run under jsdom: the demo's meta with only these records
  const world = (...rxns: ReturnType<typeof made>[]): CanonicalState => {
    const tables = emptyRecordTables() as unknown as Record<string, Record<string, AnyRecord>>;
    for (const record of [species('alpha', 'Alpha'), species('target', 'Target'), ...rxns]) (tables[record.kind] as Record<string, AnyRecord>)[record.id] = record;
    return { meta: demoState().meta, records: tables as unknown as CanonicalState['records'] };
  };

  it('says how many reactions form the target only as a by-product, with a button that opens Reactions filtered to it as Product', () => {
    const { openMaking } = setup({ target: { kind: 'species', id: 'spc_target' } }, { state: world(made('mm', 'main'), made('bb1', 'byproduct'), made('bb2', 'byproduct')) });
    expect(screen.getByText('Also formed as a by-product in 2 reactions')).toBeTruthy();
    expect(screen.queryByText('Reaction bb1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show these reactions in Reactions' }));
    expect(openMaking).toHaveBeenCalledWith({ kind: 'species', id: 'spc_target' });
  });

  it('one reaction reads in the singular, and no line appears when there is none', () => {
    setup({ target: { kind: 'species', id: 'spc_target' } }, { state: world(made('mm', 'main'), made('bb1', 'byproduct')) });
    expect(screen.getByText('Also formed as a by-product in 1 reaction')).toBeTruthy();
    cleanup();
    setup({ target: { kind: 'species', id: 'spc_target' } }, { state: world(made('mm', 'main')) });
    expect(screen.queryByText(/Also formed as a by-product/)).toBeNull();
  });
});

describe('Save as route and "Saved as" (7.2b C2, C3)', () => {
  it('Studio: each found route that is not saved yet has "Save as route" (the demo saves one of the two); it hands the steps (reaction, outcome, variants) and the target over, and saves nothing itself', async () => {
    const { saveAsRoute } = setup({ target: PROPANOL, startFrom: [ETHANOL] }, { withSave: true });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('2 routes found');
    const buttons = screen.getAllByRole('button', { name: 'Save as route' });
    expect(buttons).toHaveLength(1);
    expect(screen.getAllByText(/Saved as/)).toHaveLength(1);
    fireEvent.click(buttons[0] as HTMLElement);
    expect(saveAsRoute).toHaveBeenCalledTimes(1);
    const arg = saveAsRoute.mock.calls[0]?.[0] as { target: unknown; steps: { reactionId: string; outcomeId: string; conditionVariantIds: string[] }[] };
    expect(arg.target).toEqual(PROPANOL);
    expect(arg.steps).toHaveLength(2);
    expect(arg.steps.every((step) => step.reactionId.startsWith('rxn_') && step.outcomeId !== '' && Array.isArray(step.conditionVariantIds))).toBe(true);
  });

  it('Study (no such port): no Save as route button anywhere', async () => {
    setup({ target: PROPANOL, startFrom: [ETHANOL] });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('2 routes found');
    expect(screen.queryByRole('button', { name: 'Save as route' })).toBeNull();
  });

  it('a found route with the same steps as a saved route says "Saved as <name>" (a link to it) instead of the button', async () => {
    const { openRoute } = setup({ target: PHENOL, startFrom: [{ kind: 'species', id: 'spc_aniline' }] }, { withSave: true });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const found = await screen.findByRole('region', { name: 'Routes found' });
    const link = await within(found).findByRole('button', { name: 'Aniline → phenol' });
    expect(within(found).getByText(/Saved as/)).toBeTruthy();
    fireEvent.click(link);
    expect(openRoute).toHaveBeenCalledWith('rte_aniline-to-phenol');
  });
});

describe('Find a route: the panel', () => {
  it('steps 1 to 5 with the engine default chosen; "Only the listed starting materials" waits for a Start from', async () => {
    const { precursors } = setup({ target: PHENOL });
    const steps = screen.getByRole('combobox', { name: 'Up to' }) as HTMLSelectElement;
    expect([...steps.options].map((o) => o.textContent)).toEqual(['1 step', '2 steps', '3 steps', '4 steps', '5 steps']);
    expect(steps.value).toBe('5');
    const only = screen.getByRole('checkbox', { name: 'Only the listed starting materials' }) as HTMLInputElement;
    expect(only.disabled).toBe(true);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Start from (optional)' }), { target: { value: 'aniline' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Start from Aniline' }));
    expect(precursors.getState().startFrom).toEqual([{ kind: 'species', id: 'spc_aniline' }]);
    expect(only.disabled).toBe(false);
    fireEvent.change(steps, { target: { value: '3' } });
    expect(precursors.getState().maxSteps).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Aniline' }));
    expect(precursors.getState().startFrom).toEqual([]);
  });

  it('"Only <exam version> reactions" appears only when an exam scope is chosen, and then excludes the outside reactions through the engine', async () => {
    const { rig, state, asked, precursors } = setup({ target: PROPANOL, startFrom: [ETHANOL] });
    expect(screen.queryByRole('checkbox', { name: /^Only .* reactions$/ })).toBeNull();
    const version = Object.values(state.records.exam_version).find((one) => /JEE Main/.test(one.label));
    if (version === undefined) throw new Error('the demo has a JEE Main version');
    act(() => rig.ui.exam.getState().setActive({ examId: version.examId, examVersionId: version.id }));
    const only = await screen.findByRole('checkbox', { name: `Only ${version.label} reactions` });
    fireEvent.click(only);
    expect(precursors.getState().onlyInScope).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText(/routes? found|No route/);
    const outside = Object.keys(state.records.reaction).filter((id) => createScopeOf(rig.ports.indexes.current(), version.examId, version.id)({ kind: 'reaction', id }) === 'outside').sort();
    expect(asked[0]?.excludeReactionIds).toEqual(outside.length === 0 ? undefined : outside);
  });

  it('nothing searches until Search is pressed', async () => {
    const { asked } = setup({ target: PHENOL });
    fireEvent.change(screen.getByRole('combobox', { name: 'Up to' }), { target: { value: '2' } });
    await act(async () => undefined);
    expect(asked).toHaveLength(0);
  });
});

describe('a search', () => {
  it('Search with a start: "n routes found", each "k steps from <start>" with numbered steps, the reaction link, the arrow text', async () => {
    const { precursors, select, asked } = setup({ target: PROPANOL, startFrom: [ETHANOL] });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('2 routes found');
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ target: PROPANOL, startFrom: [ETHANOL], maxSteps: 5, assumption: 'side_inputs_available' });
    expect(precursors.getState().searched).toBe(true);
    const routes = screen.getByRole('list', { name: 'Routes' }).querySelectorAll(':scope > li');
    expect(routes).toHaveLength(2);
    const first = within(routes[0] as HTMLElement);
    expect(first.getByText('2 steps from Ethanol')).toBeTruthy();
    expect(first.getByText('1. Ethanol → Ethanal')).toBeTruthy();
    expect(first.getByText('2. Ethanal → Propan-2-ol')).toBeTruthy();
    fireEvent.click(first.getAllByRole('button', { name: /ethanol/i })[0] as HTMLElement);
    expect(select).toHaveBeenCalled();
  });

  it('"Show the reaction" expands that step\'s card and folds it again', async () => {
    setup({ target: PROPANOL, startFrom: [ETHANOL] });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('2 routes found');
    const routes = screen.getByRole('list', { name: 'Routes' }).querySelectorAll(':scope > li');
    const toggle = within(routes[0] as HTMLElement).getAllByRole('button', { name: 'Show the reaction' })[0] as HTMLElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect((routes[0] as HTMLElement).querySelectorAll('article[data-reaction-id]')).toHaveLength(1);
    fireEvent.click(toggle);
    expect((routes[0] as HTMLElement).querySelectorAll('article[data-reaction-id]')).toHaveLength(0);
  });

  it('while it runs: "Searching for routes..." and Cancel; Cancel stops it and says so', async () => {
    let signalSeen: AbortSignal | undefined;
    const findRoutes: PrecursorPorts['findRoutes'] = (_query, signal) => {
      signalSeen = signal;
      return new Promise<RoutesAnswer>((resolve) => signal?.addEventListener('abort', () => resolve({ ok: false, cancelled: true, message: 'The search was stopped.' })));
    };
    setup({ target: PROPANOL }, { findRoutes });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Searching for routes...')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(signalSeen?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByText('Searching for routes...')).toBeNull());
    expect(within(screen.getByRole('region', { name: 'Routes found' })).getByText('The search was stopped.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('no route: "No route to <target> within n steps."', async () => {
    setup({ target: BENZENE, maxSteps: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findAllByText('No route to Benzene within 2 steps.')).not.toHaveLength(0);
  });

  it('a worker that cannot answer is said in words', async () => {
    setup({ target: PROPANOL }, { findRoutes: async () => ({ ok: false, message: 'Route search is not available because the checking worker is not running.' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Route search is not available because the checking worker is not running.')).toBeTruthy();
  });

  it('a truncation is said in plain words under the count', async () => {
    const findRoutes: PrecursorPorts['findRoutes'] = async () => ({ ok: true, result: { routes: [], explored: 1, truncation: { reason: 'max_depth', hiddenNodeEstimate: 0 } } });
    setup({ target: ETHANOL, maxSteps: 2 }, { findRoutes });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Longer routes than 2 steps exist but were not searched. Allow more steps to see them.')).toBeTruthy();
  });

  it('says nothing about saving a found route', async () => {
    setup({ target: PROPANOL, startFrom: [ETHANOL] });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findAllByText('2 routes found');
    expect(within(screen.getByRole('region', { name: 'Routes found' })).queryByText(/sav/i)).toBeNull();
  });

  it('the live region says the count after a search', async () => {
    setup({ target: PROPANOL, startFrom: [ETHANOL] });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('2 routes found');
    const live = screen.getByRole('status', { name: 'Announcements' });
    await waitFor(() => expect(live.textContent).toBe('2 routes found'));
  });

  it('a search that was saved as made runs again from its query when the view opens', async () => {
    const { asked } = setup({ target: PROPANOL, startFrom: [ETHANOL], searched: true });
    await screen.findByText('2 routes found');
    expect(asked).toHaveLength(1);
  });
});

describe('Saved routes', () => {
  it('the stored routes that end at the target are listed above the results, name first, read-only', async () => {
    setup({ target: PHENOL });
    const saved = screen.getByRole('region', { name: 'Saved routes' });
    expect(within(saved).getByRole('heading', { name: 'Aniline → phenol' })).toBeTruthy();
    expect(within(saved).getByText('1. Aniline → Benzenediazonium chloride')).toBeTruthy();
    expect(within(saved).queryByRole('button', { name: /edit|delete|save/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const found = await screen.findByRole('region', { name: 'Routes found' });
    expect(saved.compareDocumentPosition(found) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('saved choices that name nothing', () => {
  it('are dropped and said once', async () => {
    const { precursors, ports } = setup({ target: { kind: 'species', id: 'spc_gone' }, startFrom: [ETHANOL, { kind: 'class', id: 'cls_gone' }] });
    await waitFor(() => expect(precursors.getState().target).toBeNull());
    expect(precursors.getState().startFrom).toEqual([ETHANOL]);
    expect(screen.getAllByText('A compound you chose earlier is no longer in the data; it was removed from your choices.')).toHaveLength(1);
    expect(ports.log).toHaveBeenCalled();
  });
});
