/**
 * The inspector (step 5.6a; UI_ARCHITECTURE §9, §10): the record in focus with its name, kind, finding badges, the places it has in the
 * current view, Back and Forward through the focus history, one status line (a note from the canvas, or why a record has no place in
 * the view) and the levels. It reads the canonical state and never changes it. Every part is a function of one snapshot, taken again
 * when the store, the findings or the L4 checks change.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import type { RecordRef } from '@/core/schema';
import { useLayoutMode } from '@/ui/hooks';
import { Button, Skeleton } from '@/ui/primitives';
import { SHEET_TITLE_ID } from '@/ui/shell';
import type { InspectorHost, InspectorPorts } from './contracts';
import { InspectorEnvContext, isAuthorView, makeEnv, useInspectorEnv, type InspectorEnv } from './env';
import { nameOfRecord, recordOf } from './model/describe';
import { l4Words, severityBadges } from './model/findings';
import { LazyStudyInspector } from './lazy-views';
import type { GoNextAction } from './study-parts';
import { placeOf } from './model/places';

/** The records whose reactions the Reactions view can list (the same set the palette's Alt+Enter uses). */
/** "For authors" is its own chunk: nothing of it loads until an author opens the section (Studio). */
// the map's arrow and bucket views (step 8.2b-fix): their own chunk, loaded when one is first selected
const MapPane = lazy(() => import('./map-pane').then((module) => ({ default: module.MapPane })));
// Back and Forward are drawn from their own small chunk (they only matter once something has been looked at)
const HistoryButtons = lazy(() => import('./history-buttons').then((module) => ({ default: module.HistoryButtons })));
const AuthorsSection = lazy(() => import('./authors-section').then((module) => ({ default: module.AuthorsSection })));

const SHOW_REACTIONS_KINDS: readonly string[] = ['species', 'class', 'reagent', 'named_reaction'];
/** A route ends at a species or a class. */
const PRECURSOR_KINDS: readonly string[] = ['species', 'class'];
import { useBridge } from './use-bridge';
import styles from './inspector.module.css';

/** A number that changes whenever something the inspector shows may have changed. */
function useRevision(ports: InspectorPorts): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const bump = (): void => setRevision((value) => value + 1);
    const offs = [ports.store.subscribe(bump), ports.findings.subscribe(bump), ports.l4.subscribe(bump), ports.l4.subscribeFormulas(bump)];
    return () => offs.forEach((off) => off());
  }, [ports]);
  return revision;
}

