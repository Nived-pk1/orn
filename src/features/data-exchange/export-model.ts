/**
 * The export screen's model (step 5.9b): a plain React-free store that drives options -> running -> done (or cancelled, or refused).
 * It holds NO chemistry. The flow builds the bytes; the model words the answer and hands a Blob to `ports.save`.
 *  - one export at a time; Cancel gives NO file and says so (a file that finished in the same instant as the Cancel is not saved);
 *  - a worker that is down is an OFFER ("build it on this page"), never taken silently;
 *  - the result says what was written (counts per kind) and every gap (images without bytes, references that leave the file).
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ExportOptions } from '@/io';
import type { ExportFormatId, ExportPorts, ImageInfo } from './export-contracts';
import {
  defaultBase,
  exportRefusal,
  fileNameOf,
  imagesFor,
  MIME,
  progressWords,
  writtenOf,
  type ExportRefusal,
  type ExportScopeId,
  type ImagesChoice,
  type Written,
} from './export-words';

export type ExportPhase = 'closed' | 'options' | 'running' | 'done' | 'cancelled' | 'refused';

export interface ExportState {
  readonly phase: ExportPhase;
  readonly format: ExportFormatId;
  readonly scope: ExportScopeId;
  readonly images: ImagesChoice;
  /** What the user typed (or the offered name) without the extension; the file name is made safe from it. */
  readonly base: string;
  readonly imageInfo: ImageInfo;
  /** `running`: what is happening, in words. */
  readonly progress?: string;
  readonly written?: Written;
  readonly refusal?: ExportRefusal;
  /** The refusal offers the same export on this page. */
  readonly offerInProcess: boolean;
  /** Why Export cannot start now (another operation); the options stay editable. */
  readonly blocked?: string;
}

export interface ExportModel {
  readonly store: StoreApi<ExportState>;
  /** Opens the options. Works in every tab mode (an export only reads). */
  open(): void;
  setFormat(format: ExportFormatId): void;
  setScope(scope: ExportScopeId): void;
  setImages(images: ImagesChoice): void;
  setBase(base: string): void;
  /** Runs the export; `inProcess`: build it on this page (only after the user accepted the offer). */
  start(inProcess?: boolean): void;
  /** Stops a running export (no file), or closes whatever is open. */
  cancel(): void;
  /** Back from a result or a refusal to the options. */
  again(): void;
  /** Saves the finished file once more. */
  saveAgain(): void;
  close(): void;
  dispose(): void;
}

const NO_IMAGES: ImageInfo = { count: 0, bytes: 0 };
const CLOSED: ExportState = { phase: 'closed', format: 'orn.json', scope: 'full', images: 'none', base: '', imageInfo: NO_IMAGES, offerInProcess: false };

export function createExportModel(ports: ExportPorts): ExportModel {
  const store = createStore<ExportState>(() => CLOSED);
  let controller: AbortController | undefined;
  let token = 0;
  let finished: { readonly blob: Blob; readonly fileName: string } | undefined;

  const patch = (next: Partial<ExportState>): void => store.setState((current) => ({ ...current, ...next }));
  const clear = (): void => {
    controller = undefined;
    finished = undefined;
  };

  function open(): void {
    if (store.getState().phase !== 'closed') return;
    clear();
    const blocked = ports.unavailable();
    store.setState({
      ...CLOSED,
      phase: 'options',
      base: defaultBase(ports.datasetTitle(), ports.today()),
      imageInfo: ports.images(),
      ...(blocked === undefined ? {} : { blocked }),
    });
  }

  function start(inProcess = false): void {
    const state = store.getState();
    if (state.phase !== 'options' && state.phase !== 'refused') return;
    const blocked = ports.unavailable();
    if (blocked !== undefined) {
      patch({ blocked });
      return;
    }
    const mine = ++token;
    const run = new AbortController();
    controller = run;
    const { format, scope } = state;
    const images = imagesFor(state.images, format);
    const fileName = fileNameOf(state.base, format);
    const options: ExportOptions = { scope, includeDependencies: true, assets: images };
    patch({ phase: 'running', progress: 'Starting', offerInProcess: false });
    void ports
      .run(options, format, {
        signal: run.signal,
        inProcess,
        onProgress: (done, total, note) => {
          if (mine === token) patch({ progress: progressWords(done, total, note) });
        },
      })
      .then((answer) => {
        if (mine !== token) return;
        controller = undefined;
        if (answer.ok) {
          if (run.signal.aborted) {
            patch({ phase: 'cancelled' });
            return;
          }
          const blob = new Blob([answer.result.bytes as BlobPart], { type: MIME[format] });
          finished = { blob, fileName };
          try {
            ports.save(blob, fileName);
          } catch (error) {
            patch({ phase: 'refused', refusal: { title: 'The file could not be saved', text: `The browser refused to save the file (${error instanceof Error ? error.message : String(error)}). Nothing was written to your device.` }, offerInProcess: false });
            return;
          }
          ports.log('export', `exported ${fileName}`);
          patch({ phase: 'done', written: writtenOf(answer.result, fileName, answer.inProcess, ports.nameOf) });
          return;
        }
        if (answer.code === 'CANCELLED') {
          patch({ phase: 'cancelled' });
          return;
        }
        patch({ phase: 'refused', refusal: exportRefusal(answer), offerInProcess: answer.code === 'WORKER_DOWN' && answer.inProcessAvailable === true });
      });
  }

  function cancel(): void {
    const { phase } = store.getState();
    if (phase === 'running') {
      // Said at once; an answer that arrives later is ignored, so a file that finished in the same instant is not saved.
      token += 1;
      controller?.abort();
      controller = undefined;
      patch({ phase: 'cancelled', progress: undefined });
      return;
    }
    close();
  }

  function close(): void {
    token += 1;
    controller?.abort();
    clear();
    store.setState(CLOSED);
  }

  return {
    store,
    open,
    setFormat: (format) => patch({ format, images: imagesFor(store.getState().images, format) }),
    setScope: (scope) => patch({ scope }),
    setImages: (images) => patch({ images }),
    setBase: (base) => patch({ base }),
    start,
    cancel,
    again: () => {
      clear();
      patch({ phase: 'options', progress: undefined, written: undefined, refusal: undefined, offerInProcess: false });
    },
    saveAgain: () => {
      if (finished !== undefined) ports.save(finished.blob, finished.fileName);
    },
    close,
    dispose: close,
  };
}
