/**
 * What the window does about importing (step 5.9a): ONE model for the import screen, the entry points (the File menu, the palette, the
 * first-run screen and a file dropped on the window all call `pick` / `openFile`), the hidden file input, the drop target and the
 * bundled demo. The screen itself is the data-exchange feature's lazy chunk; this file only connects it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createImportModel, ImportNotices, LazyImportScreen, type ImportModel } from '@/features/data-exchange';
import { useSubscribable } from '@/ui/hooks';
import { useStore } from 'zustand';
import { useApp } from './context';
import { datasetWordsOf, useDatasetInfo } from './dataset-info';
import { createImportPorts, importReason } from './import-port';
import styles from './window.module.css';

export interface ImportActions {
  readonly model: ImportModel;
  /** Why an import cannot start now; undefined: it can. */
  readonly reason: string | undefined;
  /** An import, an undo or the demo fetch is in progress. */
  readonly busy: boolean;
  /** Opens the file chooser. */
  pick(): void;
  loadDemo(): void;
  undoImport(): void;
}

const ACCEPT = '.json,.orn,.ornpkg,.zip,application/json';

export function useImportActions(): { readonly actions: ImportActions; readonly element: ReactNode } {
  const { services, loadDemo: fetchDemo, navigator } = useApp();
  const dataset = useDatasetInfo();
  const words = datasetWordsOf(dataset);
  const status = useSubscribable(services.status);
  const ports = useMemo(() => createImportPorts(services, navigator.log), [services, navigator.log]);
  const model = useMemo(() => createImportModel(ports), [ports]);
  useEffect(() => () => model.dispose(), [model]);
  const open = useStore(model.store, (state) => state.phase !== 'closed');
  const [fetching, setFetching] = useState(false);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const busy = open || fetching || status.operation !== null;
  const reason = importReason(status) ?? (open || fetching ? 'another import is open' : undefined);

  const pick = useCallback(() => picker.current?.click(), []);
  const loadDemo = useCallback(() => {
    const why = model.unavailable();
    if (why !== undefined) {
      model.say('warning', `The ${words.noun} was not loaded: ${why}.`);
      return;
    }
    setFetching(true);
    void fetchDemo().then((demo) => {
      setFetching(false);
      if (!demo.ok) model.say('warning', `The ${words.noun} could not be loaded: ${demo.message}`);
      else if (dataset?.kind === 'published') model.openBlob(demo.blob, demo.fileName, { auto: true, onApplied: () => dataset.remember(dataset.sha256) });
      else model.openBlob(demo.blob, demo.fileName, { auto: true });
    });
  }, [model, fetchDemo, dataset, words.noun]);

  // A file dropped on the window opens the same screen. The browser's own "open this file" is always prevented; a drop that cannot be
  // taken says why, and extra files are said out loud (one file at a time).
  const latest = useRef({ model, reason });
  latest.current = { model, reason };
  useEffect(() => {
    const hasFiles = (event: DragEvent): boolean => event.dataTransfer?.types.includes('Files') === true;
    const over = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragging(true);
    };
    const leave = (event: DragEvent): void => {
      if (event.relatedTarget === null) setDragging(false);
    };
    const drop = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragging(false);
      const files = [...(event.dataTransfer?.files ?? [])];
      const { model: current, reason: why } = latest.current;
      if (files.length === 0) return;
      if (why !== undefined) {
        current.say('warning', `The dropped file ${files[0]?.name ?? ''} was not opened: ${why}.`);
        return;
      }
      if (files.length > 1) current.say('warning', `${files.length} files were dropped; only ${files[0]?.name ?? 'the first'} was opened. Import the others one at a time.`);
      if (files[0] !== undefined) current.openFile(files[0]);
    };
    document.addEventListener('dragenter', over);
    document.addEventListener('dragover', over);
    document.addEventListener('dragleave', leave);
    document.addEventListener('drop', drop);
    return () => {
      document.removeEventListener('dragenter', over);
      document.removeEventListener('dragover', over);
      document.removeEventListener('dragleave', leave);
      document.removeEventListener('drop', drop);
    };
  }, []);

  const actions = useMemo<ImportActions>(
    () => ({ model, reason, busy, pick, loadDemo, undoImport: model.undoImport }),
    [model, reason, busy, pick, loadDemo],
  );
  const element = (
    <>
      <input
        ref={picker}
        type="file"
        hidden
        aria-label="Choose a file to import"
        accept={ACCEPT}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file !== undefined) model.openFile(file);
        }}
      />
      {dragging ? <div className={styles.dropHint}>Drop a file to import it</div> : null}
      <LazyImportScreen model={model} ports={ports} />
      <ImportNotices model={model} />
    </>
  );
  return { actions, element };
}
