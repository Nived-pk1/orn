/**
 * The import flow of the first-run window (step 5.1d, note E7, 5.1c review REQUIRED 1): "Load demo dataset" and "Import a file" go
 * through `services.flows` (the normal import pipeline). An import into a store with ZERO records uses `replace_all` on purpose, so
 * the file's own dataset meta is kept; if the pipeline refuses that with `INVALID_META` the window says so and offers merge. An
 * import into a store that holds records is 5.9a. Every answer is a value; the view is plain data the panel renders.
 */
import { useCallback, useRef, useState } from 'react';
import type { ImportPlan, ImportPlanRequest } from '@/io';
import type { ImportApplyAnswer, ImportPreviewAnswer } from '@/app/services';
import { useApp } from './context';

export type ImportView =
  | { readonly phase: 'idle' }
  | { readonly phase: 'working'; readonly text: string; readonly cancellable: boolean }
  | { readonly phase: 'summary'; readonly plan: ImportPlan; readonly fileName: string; readonly inProcess: boolean }
  | { readonly phase: 'message'; readonly text: string; readonly offer?: 'merge' | 'in_process' }
  | { readonly phase: 'done'; readonly text: string; readonly notes: readonly string[] };

interface Source {
  readonly blob: Blob;
  readonly fileName: string;
  /** The demo loads without a confirm step (a bundled file, nothing to decide). */
  readonly auto: boolean;
}

interface Retry {
  readonly source: Source;
  readonly request: ImportPlanRequest;
  readonly inProcess: boolean;
}

export interface ImportFlow {
  readonly view: ImportView;
  readonly busy: boolean;
  loadDemo(): void;
  chooseFile(file: File): void;
  /** Restores the `pre_import` snapshot of the newest import (Dataset mode). */
  undoImport(): void;
  confirm(): void;
  cancel(): void;
  /** Takes the offer of the current message (merge, or the in-page path). */
  acceptOffer(): void;
  dismiss(): void;
}

const describeFailure = (what: string, code: string, message: string): string => `${what} (${code}): ${message}`;

export function useImportFlow(): ImportFlow {
  const { services, loadDemo: fetchDemo } = useApp();
  const [view, setView] = useState<ImportView>({ phase: 'idle' });
  const retry = useRef<Retry | null>(null);
  const abort = useRef<AbortController | null>(null);

  const applyPlan = useCallback(
    async (plan: ImportPlan, source: Source, inProcess: boolean): Promise<void> => {
      setView({ phase: 'working', text: `Applying ${source.fileName}`, cancellable: false });
      const answer: ImportApplyAnswer = await services.flows.apply(plan.preview.batchId, plan, { inProcess });
      if (answer.ok) {
        const notes = [...answer.notes];
        if (!answer.reportSaved) notes.push(`The import report could not be stored${answer.reportError === undefined ? '' : ` (${answer.reportError})`}.`);
        const count = plan.preview.mergedRecordCount;
        const text =
          answer.saved || answer.sessionOnly
            ? `Imported ${count} records from ${source.fileName}.${answer.sessionOnly ? ' Nothing is saved in this session.' : ''}`
            : `Applied ${count} records from ${source.fileName}, but not saved yet. The status line shows the save state.`;
        setView({ phase: 'done', text, notes });
      } else if (answer.code === 'WORKER_DOWN' && answer.inProcessAvailable === true) {
        retry.current = { source, request: { mode: plan.mode }, inProcess: true };
        setView({ phase: 'message', text: `The background worker is down (${answer.message}). The import can run on this page instead; the page may freeze while it runs.`, offer: 'in_process' });
      } else {
        setView({ phase: 'message', text: describeFailure('The import was not applied', answer.code, answer.message) });
      }
    },
    [services],
  );

  const runPreview = useCallback(
    async (source: Source, request: ImportPlanRequest, inProcess: boolean): Promise<void> => {
      setView({ phase: 'working', text: `Reading ${source.fileName}`, cancellable: true });
      const controller = new AbortController();
      abort.current = controller;
      const answer: ImportPreviewAnswer = await services.flows.preview(source.blob, source.fileName, request, { signal: controller.signal, inProcess });
      abort.current = null;
      if (answer.ok) {
        if (source.auto && answer.plan.preview.canConfirm) await applyPlan(answer.plan, source, answer.inProcess);
        else setView({ phase: 'summary', plan: answer.plan, fileName: source.fileName, inProcess: answer.inProcess });
        return;
      }
      if (answer.code === 'CANCELLED') setView({ phase: 'idle' });
      else if (answer.code === 'INVALID_META' && request.mode === 'replace_all') {
        retry.current = { source, request: { mode: 'merge' }, inProcess };
        setView({ phase: 'message', text: `The file's own dataset information was refused (${answer.message}). It can be merged into the empty dataset instead; the file's records are kept and this dataset keeps its own title.`, offer: 'merge' });
      } else if (answer.code === 'WORKER_DOWN' && answer.inProcessAvailable === true) {
        retry.current = { source, request, inProcess: true };
        setView({ phase: 'message', text: `The background worker is down (${answer.message}). The file can be read on this page instead; the page may freeze while it runs.`, offer: 'in_process' });
      } else setView({ phase: 'message', text: describeFailure('The file was not imported', answer.code, answer.message) });
    },
    [services, applyPlan],
  );

  const start = useCallback(
    (source: Source) => {
      retry.current = null;
      void runPreview(source, { mode: 'replace_all' }, false);
    },
    [runPreview],
  );

  return {
    view,
    busy: view.phase === 'working',
    loadDemo() {
      setView({ phase: 'working', text: 'Fetching the demo dataset', cancellable: false });
      void fetchDemo().then((demo) => {
        if (demo.ok) start({ blob: demo.blob, fileName: demo.fileName, auto: true });
        else setView({ phase: 'message', text: `The demo dataset could not be loaded: ${demo.message}` });
      });
    },
    chooseFile: (file) => start({ blob: file, fileName: file.name, auto: false }),
    undoImport() {
      setView({ phase: 'working', text: 'Undoing the import', cancellable: false });
      void services.flows.undo().then((answer) => {
        if (!answer.ok) setView({ phase: 'message', text: describeFailure('The import was not undone', answer.code, answer.message) });
        else setView({ phase: 'done', text: answer.saved || answer.sessionOnly ? 'Import undone: the data from before it is back.' : 'Import undone, but not saved yet. The status line shows the save state.', notes: [...answer.notes] });
      });
    },
    confirm() {
      if (view.phase !== 'summary' || !view.plan.preview.canConfirm) return;
      void applyPlan(view.plan, { blob: new Blob(), fileName: view.fileName, auto: false }, view.inProcess);
    },
    cancel() {
      if (view.phase === 'working') abort.current?.abort();
      else if (view.phase === 'summary') {
        void services.flows.cancel(view.plan.preview.batchId);
        setView({ phase: 'idle' });
      }
    },
    acceptOffer() {
      const pending = retry.current;
      if (pending === null) return;
      void runPreview(pending.source, pending.request, pending.inProcess);
    },
    dismiss: () => setView({ phase: 'idle' }),
  };
}
