/**
 * The import screen's model (step 5.9a): a plain React-free store that drives choose -> preview -> decide -> apply -> done, and Undo
 * import. It holds NO chemistry and decides nothing about the data: the flows answer values, the model words them.
 *  - nothing is applied until Confirm (INV-21); Confirm needs `canConfirm`;
 *  - every change in the preview is a revise of the FULL request (`requestOf`) and the preview is replaced by the answer;
 *  - a token per call: an older answer never replaces a newer state;
 *  - Cancel before the apply step changes nothing; "Imported N records" only after the data is saved (the flow answers after flush);
 *  - a worker that is down is an OFFER ("read the file on this page"), never taken silently.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ImportPlan, ImportPlanRequest } from '@/io';
import type { DataExchangePorts, EarlierImportInfo, FlowFailure, PreviewAnswer } from './contracts';
import { createApplyPace, realPaceClock, type PaceClock } from './apply-pace';
import { requestOf, totalsOf, type PlanChange } from './plan-request';
import { appliedWords, cancellableStage, refusalWords, shownName, type Refusal, plainEngineText } from './words';

const workerWhy = (message: string): string => (plainEngineText(message) === '' ? '' : ` (${plainEngineText(message)})`);

const undoNothing = (message: string): string => (plainEngineText(message) === '' ? 'Undo import: the newest import did not keep a safety copy, so it cannot be undone.' : `Undo import: ${plainEngineText(message)}.`);

export type ImportPhase = 'closed' | 'reading' | 'refused' | 'preview' | 'applying' | 'undoing';

export type Offer = 'merge' | 'in_process' | 'preview_again';

export interface ImportNotice {
  /** Counts every notice, so a toast is pushed once per notice. */
  readonly serial: number;
  readonly kind: 'info' | 'warning';
  readonly text: string;
  /** The toast offers "Undo import". */
  readonly offerUndo: boolean;
}

export interface ImportState {
  readonly phase: ImportPhase;
  readonly fileName: string;
  readonly plan?: ImportPlan;
  readonly earlier?: EarlierImportInfo;
  readonly inProcess: boolean;
  /** A revise is on its way: the choices wait. */
  readonly revising: boolean;
  /** `refused`: why the file or the apply did not go on. */
  readonly refusal?: Refusal;
  readonly offer?: Offer;
  /** A line under the preview: the last choice was refused, an apply was cancelled. */
  readonly note?: string;
  /** `applying` / `undoing`: the stage in words, and whether Cancel still changes nothing. */
  readonly stage?: string;
  readonly progress?: { readonly done: number; readonly total: number | null } | null;
  /** `applying`: the apply has run longer than 2 s (step 5.11b); only then is `progress` shown, and it is paced (apply-pace.ts). */
  readonly long?: boolean;
  readonly cancellable: boolean;
  /** The last result, for the toast. */
  readonly notice?: ImportNotice;
}

export interface ImportModel {
  readonly store: StoreApi<ImportState>;
  /** The user chose a file (picker, drop, palette, first run). */
  openFile(file: File): void;
  /** Any blob; `auto`: apply without the preview step when nothing blocks (the bundled demo). */
  openBlob(blob: Blob, fileName: string, options?: { readonly auto?: boolean }): void;
  change(change: PlanChange): void;
  confirm(): void;
  /** Cancel, or the dialog's Esc: whatever is open ends and nothing is changed (a stage past the commit cannot be cancelled). */
  cancel(): void;
  /** Dismisses a refusal. */
  close(): void;
  acceptOffer(): void;
  undoImport(): void;
  /** Shows a notice (a toast) from outside the model: the window uses it for what it refused before an import could start. */
  say(kind: 'info' | 'warning', text: string): void;
  /** Why the user may not start an import now; undefined: they may. */
  unavailable(): string | undefined;
  dispose(): void;
}

interface Source {
  readonly blob: Blob;
  readonly fileName: string;
  readonly auto: boolean;
}

