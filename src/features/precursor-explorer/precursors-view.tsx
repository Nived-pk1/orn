/**
 * The Precursors view (step 7.2a D1-D8, ADR-042 style): "Make a compound". A target (the Study-safe search), what makes it directly, a
 * route search with its panel, saved routes above the results, and the results in words. The choices are UI state (the QUERY is saved, the
 * result never; a saved search is made again when the view opens). Nothing here knows chemistry: route search, the card and the words are
 * the core's. Read-only: nothing edits a record, and a found route is not saved here.
 */
import { useLayoutMode } from '@/ui/hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { createDescriber, createScopeOf, directPrecursors, noRouteWords, routeCountWords, truncationWords, type ProjectionContext, type RouteSearchResult } from '@/core/graph';
import type { RecordRef } from '@/core/schema';
import { LiveRegion } from '@/ui/primitives';
import { asChoice } from '@/ui/state';
import type { PrecursorPorts } from './contracts';
import { DirectBlock } from './direct-block';
import { outsideReactionIds, pruneChoices, queryOf, routeViewOf, savedMatchOf, savedRoutesFor, type RouteView } from './model';
import { RouteCard } from './route-card';
import { RoutePanel } from './route-panel';
import { SubstanceSearch } from './substance-search';
import styles from './precursors-view.module.css';

const PRUNED_WORDS = 'A compound you chose earlier is no longer in the data; it was removed from your choices.';
const STOPPED = 'The search was stopped.';
const unscoped = (): 'unmapped' => 'unmapped';

type Outcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'running' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'done'; readonly result: RouteSearchResult; readonly targetName: string; readonly maxSteps: number };

const reactions = (n: number): string => (n === 1 ? '1 reaction' : `${n} reactions`);

