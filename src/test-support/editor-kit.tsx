/**
 * Test kit for the editor host (ADR-040): a real canonical store over the demo, a real session manager (memory mode), the real port made
 * by the app's wiring, manual timers for the 300 ms live panel, and a render that provides toasts. Test-only.
 */
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createStatusStore, type AppStatus } from '@/app/services';
import { createDraftManager, type DraftManager } from '@/app/services/drafts';
import { createEventLog } from '@/app/services';
import { makeEditorPort } from '@/app/window/editor-port';
import { createCanonicalStore, type StoreHandle } from '@/core/commands';
import { createIdFactory } from '@/core/dataset';
import type { AnyRecord, CanonicalState, Species } from '@/core/schema';
import type { EditorPort } from '@/features/workbench';
import { ToastProvider } from '@/ui/primitives';
import { demoState } from './app-boot-kit';
import { manualScheduler, type ManualScheduler } from './persistence-kit';

export interface EditorRig {
  readonly store: StoreHandle;
  readonly drafts: DraftManager;
  readonly port: EditorPort;
  /** The live panel's timers: `fireAfter(300)` makes the debounced L1 run. */
  readonly ui: ManualScheduler;
  readonly status: ReturnType<typeof createStatusStore>;
  /** The species the rig edits: the first by ID. */
  readonly speciesId: string;
  open(): string;
}

export function editorRig(options: { state?: CanonicalState; mode?: AppStatus['mode'] } = {}): EditorRig {
  const store = createCanonicalStore({ initial: options.state ?? demoState(), revision: 0, validateInitial: false });
  const status = createStatusStore(() => undefined);
  status.update({ mode: options.mode ?? 'writer', stage: 'ready' });
  const ids = createIdFactory({ nowMs: () => 1_790_000_000_000 }, { next: () => 0.25 });
  const drafts = createDraftManager({ store, adapter: undefined, status, timers: manualScheduler(), ids, log: createEventLog(() => 0) });
  const ui = manualScheduler();
  const port = makeEditorPort({ drafts, store }, ui);
  const speciesId = Object.keys(store.getState().records.species).sort()[0] as string;
  return {
    store,
    drafts,
    port,
    ui,
    status,
    speciesId,
    open() {
      const opened = drafts.open({ kind: 'species', id: speciesId });
      if (!opened.ok) throw new Error(opened.message);
      return opened.id;
    },
  };
}

export const speciesOf = (rig: EditorRig, id = rig.speciesId): Species => rig.store.getState().records.species[id as never] as Species;

/** Another change to the record behind the editor's back (for conflicts). */
export function changeElsewhere(rig: EditorRig, change: (record: Species) => AnyRecord): void {
  const result = rig.store.dispatch({ label: 'Elsewhere', commands: [{ type: 'record.update', record: change(speciesOf(rig)) }] });
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
}

export function renderWithToasts(ui: ReactNode) {
  return render(
    <ToastProvider>
      {ui}
    </ToastProvider>,
  );
}
