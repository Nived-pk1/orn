/**
 * Test kit for the plain window (step 5.1d): fake services made of a real status store, a real canonical store and `vi.fn`
 * flows, plus a builder for `ImportPlan` values. Test-only.
 */
import { render } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import { AppProvider, type AppContextValue, type DemoLoad, type WindowServices } from '@/app/window/context';
import { createStatusStore, emptyState, type AppStatus } from '@/app/services';
import type { StatusWriter } from '@/app/services/status';
import type { ImportPlan, ImportPreview } from '@/io';
import { createCanonicalStore, type StoreHandle } from '@/core/commands';
import { createIdFactory } from '@/core/dataset';
import type { CanonicalState } from '@/core/schema';
import { Window } from '@/app/window/window';
import { createInspectorStore, createPanelsStore, type InspectorStore, type PanelsPort, type PanelsStore } from '@/ui/state';
import type { InspectorPorts } from '@/features/inspector';
import { navigatorRig, type NavigatorRig } from './navigator-kit';
import type { ReactNode } from 'react';

export const WRITER_STATUS: Partial<AppStatus> = {
  stage: 'ready',
  mode: 'writer',
  save: { state: 'saved', lastSavedRevision: 0, pendingRevisions: 0, lastError: null, failureReason: null, deletablePeriodicSnapshotIds: [] },
};

export interface FakeFlows {
  readonly preview: Mock;
  readonly apply: Mock;
  readonly cancel: Mock;
  readonly revise: Mock;
  readonly undo: Mock;
  readonly lastImport: Mock;
  readonly restore: Mock;
  readonly export: Mock;
}

export interface FakeApp {
  readonly status: StatusWriter;
  readonly store: StoreHandle;
  readonly flows: FakeFlows;
  readonly saveEverythingNow: Mock;
  readonly retryReplica: Mock;
  readonly retryEngine: Mock;
  readonly loadDemo: Mock;
  readonly reload: Mock;
  readonly panels: PanelsStore;
  readonly panelSaves: Record<string, unknown>[];
  readonly navigator: NavigatorRig;
  readonly inspectorStore: InspectorStore;
  readonly inspector: InspectorPorts;
  readonly value: AppContextValue;
}

export function emptyStoreState(): CanonicalState {
  return emptyState(createIdFactory({ nowMs: () => 1_790_000_000_000 }, { next: () => 0.5 }));
}

/** jsdom has neither `showModal()` nor `close()` of HTMLDialogElement: the documented behaviour, installed once for a test file. */
export function stubDialog(): void {
  const proto = HTMLDialogElement.prototype as { showModal?: () => void; close?: () => void };
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

export function fakeApp(options: { state?: CanonicalState; status?: Partial<AppStatus>; panels?: Partial<PanelsPort>; navigator?: Parameters<typeof navigatorRig>[1] } = {}): FakeApp {
  const status = createStatusStore(() => undefined);
  status.update({ ...WRITER_STATUS, ...options.status });
  const store = createCanonicalStore({ initial: options.state ?? emptyStoreState(), revision: 0, validateInitial: false });
  const flows: FakeFlows = { preview: vi.fn(), apply: vi.fn(), cancel: vi.fn(() => Promise.resolve({ cancelled: true })), revise: vi.fn(), undo: vi.fn(), lastImport: vi.fn(() => Promise.resolve({ batchId: 'b', fileName: 'earlier.orn.json', appliedAt: '2026-10-12T10:00:00.000Z', format: 'orn.dataset', mode: 'merge', undoable: true })), restore: vi.fn(), export: vi.fn() };
  const saveEverythingNow = vi.fn(() => Promise.resolve({ ok: true, revision: 1 }));
  const retryReplica = vi.fn(() => Promise.resolve({ ok: true }));
  const retryEngine = vi.fn(() => Promise.resolve({ ok: true }));
  const loadDemo = vi.fn((): Promise<DemoLoad> => Promise.resolve({ ok: true, blob: new Blob(['{}']), fileName: 'demo.orn.json' }));
  const reload = vi.fn();
  const navigator = navigatorRig(store, options.navigator);
  const search = { search: vi.fn(() => Promise.resolve({ ok: false, code: 'NOT_READY', message: 'the search index is not loaded' })), superseded: () => 0 };
  const services = { store, status, flows, saveEverythingNow, retryReplica, retryEngine, search } as unknown as WindowServices;
  const panelSaves: Record<string, unknown>[] = [];
  const panels = createPanelsStore(
    { stored: undefined, mode: () => 'writable', save: (value) => (panelSaves.push({ ...value }), Promise.resolve()), ...options.panels },
    { after: () => () => undefined },
  );
  const inspectorStore = createInspectorStore();
  const inspector: InspectorPorts = {
    store,
    indexes: navigator.ports.indexes,
    findings: store.findings,
    l4: { statusOf: () => ({ state: 'none' }), derivedFormulaOf: () => undefined, subscribe: () => () => undefined, subscribeFormulas: () => () => undefined },
    timers: navigator.ports.timers,
    ui: { inspector: inspectorStore, selection: navigator.ports.ui.selection, family: navigator.ports.ui.family, panels },
    log: () => undefined,
  };
  return { status, store, flows, saveEverythingNow, retryReplica, retryEngine, loadDemo, reload, panels, panelSaves, navigator, inspectorStore, inspector, value: { services, panels, navigator: navigator.ports, inspector, loadDemo, reload } };
}

export function renderWithApp(app: FakeApp, ui: ReactNode = <Window />) {
  return render(<AppProvider value={app.value}>{ui}</AppProvider>);
}

/** An `ImportPlan` with every field present; `preview` overrides change what the summary shows. */
export function planOf(preview: Partial<ImportPreview> = {}, plan: Partial<Pick<ImportPlan, 'mode'>> = {}): ImportPlan {
  const full: ImportPreview = {
    batchId: 'batch-1',
    format: 'orn.dataset',
    detectedSchemaVersion: 1,
    migrationsApplied: [],
    counts: { species: { incoming: 3, new: 3, identical: 0, conflicting: 0 }, reaction: { incoming: 2, new: 2, identical: 0, conflicting: 0 } },
    quarantined: [],
    conflicts: [],
    findings: [],
    findingSummary: { error: 0, warning: 1, info: 0, reviewRequired: 0, truncated: false },
    decisions: [],
    richTextLinksRewritten: 0,
    unsafeKeysRenamed: [],
    kindMismatches: [],
    rejectedAssets: [],
    packageIssues: [],
    assets: { toStore: 0, notStored: 0, withoutBytes: 0 },
    mergedRecordCount: 5,
    canConfirm: true,
    blockers: [],
    ...preview,
  } as ImportPreview;
  return { preview: full, mode: plan.mode ?? 'replace_all', decisions: full.decisions, conflicts: [], excluded: [], copyIdMap: [] };
}