export function PrecursorsView(props: { readonly ports: PrecursorPorts }) {
  const { ports } = props;
  const phone = useLayoutMode() === 'phone';
  const store = ports.ui.precursors;
  const target = useStore(store, (s) => s.target);
  const startFrom = useStore(store, (s) => s.startFrom);
  const searched = useStore(store, (s) => s.searched);
  const view = useStore(ports.ui.explorer, (s) => s.view);
  const active = useStore(ports.ui.exam, (s) => s.active);
  const selected = useStore(ports.ui.family, (s) => s.reaction);
  const [version, setVersion] = useState(0);
  const [pruned, setPruned] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'none' });
  const controller = useRef<AbortController | null>(null);
  const serial = useRef(0);
  useEffect(() => ports.store.subscribe(() => setVersion((v) => v + 1)), [ports]);

  // `version` makes a new snapshot when the data moved (the store and the indexes are read, not props)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => ({ state: ports.store.getState(), indexes: ports.indexes.current() }), [ports, version]);
  const { state, indexes } = source;
  const scopeOf = useMemo(() => (active === null ? undefined : createScopeOf(indexes, active.examId, active.examVersionId)), [indexes, active]);
  const ctx = useMemo<ProjectionContext>(() => ({ state, indexes, scopeOf: scopeOf ?? unscoped }), [state, indexes, scopeOf]);
  const describer = useMemo(() => createDescriber(state), [state]);
  const nameOf = useCallback((kind: string, id: string): string => describer.describe({ kind, id } as RecordRef)?.name ?? id, [describer]);

  // saved choices that name a record that is gone: dropped, and said once
  useEffect(() => {
    const result = pruneChoices({ target, startFrom }, state);
    if (!result.dropped) return;
    store.getState().replace({ target: result.choices.target, startFrom: result.choices.startFrom, ...(result.choices.target === null ? { searched: false } : {}) });
    setPruned(true);
    ports.log('precursors_choices_pruned', 'a saved Precursors choice named a record that no longer exists; it was removed');
  }, [target, startFrom, state, store, ports]);

  const examName = active === null ? undefined : (state.records.exam[active.examId]?.name ?? active.examId);
  const versionName = active === null ? undefined : (state.records.exam_version[active.examVersionId]?.label ?? active.examVersionId);
  const targetName = target === null ? '' : nameOf(target.kind, target.id);

  const stop = useCallback((): void => {
    controller.current?.abort();
    controller.current = null;
    serial.current += 1;
  }, []);
  const search = useCallback((): void => {
    const now = store.getState();
    if (now.target === null) return;
    stop();
    const mine = serial.current;
    const abort = new AbortController();
    controller.current = abort;
    const outside = outsideReactionIds(state, scopeOf);
    const query = queryOf({ ...now, target: now.target }, outside);
    const name = nameOf(now.target.kind, now.target.id);
    setOutcome({ kind: 'running' });
    store.getState().setSearched(true);
    void ports.findRoutes(query, abort.signal).then((answer) => {
      if (mine !== serial.current) return;
      controller.current = null;
      if (answer.ok) setOutcome({ kind: 'done', result: answer.result, targetName: name, maxSteps: now.maxSteps });
      else setOutcome({ kind: 'failed', message: answer.cancelled === true ? STOPPED : answer.message });
    });
  }, [ports, state, scopeOf, store, stop, nameOf]);
  const cancel = useCallback((): void => {
    stop();
    setOutcome({ kind: 'failed', message: STOPPED });
  }, [stop]);

  // a new target (or none) starts clean; a search saved as made is made again once, from its query
  const targetKey = target === null ? '' : `${target.kind}:${target.id}`;
  const firstRun = useRef(true);
  useEffect(() => {
    const first = firstRun.current;
    firstRun.current = false;
    if (first && searched && target !== null) {
      search();
      return;
    }
    stop();
    setOutcome({ kind: 'none' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change of target restarts; the choices are read when Search is pressed
  }, [targetKey]);
  useEffect(() => stop, [stop]);

  const direct = useMemo(() => (target === null ? null : directPrecursors(ctx, target, ctx.scopeOf)), [ctx, target]);
  const saved = useMemo(() => (target === null ? [] : savedRoutesFor(target, ctx)), [ctx, target]);

  const foundExtras = (route: RouteView): { savedAs?: { name: string; open: () => void }; onSave?: () => void } => {
    const match = savedMatchOf(route, saved);
    if (match !== undefined && ports.openRoute !== undefined) return { savedAs: { name: match.name ?? match.key, open: () => ports.openRoute?.(match.key) } };
    const steps = route.found;
    if (ports.saveAsRoute !== undefined && target !== null && steps !== undefined) return { onSave: () => ports.saveAsRoute?.({ steps, target }) };
    return {};
  };
  const found = outcome.kind === 'done' ? outcome.result.routes.map((route) => routeViewOf(route, ctx)) : [];
  const resultLine =
    outcome.kind === 'done' ? (outcome.result.routes.length === 0 ? noRouteWords(outcome.targetName, outcome.maxSteps) : routeCountWords(outcome.result.routes.length)) : outcome.kind === 'failed' ? outcome.message : '';
  const line = resultLine !== '' ? resultLine : direct === null ? '' : `${reactions(direct.reactionCount)} ${direct.reactionCount === 1 ? 'makes' : 'make'} ${targetName} directly`;
  const [said, setSaid] = useState({ message: line, serial: 0 });
  useEffect(() => setSaid((was) => (was.message === line ? was : { message: line, serial: was.serial + 1 })), [line]);

  return (
    <section className={styles.view} aria-label="Precursors" data-layout={phone ? 'phone' : 'desktop'}>
      <header className={styles.header}>
        <h2 className={styles.title}>Make a compound</h2>
      </header>
      {pruned ? (
        <p className={styles.notice} role="status">
          {PRUNED_WORDS}
        </p>
      ) : null}
      {target === null ? (
        <p className={styles.muted}>Choose the compound you want to make.</p>
      ) : (
        <p className={styles.target}>
          <span>{`Making: ${targetName}`}</span>
          <button type="button" onClick={() => store.getState().setTarget(null)}>
            Change
          </button>
        </p>
      )}
      {target !== null ? null : (
        <SubstanceSearch
          label="Compound to make"
          hitName={(title) => `Choose ${title}`}
          ports={ports}
          onPick={(ref) => {
            const choice = asChoice(ref);
            if (choice !== undefined) store.getState().setTarget(choice);
          }}
        />
      )}
      {target === null || direct === null ? null : (
        <>
          <DirectBlock ports={ports} ctx={ctx} direct={direct} targetName={targetName} view={view} selected={selected} outsideNote={examName === undefined ? undefined : `outside ${examName}`} />
          <RoutePanel ports={ports} store={store} nameOf={nameOf} versionName={versionName} running={outcome.kind === 'running'} onSearch={search} onCancel={cancel} />
          {saved.length === 0 ? null : (
            <section className={styles.section} aria-label="Saved routes">
              <h3 className={styles.sectionTitle}>Saved routes</h3>
              <ul className={styles.routes} aria-label="Saved routes list">
                {saved.map((route) => (
                  <RouteCard key={route.key} route={route} ports={ports} selected={selected} />
                ))}
              </ul>
            </section>
          )}
          {outcome.kind === 'none' || outcome.kind === 'running' ? null : (
            <section className={styles.section} aria-label="Routes found">
              <p className={styles.resultLine}>{resultLine}</p>
              {outcome.kind === 'done' && outcome.result.truncation !== null ? <p className={styles.muted}>{truncationWords(outcome.result.truncation, outcome.maxSteps)}</p> : null}
              {found.length === 0 ? null : (
                <ul className={styles.routes} aria-label="Routes">
                  {found.map((route) => (
                    <RouteCard key={route.key} route={route} ports={ports} selected={selected} {...foundExtras(route)} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
      <LiveRegion message={said.message} serial={said.serial} />
    </section>
  );
}
