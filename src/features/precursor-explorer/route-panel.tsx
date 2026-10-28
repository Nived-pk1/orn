/**
 * "Find a route" (step 7.2a D3): Start from (optional, several), Up to <n> steps, the two toggles, Search, and while it runs "Searching for
 * routes..." with Cancel. Nothing searches on a keystroke: only the Search button asks the engine.
 */
import { useStore } from 'zustand';
import { MIN_PRECURSOR_STEPS, DEFAULT_PRECURSOR_STEPS, type PrecursorsStore } from '@/ui/state';
import type { PrecursorPorts } from './contracts';
import { SubstanceSearch } from './substance-search';
import styles from './precursors-view.module.css';

const STEP_OPTIONS = Array.from({ length: DEFAULT_PRECURSOR_STEPS - MIN_PRECURSOR_STEPS + 1 }, (_, i) => MIN_PRECURSOR_STEPS + i);

export function RoutePanel(props: {
  readonly ports: Pick<PrecursorPorts, 'searchSubstances' | 'timers'>;
  readonly store: PrecursorsStore;
  readonly nameOf: (kind: string, id: string) => string;
  /** The exam version's name when an exam scope is chosen ("JEE Main 2026"), else absent: no such toggle. */
  readonly versionName: string | undefined;
  readonly running: boolean;
  readonly onSearch: () => void;
  readonly onCancel: () => void;
}) {
  const { store } = props;
  const startFrom = useStore(store, (s) => s.startFrom);
  const maxSteps = useStore(store, (s) => s.maxSteps);
  const onlyListed = useStore(store, (s) => s.onlyListed);
  const onlyInScope = useStore(store, (s) => s.onlyInScope);
  const chosen = new Set(startFrom.map((one) => one.id));
  return (
    <section className={styles.section} aria-labelledby="route-heading">
      <h3 id="route-heading" className={styles.sectionTitle}>
        Find a route
      </h3>
      <SubstanceSearch label="Start from (optional)" hitName={(title) => `Start from ${title}`} ports={props.ports} skip={chosen} onPick={(ref) => ref.kind !== 'reaction' && (ref.kind === 'species' || ref.kind === 'class') && store.getState().addStart({ kind: ref.kind, id: ref.id })} />
      {startFrom.length === 0 ? null : (
        <ul className={styles.chips} aria-label="Starting materials">
          {startFrom.map((one) => {
            const name = props.nameOf(one.kind, one.id);
            return (
              <li key={one.id} className={styles.chip}>
                <span>{name}</span>
                <button type="button" aria-label={`Remove ${name}`} onClick={() => store.getState().removeStart(one.id)}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className={styles.options}>
        <label className={styles.field}>
          <span>Up to</span>
          <select value={String(maxSteps)} onChange={(event) => store.getState().setMaxSteps(Number(event.target.value))}>
            {STEP_OPTIONS.map((n) => (
              <option key={n} value={String(n)}>
                {n === 1 ? '1 step' : `${n} steps`}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.option}>
          <input type="checkbox" checked={onlyListed} disabled={startFrom.length === 0} onChange={(event) => store.getState().setOnlyListed(event.target.checked)} />
          <span>Only the listed starting materials</span>
        </label>
        {props.versionName === undefined ? null : (
          <label className={styles.option}>
            <input type="checkbox" checked={onlyInScope} onChange={(event) => store.getState().setOnlyInScope(event.target.checked)} />
            <span>{`Only ${props.versionName} reactions`}</span>
          </label>
        )}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={props.running} onClick={props.onSearch}>
          Search
        </button>
        {props.running ? (
          <>
            <span role="status" className={styles.muted}>
              Searching for routes...
            </span>
            <button type="button" onClick={props.onCancel}>
              Cancel
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
