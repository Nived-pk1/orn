/** The Precursors view over fake ports (shared by the view specs). */
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { reactionCard, searchRoutes, type RouteQuery } from '@/core/graph';
import type { CanonicalState, Reaction } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';
import { navigatorRig } from '@/test-support/navigator-kit';
import { studyChrome, StudyChromeProvider } from '@/ui/study-chrome';
import { createExplorerStore, createPrecursorsStore, type PrecursorsState } from '@/ui/state';
import type { PrecursorPorts } from '@/features/precursor-explorer/contracts';
import { PrecursorsView } from '@/features/precursor-explorer/precursors-view';


export type Saved = Partial<Pick<PrecursorsState, 'target' | 'startFrom' | 'maxSteps' | 'onlyListed' | 'onlyInScope' | 'searched'>>;

export function setup(saved: Saved = {}, over: { readonly findRoutes?: PrecursorPorts['findRoutes']; readonly state?: CanonicalState; readonly withSave?: boolean; readonly edition?: 'study' | 'studio' } = {}) {
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
  render(over.edition === 'study' ? <StudyChromeProvider value={studyChrome('study', { ownData: false })}><PrecursorsView ports={ports} /></StudyChromeProvider> : <PrecursorsView ports={ports} />);
  return { ports, precursors, explorer, select, openMaking, saveAsRoute, openRoute, asked, rig, state, ctx };
}

