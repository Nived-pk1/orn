/**
 * The search feature's port (step 5.8): made from the search service, the canonical state, the L4 service's derived formulas and the
 * navigator's UI stores. The feature imports none of this. `show` is the window's: it switches to the Navigator, opens the record in
 * the inspector and places it.
 */
import type { IndexState, PaletteCommand, SearchPorts } from '@/features/search';
import type { NavigatorPorts } from '@/features/navigator';
import type { InspectorPorts } from '@/features/inspector';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordRef, Species } from '@/core/schema';
import type { SearchQuery } from '@/search/contracts';
import type { SearchService, SearchSyncStatus } from '@/workers/search';

export interface SearchPortDeps {
  readonly search: SearchService['search'];
  readonly store: { getState(): CanonicalState; getRevision(): number };
  /** The search sync's status, or undefined when there is no search worker. */
  readonly syncStatus: () => SearchSyncStatus | undefined;
  readonly indexes: { current(): ReadonlyIndexes };
  readonly l4: Pick<InspectorPorts['l4'], 'derivedFormulaOf'>;
  readonly navigator: Pick<NavigatorPorts, 'ui' | 'timers' | 'log'>;
  /** Switches to the Navigator, opens the record in the inspector and places it. */
  show(ref: RecordRef, title: string): void;
  commands(): readonly PaletteCommand[];
}

/** Has the search index followed the store? A change waiting to be sent, or an index at an older revision, is `catching_up`; a sync that failed is `failed`. */
export function indexStateOf(status: SearchSyncStatus | undefined, revision: number): IndexState {
  if (status === undefined) return { state: 'current' };
  if (status.state === 'down') return { state: 'failed', reason: status.reason === '' ? 'the search worker failed' : status.reason };
  if (status.state === 'pending' || status.indexRevision !== revision) return { state: 'catching_up' };
  return { state: 'current' };
}

export function createSearchPorts(deps: SearchPortDeps): SearchPorts {
  return {
    search: (channel: string, query: SearchQuery) => deps.search(channel, query),
    timers: deps.navigator.timers,
    recent: deps.navigator.ui.recent,
    indexState: () => indexStateOf(deps.syncStatus(), deps.store.getRevision()),
    examVersionId: () => deps.navigator.ui.exam.getState().active?.examVersionId,
    factsOf(ref) {
      const derived = deps.l4.derivedFormulaOf(ref);
      const record = deps.store.getState().records[ref.kind as 'species'][ref.id as never] as Species | undefined;
      const entered = ref.kind === 'species' ? record?.formula : undefined;
      return { ...(entered === undefined ? {} : { enteredFormula: entered }), ...(derived === undefined ? {} : { derivedFormula: derived }) };
    },
    open: (ref, title) => deps.show(ref, title),
    commands: () => deps.commands(),
    log: deps.navigator.log,
  };
}