const CLOSED: ImportState = { phase: 'closed', fileName: '', inProcess: false, revising: false, cancellable: false };
const isFailure = (answer: PreviewAnswer): answer is FlowFailure => !answer.ok;

export function createImportModel(ports: DataExchangePorts, options?: { readonly clock?: PaceClock }): ImportModel {
  const store = createStore<ImportState>(() => CLOSED);
  const pace = createApplyPace(options?.clock ?? realPaceClock, ({ long, progress }) => {
    if (store.getState().phase === 'applying') store.setState({ long, progress });
  });
  let source: Source | undefined;
  /** What the offer will run. */
  let retry: { readonly request: ImportPlanRequest; readonly inProcess: boolean } | undefined;
  let controller: AbortController | undefined;
  let token = 0;
  let serial = 0;
  let unsubscribe: (() => void) | undefined;

  const set = (next: Partial<ImportState> & Pick<ImportState, 'phase'>): void =>
    store.setState((current) => ({ ...CLOSED, notice: current.notice, ...next }), true);
  const announce = (kind: 'info' | 'warning', text: string, offerUndo = false): void => {
    serial += 1;
    store.setState((current) => ({ ...current, notice: { serial, kind, text, offerUndo } }));
  };
  const stopWatching = (): void => {
    pace.stop();
    unsubscribe?.();
    unsubscribe = undefined;
  };
  const watch = (): void => {
    stopWatching();
    const read = (): void => {
      const operation = ports.operation();
      if (operation === null) return;
      const state = store.getState();
      if (state.phase !== 'applying' && state.phase !== 'undoing') return;
      if (state.phase === 'applying') pace.feed(operation.progress);
      store.setState({ stage: operation.stage, ...(state.phase === 'applying' ? {} : { progress: operation.progress }), cancellable: state.phase === 'applying' && cancellableStage(operation.stage) });
    };
    unsubscribe = ports.subscribeOperation(read);
    read();
  };
  const refuse = (fileName: string, refusal: Refusal, offer?: Offer): void => {
    stopWatching();
    set({ phase: 'refused', fileName, refusal, ...(offer === undefined ? {} : { offer }) });
  };

  async function runApply(plan: ImportPlan, fileName: string, inProcess: boolean): Promise<void> {
    const mine = ++token;
    controller = new AbortController();
    const { signal } = controller;
    set({ phase: 'applying', fileName, plan, inProcess, stage: 'preparing', progress: null, long: false, cancellable: true });
    watch();
    pace.start();
    const answer = await ports.apply(plan.preview.batchId, plan, { signal, inProcess });
    if (mine !== token) return;
    controller = undefined;
    pace.finish();
    stopWatching();
    if (answer.ok) {
      const totals = totalsOf(plan);
      const words = appliedWords({ written: totals.written, skipped: totals.skipped, fileName, saved: answer.saved, sessionOnly: answer.sessionOnly, saveError: answer.save?.lastError ?? null });
      const extra = [...answer.notes, ...(answer.reportSaved ? [] : [`The import report could not be stored${answer.reportError === undefined ? '' : ` (${answer.reportError})`}.`])];
      set({ phase: 'closed' });
      announce(words.kind === 'info' && extra.length > 0 ? 'warning' : words.kind, [words.text, ...extra.map((line) => (/[.!?]$/.test(line) ? line : `${line}.`))].join(' '), true);
      return;
    }
    if (answer.code === 'CANCELLED') {
      set({ phase: 'preview', fileName, plan, inProcess, note: 'The import was cancelled before anything was changed. You can confirm again or cancel.' });
      return;
    }
    if (answer.code === 'WORKER_DOWN' && answer.inProcessAvailable === true) {
      retry = { request: requestOf(plan), inProcess: true };
      refuse(fileName, { title: 'The background worker is down', text: `The worker that applies the import stopped${workerWhy(answer.message)}. Nothing was imported. The file can be read again on this page, then you confirm again; the page may freeze while it runs.` }, 'in_process');
      return;
    }
    const lost = answer.code === 'UNKNOWN_BATCH' || answer.code === 'STALE_REVISION' || answer.code === 'PLAN_MISMATCH';
    if (lost) retry = { request: requestOf(plan), inProcess: false };
    refuse(fileName, refusalWords(answer), lost ? 'preview_again' : undefined);
  }

  async function runPreview(from: Source, request: ImportPlanRequest, inProcess: boolean): Promise<void> {
    const mine = ++token;
    controller = new AbortController();
    set({ phase: 'reading', fileName: from.fileName, inProcess, cancellable: true });
    const answer = await ports.preview(from.blob, from.fileName, request, { signal: controller.signal, inProcess });
    if (mine !== token) return;
    controller = undefined;
    if (!isFailure(answer)) {
      if (from.auto && answer.plan.preview.canConfirm) {
        await runApply(answer.plan, from.fileName, answer.inProcess);
        return;
      }
      set({ phase: 'preview', fileName: from.fileName, plan: answer.plan, inProcess: answer.inProcess, ...(answer.earlierImport === undefined ? {} : { earlier: answer.earlierImport }) });
      return;
    }
    if (answer.code === 'CANCELLED') {
      set({ phase: 'closed' });
      return;
    }
    if (answer.code === 'INVALID_META' && request.mode === 'replace_all') {
      // A file with no usable dataset information (every older-app file) cannot replace; merge keeps all of its records and this dataset
      // keeps its own title. Nothing is applied before Confirm, and the preview says so.
      controller = new AbortController();
      const merged = await ports.preview(from.blob, from.fileName, { mode: 'merge' }, { signal: controller.signal, inProcess });
      if (mine !== token) return;
      controller = undefined;
      if (!isFailure(merged)) {
        set({
          phase: 'preview',
          fileName: from.fileName,
          plan: merged.plan,
          inProcess: merged.inProcess,
          note: 'This file has no dataset title or details, so it can only be added to what you have (merged). Nothing changes until you press Confirm.',
          ...(merged.earlierImport === undefined ? {} : { earlier: merged.earlierImport }),
        });
        return;
      }
      refuse(from.fileName, refusalWords(merged));
      return;
    }
    if (answer.code === 'WORKER_DOWN' && answer.inProcessAvailable === true) {
      retry = { request, inProcess: true };
      refuse(from.fileName, { title: 'The background worker is down', text: `The worker that reads files stopped${workerWhy(answer.message)}. Nothing was imported. The file can be read on this page instead; the page may freeze while it runs.` }, 'in_process');
      return;
    }
    refuse(from.fileName, refusalWords(answer));
  }

  async function runRevise(change: PlanChange): Promise<void> {
    const state = store.getState();
    const plan = state.plan;
    if (state.phase !== 'preview' || plan === undefined || state.revising) return;
    const request = requestOf(plan, change);
    const mine = ++token;
    controller = new AbortController();
    store.setState({ revising: true, note: undefined });
    const answer = await ports.revise(plan.preview.batchId, request, { signal: controller.signal, inProcess: state.inProcess });
    if (mine !== token) return;
    controller = undefined;
    if (!isFailure(answer)) {
      store.setState({ plan: answer.plan, revising: false, inProcess: answer.inProcess, ...(answer.earlierImport === undefined ? {} : { earlier: answer.earlierImport }) });
      return;
    }
    if (answer.code === 'CANCELLED') {
      store.setState({ revising: false });
      return;
    }
    if (answer.code === 'INVALID_REQUEST') {
      store.setState({ revising: false, note: refusalWords(answer).text });
      return;
    }
    if (answer.code === 'WORKER_DOWN' && answer.inProcessAvailable === true) {
      retry = { request, inProcess: true };
      refuse(state.fileName, { title: 'The background worker is down', text: `The worker stopped${workerWhy(answer.message)}. Your choice was not applied and nothing was imported. The file can be read on this page instead; the page may freeze while it runs.` }, 'in_process');
      return;
    }
    const lost = answer.code === 'UNKNOWN_BATCH' || answer.code === 'STALE_REVISION';
    if (lost) retry = { request: requestOf(plan), inProcess: false };
    refuse(state.fileName, refusalWords(answer), lost ? 'preview_again' : undefined);
  }

  async function runUndo(): Promise<void> {
    const reason = ports.unavailable();
    if (reason !== undefined) {
      announce('warning', `Undo import is not available now: ${reason}.`);
      return;
    }
    const last = await ports.lastImport();
    if (last === undefined) {
      announce('warning', 'There is no import to undo.');
      return;
    }
    if (!last.undoable) {
      announce('warning', `The newest import (${shownName(last.fileName)}) did not record a snapshot, so it cannot be undone.`);
      return;
    }
    const mine = ++token;
    set({ phase: 'undoing', fileName: last.fileName, stage: 'preparing', progress: null, cancellable: false });
    watch();
    const answer = await ports.undo();
    if (mine !== token) return;
    stopWatching();
    set({ phase: 'closed' });
    const name = shownName(last.fileName);
    if (!answer.ok) {
      announce('warning', answer.code === 'UNKNOWN_BATCH' ? undoNothing(answer.message) : `The import of ${name} was not undone. ${refusalWords(answer).text}`);
      return;
    }
    const count = ports.recordCount();
    const back = `Import undone: the data from before it is back. That was the import of ${name}; the dataset holds ${count} records again.`;
    const tail = answer.sessionOnly ? ' Not saved: nothing is stored in this tab.' : answer.saved ? '' : ' It is not saved yet; the status line shows the save state.';
    announce(answer.saved || answer.sessionOnly ? 'info' : 'warning', `${back}${tail}${answer.notes.length > 0 ? ` ${answer.notes.join('. ')}.` : ''}`);
  }

  const start = (from: Source): void => {
    const reason = ports.unavailable();
    if (reason !== undefined || store.getState().phase !== 'closed') {
      announce('warning', `The file ${shownName(from.fileName)} was not opened: ${reason ?? 'an import is already open'}.`);
      return;
    }
    source = from;
    retry = undefined;
    // The bundled demo replaces; an empty dataset has nothing to merge into, so the file's own dataset information is kept (replace_all).
    // Anything else starts as merge, which keeps everything you have.
    void runPreview(from, { mode: from.auto || ports.recordCount() === 0 ? 'replace_all' : 'merge' }, false);
  };

  return {
    store,
    openFile: (file) => start({ blob: file, fileName: file.name, auto: false }),
    openBlob: (blob, fileName, options) => start({ blob, fileName, auto: options?.auto === true }),
    change: (change) => void runRevise(change),
    confirm() {
      const { phase, plan, fileName, inProcess, revising } = store.getState();
      if (phase !== 'preview' || plan === undefined || revising || !plan.preview.canConfirm) return;
      void runApply(plan, fileName, inProcess);
    },
    cancel() {
      const state = store.getState();
      if (state.phase === 'reading' || state.phase === 'applying') {
        if (state.phase === 'applying' && !state.cancellable) return;
        controller?.abort();
        return;
      }
      if (state.phase === 'preview') {
        token += 1;
        controller?.abort();
        if (state.plan !== undefined) void ports.cancel(state.plan.preview.batchId);
        set({ phase: 'closed' });
        return;
      }
      if (state.phase === 'refused') set({ phase: 'closed' });
    },
    close() {
      if (store.getState().phase === 'refused') set({ phase: 'closed' });
    },
    acceptOffer() {
      const pending = retry;
      const from = source;
      if (pending === undefined || from === undefined) return;
      void runPreview(from, pending.request, pending.inProcess);
    },
    undoImport: () => void runUndo(),
    say: (kind, text) => announce(kind, text),
    unavailable: () => ports.unavailable(),
    dispose() {
      token += 1;
      controller?.abort();
      stopWatching();
    },
  };
}