export function Inspector(props: { readonly ports: InspectorPorts; readonly host: InspectorHost }) {
  const { ports, host } = props;
  const revision = useRevision(ports);
  const phone = useLayoutMode() === 'phone';
  useBridge(ports, host);
  const inspector = ports.ui.inspector;
  const entry = useStore(inspector, (s) => s.history[s.index] ?? null);
  const open = useCallback(
    (ref: RecordRef, at?: string) => {
      inspector.getState().open(ref, at);
      host.openPane();
    },
    [inspector, host],
  );
  const state = ports.store.getState();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` is the snapshot's identity: the env is made again when it moves
  const env: InspectorEnv = useMemo(() => makeEnv(ports, host, state, open), [ports, host, state, open, revision]);
  const edition = isAuthorView(host) ? 'studio' : 'study';
  const empty = (
    <section aria-label="Inspector empty state" className={styles.root}>
      <p>Select a family, an arrow or a reaction card to see the record here.</p>
      {phone ? null : (
        <>
          <p className={styles.muted}>Alt+Left and Alt+Right move through the records you have looked at.</p>
          <p className={styles.muted}>The record counts of the dataset are under Dataset in the mode list on the left.</p>
        </>
      )}
    </section>
  );
  // the arrow and bucket views (and the pure answer behind them) are their own chunk; an arrow that is gone shows the empty state from there
  if (entry !== null && (entry.kind === 'arrow' || entry.kind === 'bucket')) {
    return (
      <section className={styles.root} data-subject={entry.kind}>
        <InspectorEnvContext.Provider value={env}>
          <Suspense fallback={<Skeleton label="Loading" lines={3} />}>
            <MapPane entry={entry} state={state} ports={ports} open={open} edition={edition} empty={empty} />
          </Suspense>
        </InspectorEnvContext.Provider>
      </section>
    );
  }
  if (entry === null || entry.kind === 'none') return empty;
  const current: RecordRef = { kind: entry.kind, id: entry.id } as RecordRef;
  const record = recordOf(state, current);
  return (
    <InspectorEnvContext.Provider value={env}>
      <article className={styles.root} aria-label="Record" data-record-id={current.id}>
        {record === undefined ? (
          <p role="status" className={styles.missing}>
            Missing record {current.id}: it is not in this dataset (it may have been removed or replaced).
          </p>
        ) : (
          <RecordBody key={`${current.kind}:${current.id}`} refOf={current} />
        )}
      </article>
    </InspectorEnvContext.Provider>
  );
}

function RecordBody(props: { readonly refOf: RecordRef }) {
  const { ports, host, state } = useInspectorEnv();
  const phone = useLayoutMode() === 'phone';
  const inspector = ports.ui.inspector;
  const history = useStore(inspector, (s) => s.history);
  const index = useStore(inspector, (s) => s.index);
  const record = recordOf(state, props.refOf);
  if (record === undefined) return null;
  const authors = isAuthorView(host);
  const name = nameOfRecord(record);
  const findings = ports.findings.bySubject(props.refOf);
  const badges = severityBadges(findings);
  const l4 = l4Words(ports.l4.statusOf(props.refOf));
  const place = placeOf(props.refOf, name, ports.indexes.current(), ports.ui, host.navigatorShown);
  const status = host.explorerShown === true ? undefined : place.line;
  const after = (run: () => void) => (): void => {
    run();
    if (phone) host.closePane?.();
  };
  const kind = props.refOf.kind;
  const goNext: GoNextAction[] = [
    ...place.actions.map((action) => ({ label: action.label, run: after(action.run) })),
    ...(host.showReagent === undefined || kind !== 'reagent' ? [] : [{ label: 'Show in Reagents', run: after(() => host.showReagent?.(props.refOf)) }]),
    ...(host.showNamed === undefined || kind !== 'named_reaction' ? [] : [{ label: 'Show in Named reactions', run: after(() => host.showNamed?.(props.refOf)) }]),
    ...(host.showMechanism === undefined || kind !== 'mechanism' ? [] : [{ label: 'Show in Mechanisms', run: after(() => host.showMechanism?.(props.refOf)) }]),
    ...(host.showReactions === undefined || !SHOW_REACTIONS_KINDS.includes(kind) ? [] : [{ label: 'Show its reactions', run: after(() => host.showReactions?.(props.refOf)) }]),
    ...(host.showPrecursors === undefined || !PRECURSOR_KINDS.includes(kind) ? [] : [{ label: 'How to make it', run: after(() => host.showPrecursors?.(props.refOf)) }]),
  ];
  const editable = host.editNames !== undefined && (host.editNames.namesKinds?.includes(record.kind) === true || host.editNames.fullEditorKinds?.includes(record.kind) === true);
  const headerExtras = (
    <>
      <Suspense fallback={null}>
        <HistoryButtons inspector={inspector} />
      </Suspense>
      {!editable ? null : (
        // on a phone the buttons show in the FULL sheet, not in the peek (authoring is desktop-first, ADR-039 addendum)
        <div className={styles.actions} data-sheet-full="">
          <Button {...(host.editNames?.unavailable === undefined ? { onClick: () => host.editNames?.open(props.refOf) } : { unavailable: host.editNames.unavailable })}>{host.editNames?.fullEditorKinds?.includes(record.kind) === true ? 'Edit' : 'Edit names'}</Button>
          {host.editNames?.remove === undefined ? null : <Button {...(host.editNames.unavailable === undefined ? { onClick: () => host.editNames?.remove?.(props.refOf) } : { unavailable: host.editNames.unavailable })}>Delete...</Button>}
          {record.kind !== 'reaction' || host.editNames?.startFrom === undefined ? null : (
            <>
              <Button {...(host.editNames.unavailable === undefined ? { onClick: () => host.editNames?.startFrom?.('duplicate', props.refOf) } : { unavailable: host.editNames.unavailable })}>Duplicate</Button>
              {record.scope !== 'generic' ? null : <Button {...(host.editNames.unavailable === undefined ? { onClick: () => host.editNames?.startFrom?.('specific', props.refOf) } : { unavailable: host.editNames.unavailable })}>New specific reaction from this one</Button>}
            </>
          )}
        </div>
      )}
    </>
  );
  const authorLines = !authors ? null : (
    <>
      {badges.length === 0 && l4 === undefined ? null : (
        <ul className={styles.badges} aria-label="Findings and checks">
          {badges.map((badge) => (
            <li key={badge.severity} data-severity={badge.severity}>
              {badge.text}
            </li>
          ))}
          {l4 === undefined ? null : <li data-severity="l4">{l4}</li>}
        </ul>
      )}
      {status === undefined ? null : (
        <p role="status" className={styles.status}>
          {status}
        </p>
      )}
    </>
  );
  return (
    <>
      <LazyStudyInspector refOf={props.refOf} record={record} authors={authors} headerExtras={headerExtras} goNext={goNext} titleId={SHEET_TITLE_ID} authorLines={authorLines} authorsPanel={<Suspense fallback={<Skeleton label="Loading the author view" lines={3} />}><AuthorsSection record={record} findings={findings} /></Suspense>} authorsOpen={history[index]?.at !== undefined} />
    </>
  );
}
