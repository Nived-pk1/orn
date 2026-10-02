/**
 * The plain, unstyled window (step 5.1d): status line, banners, boot lines, the first-run screen while the store holds zero
 * records, and the record and finding counts once it holds some (the navigator is 5.5a). Semantic HTML, text nodes only.
 */
import { useCallback, useRef, useState } from 'react';
import { RECORD_KINDS, type CanonicalState, type RecordKind } from '@/core/schema';
import { useStoreSelector, useSubscribable } from '@/ui/hooks';
import { ErrorBoundary } from '@/ui/primitives';
import { useApp } from './context';
import { ImportPanel } from './import-panel';
import { BootLines, Banners, StatusLine } from './status-parts';
import { useImportFlow, type ImportFlow } from './use-import-flow';

const countsOf = (state: CanonicalState): Readonly<Record<RecordKind, number>> =>
  Object.fromEntries(RECORD_KINDS.map((kind) => [kind, Object.keys(state.records[kind]).length])) as Record<RecordKind, number>;

const totalOf = (counts: Readonly<Record<RecordKind, number>>): number => RECORD_KINDS.reduce((sum, kind) => sum + counts[kind], 0);

function RecordCounts(props: { readonly counts: Readonly<Record<RecordKind, number>> }) {
  const present = RECORD_KINDS.filter((kind) => props.counts[kind] > 0);
  if (present.length === 0) return <p>The dataset is empty.</p>;
  return (
    <ul aria-label="Record counts">
      {present.map((kind) => (
        <li key={kind}>
          {kind.replaceAll('_', ' ')}: {props.counts[kind]}
        </li>
      ))}
    </ul>
  );
}

function FirstRun(props: { readonly flow: ImportFlow; readonly onStartEmpty: () => void }) {
  const { services } = useApp();
  const status = useSubscribable(services.status);
  const { flow } = props;
  const picker = useRef<HTMLInputElement>(null);
  const writable = status.mode === 'writer' || status.mode === 'session_only';
  const waiting = status.stage === 'booting' || status.mode === null;
  return (
    <section aria-label="First run">
      <h2>Get started</h2>
      <p>This dataset has no records yet.</p>
      {waiting ? <p>Starting up…</p> : !writable ? <p>This tab is read-only, so it cannot load data. Use the writer tab.</p> : (
        <>
          <p>
            <button type="button" disabled={flow.busy} onClick={flow.loadDemo}>
              Load demo dataset
            </button>{' '}
            <button type="button" disabled={flow.busy} onClick={() => picker.current?.click()}>
              Import a file
            </button>{' '}
            <button type="button" disabled={flow.busy} onClick={props.onStartEmpty}>
              Start empty
            </button>
          </p>
          <input
            ref={picker}
            type="file"
            hidden
            aria-label="Choose a file to import"
            accept=".json,.orn,.ornpkg,.zip,application/json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file !== undefined) flow.chooseFile(file);
            }}
          />
        </>
      )}
    </section>
  );
}

function Content() {
  const { services } = useApp();
  const counts = useStoreSelector(services.store, countsOf);
  const flow = useImportFlow();
  const [startedEmpty, setStartedEmpty] = useState(false);
  const empty = totalOf(counts) === 0;
  const onStartEmpty = useCallback(() => setStartedEmpty(true), []);
  // The import panel outlives the first-run screen: the result of an import is shown after the data has arrived.
  return (
    <>
      {empty && !startedEmpty ? (
        <FirstRun flow={flow} onStartEmpty={onStartEmpty} />
      ) : (
        <section aria-label="Dataset">
          <h2>Dataset</h2>
          <RecordCounts counts={counts} />
          {empty ? <p>Started empty. Nothing can be added in this version; authoring comes later.</p> : null}
        </section>
      )}
      <ImportPanel flow={flow} />
    </>
  );
}

export function Window() {
  return (
    <main>
      <h1>Organic Reaction Navigator</h1>
      <ErrorBoundary label="The status panel">
        <StatusLine />
        <Banners />
        <BootLines />
      </ErrorBoundary>
      <ErrorBoundary label="The dataset panel">
        <Content />
      </ErrorBoundary>
    </main>
  );
}
