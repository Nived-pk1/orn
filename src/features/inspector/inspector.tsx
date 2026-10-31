/**
 * The inspector (step 5.6a; UI_ARCHITECTURE §9, §10): the record in focus with its name, kind, finding badges, the places it has in the
 * current view, Back and Forward through the focus history, one status line (a note from the canvas, or why a record has no place in
 * the view) and the levels. It reads the canonical state and never changes it. Every part is a function of one snapshot, taken again
 * when the store, the findings or the L4 checks change.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import type { RecordRef } from '@/core/schema';
import { useLayoutMode } from '@/ui/hooks';
import { Button } from '@/ui/primitives';
import { SHEET_TITLE_ID } from '@/ui/shell';
import { canBack, canForward, currentOf } from '@/ui/state';
import type { InspectorHost, InspectorPorts } from './contracts';
import { InspectorEnvContext, makeEnv, useInspectorEnv, type InspectorEnv } from './env';
import { kindWord, nameOfRecord, recordOf } from './model/describe';
import { l4Words, severityBadges } from './model/findings';
import { placeOf } from './model/places';
import { ArrowReactions } from './arrow-reactions';

/** The records whose reactions the Reactions view can list (the same set the palette's Alt+Enter uses). */
const SHOW_REACTIONS_KINDS: readonly string[] = ['species', 'class', 'reagent', 'named_reaction'];
/** A route ends at a species or a class. */
const PRECURSOR_KINDS: readonly string[] = ['species', 'class'];
import { ProvenanceLevel } from './provenance';
import { InChapters } from './in-chapters';
import { LevelSection } from './levels';
import { useBridge } from './use-bridge';
import { KindLevels } from './views';
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
  const note = useBridge(ports, host);
  const inspector = ports.ui.inspector;
  const history = useStore(inspector, (s) => s.history);
  const index = useStore(inspector, (s) => s.index);
  const current = currentOf({ history, index });
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
  if (current === null) {
    return (
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
  }
  const record = recordOf(state, current);
  return (
    <InspectorEnvContext.Provider value={env}>
      <article className={styles.root} aria-label="Record" data-record-id={current.id}>
        <div className={styles.nav} role="group" aria-label="History" data-sheet-full="">
          <button type="button" disabled={!canBack({ index })} onClick={() => inspector.getState().back()} aria-keyshortcuts="Alt+ArrowLeft">
            Back
          </button>
          <button type="button" disabled={!canForward({ history, index })} onClick={() => inspector.getState().forward()} aria-keyshortcuts="Alt+ArrowRight">
            Forward
          </button>
        </div>
        {record === undefined ? (
          <p role="status" className={styles.missing}>
            Missing record {current.id}: it is not in this dataset (it may have been removed or replaced).
          </p>
        ) : (
          <RecordBody key={`${current.kind}:${current.id}`} refOf={current} note={note} />
        )}
      </article>
    </InspectorEnvContext.Provider>
  );
}

function RecordBody(props: { readonly refOf: RecordRef; readonly note: string | undefined }) {
  const { ports, host, state } = useInspectorEnv();
  const phone = useLayoutMode() === 'phone';
  const record = recordOf(state, props.refOf);
  if (record === undefined) return null;
  const name = nameOfRecord(record);
  const findings = ports.findings.bySubject(props.refOf);
  const badges = severityBadges(findings);
  const l4 = l4Words(ports.l4.statusOf(props.refOf));
  const place = placeOf(props.refOf, name, ports.indexes.current(), ports.ui, host.navigatorShown);
  const status = props.note ?? (host.explorerShown === true ? undefined : place.line);
  return (
    <>
      <header className={styles.header}>
        <h3 className={styles.title} id={SHEET_TITLE_ID}>{name}</h3>
        <span className={styles.kind}>{kindWord(props.refOf.kind)}</span>
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
        {host.editNames === undefined || !(host.editNames.namesKinds?.includes(record.kind) === true || host.editNames.fullEditorKinds?.includes(record.kind) === true) ? null : (
          // on a phone the button shows in the FULL sheet, not in the peek (authoring is desktop-first, ADR-039 addendum)
          <div className={styles.actions} data-sheet-full="">
            <Button {...(host.editNames.unavailable === undefined ? { onClick: () => host.editNames?.open(props.refOf) } : { unavailable: host.editNames.unavailable })}>{host.editNames.fullEditorKinds?.includes(record.kind) === true ? 'Edit' : 'Edit names'}</Button>
            {host.editNames.remove === undefined ? null : <Button {...(host.editNames.unavailable === undefined ? { onClick: () => host.editNames?.remove?.(props.refOf) } : { unavailable: host.editNames.unavailable })}>Delete...</Button>}
            {record.kind !== 'reaction' || host.editNames.startFrom === undefined ? null : (
              <>
                <Button {...(host.editNames.unavailable === undefined ? { onClick: () => host.editNames?.startFrom?.('duplicate', props.refOf) } : { unavailable: host.editNames.unavailable })}>Duplicate</Button>
                {record.scope !== 'generic' ? null : <Button {...(host.editNames.unavailable === undefined ? { onClick: () => host.editNames?.startFrom?.('specific', props.refOf) } : { unavailable: host.editNames.unavailable })}>New specific reaction from this one</Button>}
              </>
            )}
          </div>
        )}
        {host.showReactions === undefined || !SHOW_REACTIONS_KINDS.includes(props.refOf.kind) ? null : (
          <div className={styles.actions} data-sheet-full="">
            <button type="button" onClick={() => { host.showReactions?.(props.refOf); if (phone) host.closePane?.(); }}>
              Show its reactions
            </button>
          </div>
        )}
        {host.showPrecursors === undefined || !PRECURSOR_KINDS.includes(props.refOf.kind) ? null : (
          <div className={styles.actions} data-sheet-full="">
            <button type="button" onClick={() => { host.showPrecursors?.(props.refOf); if (phone) host.closePane?.(); }}>
              How to make it
            </button>
          </div>
        )}
        {place.actions.length === 0 ? null : (
          <div className={styles.actions}>
            {place.actions.map((action) => (
              <button key={action.label} type="button" onClick={() => { action.run(); if (phone) host.closePane?.(); }}>
                {action.label}
              </button>
            ))}
          </div>
        )}
        {status === undefined ? null : (
          <p role="status" className={styles.status}>
            {status}
          </p>
        )}
        <InChapters refOf={props.refOf} />
        {props.note === undefined ? null : <ArrowReactions />}
      </header>
      <div data-sheet-full="">
        <KindLevels record={record} findings={findings} />
        <LevelSection level={5} title="Provenance, findings and raw record">
          <ProvenanceLevel record={record} findings={findings} />
        </LevelSection>
      </div>
    </>
  );
}
