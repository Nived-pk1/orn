/**
 * The Reactions view (step 7.1b D1-D6, ADR-042): a filterable list of EVERY reaction. The filter and its facets are the core's
 * (`filterReactions`, its input memoised per state); this file only draws and edits UI state: the header with the count line, the filter
 * bar (a popover of checkboxes per filter, a name box, "Only <exam version>"), the chips, the results (Cards or Compact, 30 at a time).
 * Filters, Cards/Compact and the last explorer are UI state (saved, never records). A polite live region says the count after each change;
 * the focus stays on the control used. No chemistry here.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { createReactionFilterMemo, createScopeOf, filterReactions, type ReactionFacets } from '@/core/graph';
import { LiveRegion, SegmentedControl } from '@/ui/primitives';
import { isFilterSet, type ExplorerFilter } from '@/ui/state';
import { PAGE_SIZE, type ExplorerPorts } from './contracts';
import { FilterPopover, OptionList, type FilterOption } from './filter-popover';
import { chipsOf, countLine, labelsOf, pruneFilter, toReactionFilter, type Labels } from './model';
import { Results } from './results';
import { SubstancePicker } from './substance-picker';
import styles from './reactions-view.module.css';

const PRUNED_WORDS = 'A filter named a record that no longer exists; it was removed.';
const fold = (text: string): string => text.toLowerCase();

const optionsOf = (facet: ReactionFacets[keyof ReactionFacets], label: (id: string) => string): FilterOption[] =>
  facet.map((option) => ({ id: option.id, label: label(option.id), count: option.count })).sort((a, b) => (fold(a.label) < fold(b.label) ? -1 : fold(a.label) > fold(b.label) ? 1 : a.id < b.id ? -1 : 1));

const toggled = (list: readonly string[], id: string): string[] => (list.includes(id) ? list.filter((one) => one !== id) : [...list, id]);

export function ReactionsView(props: { readonly ports: ExplorerPorts }) {
  const { ports } = props;
  const filter = useStore(ports.ui.explorer, (s) => s.filter);
  const view = useStore(ports.ui.explorer, (s) => s.view);
  const active = useStore(ports.ui.exam, (s) => s.active);
  const selected = useStore(ports.ui.family, (s) => s.reaction);
  const [version, setVersion] = useState(0);
  const [pruned, setPruned] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const memo = useRef(createReactionFilterMemo()).current;
  useEffect(() => ports.store.subscribe(() => setVersion((v) => v + 1)), [ports]);

  // `version` makes a new snapshot when the data moved (the store and the indexes are read, not props)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => ({ state: ports.store.getState(), indexes: ports.indexes.current() }), [ports, version]);
  const { state, indexes } = source;
  const labels = useMemo<Labels>(() => labelsOf(state, indexes), [state, indexes]);

  // a saved filter that names a record that is gone: dropped, and said once
  useEffect(() => {
    const result = pruneFilter(filter, state, indexes);
    if (!result.dropped) return;
    ports.ui.explorer.getState().replaceFilter(result.filter);
    setPruned(true);
    ports.log('explorer_filter_pruned', 'a saved Reactions filter named a record that no longer exists; it was removed');
  }, [filter, state, indexes, ports]);

  const scope = useMemo(() => (active === null ? undefined : createScopeOf(indexes, active.examId, active.examVersionId)), [indexes, active]);
  const result = useMemo(() => filterReactions(memo.inputFor(source), toReactionFilter(filter), scope), [memo, source, filter, scope]);
  const filterKey = JSON.stringify(filter);
  useEffect(() => setLimit(PAGE_SIZE), [filterKey]);

  const examName = active === null ? undefined : (state.records.exam[active.examId]?.name ?? active.examId);
  const versionName = active === null ? undefined : (state.records.exam_version[active.examVersionId]?.label ?? active.examVersionId);
  const filtered = isFilterSet(filter);
  const line = countLine({ shown: result.rows.length, total: result.total, filtered, hidden: filter.onlyInScope ? result.hiddenByScope : 0, hiddenBy: examName });
  const [said, setSaid] = useState({ message: line, serial: 0 });
  useEffect(() => setSaid((was) => (was.message === line ? was : { message: line, serial: was.serial + 1 })), [line]);

  const set = (patch: Partial<ExplorerFilter>): void => ports.ui.explorer.getState().setFilter(patch);
  const clear = (): void => ports.ui.explorer.getState().clearFilter();
  const chips = chipsOf(filter, labels);
  const facets = result.facets;
  const substanceCounts = useMemo(() => new Map(facets.substance.map((option) => [option.id, option.count])), [facets]);
  const sections: { readonly title: string; readonly chosen: number; readonly body: React.ReactNode }[] = [
    { title: 'Substance', chosen: filter.substanceIds.length, body: <SubstancePicker ports={ports} filter={filter} labels={labels} counts={substanceCounts} onChange={set} /> },
    { title: 'From family', chosen: filter.fromFamilyIds.length, body: <OptionList title="From family" options={optionsOf(facets.fromFamily, labels.family)} chosen={filter.fromFamilyIds} onToggle={(id) => set({ fromFamilyIds: toggled(filter.fromFamilyIds, id) })} /> },
    { title: 'To family', chosen: filter.toFamilyIds.length, body: <OptionList title="To family" options={optionsOf(facets.toFamily, labels.family)} chosen={filter.toFamilyIds} onToggle={(id) => set({ toFamilyIds: toggled(filter.toFamilyIds, id) })} /> },
    { title: 'Type', chosen: filter.typeIds.length, body: <OptionList title="Type" options={optionsOf(facets.type, labels.type)} chosen={filter.typeIds} onToggle={(id) => set({ typeIds: toggled(filter.typeIds, id) })} /> },
    { title: 'Named reaction', chosen: filter.namedReactionIds.length, body: <OptionList title="Named reaction" options={optionsOf(facets.namedReaction, labels.named)} chosen={filter.namedReactionIds} onToggle={(id) => set({ namedReactionIds: toggled(filter.namedReactionIds, id) })} /> },
    { title: 'Review status', chosen: filter.reviewStatuses.length, body: <OptionList title="Review status" options={optionsOf(facets.reviewStatus, labels.status)} chosen={filter.reviewStatuses} onToggle={(id) => set({ reviewStatuses: toggled(filter.reviewStatuses, id) })} /> },
  ];

  const none = result.total === 0;
  return (
    <section className={styles.view} aria-label="Reactions">
      <header className={styles.header}>
        <h2 className={styles.title}>Reactions</h2>
        <p className={styles.count}>{line}</p>
        <SegmentedControl label="Show as" options={[{ value: 'cards', label: 'Cards' }, { value: 'compact', label: 'Compact' }]} value={view} onChange={(next) => ports.ui.explorer.getState().setView(next)} />
        {filtered ? <button type="button" onClick={clear}>Clear all filters</button> : null}
      </header>
      {pruned ? <p className={styles.notice} role="status">{PRUNED_WORDS}</p> : null}
      {none ? null : (
        <div className={styles.bar} role="group" aria-label="Filters">
          {sections.map((section) => (
            <FilterPopover key={section.title} title={section.title} chosen={section.chosen}>
              {section.body}
            </FilterPopover>
          ))}
          <label className={styles.field}>
            <span>Find by name</span>
            <input type="search" value={filter.text} autoComplete="off" spellCheck={false} onChange={(event) => set({ text: event.target.value })} />
          </label>
          {versionName === undefined ? null : (
            <label className={styles.option}>
              <input type="checkbox" checked={filter.onlyInScope} onChange={(event) => set({ onlyInScope: event.target.checked })} />
              <span>{`Only ${versionName}`}</span>
            </label>
          )}
        </div>
      )}
      {chips.length === 0 ? null : (
        <ul className={styles.chips} aria-label="Chosen filters">
          {chips.map((chip) => (
            <li key={chip.key} className={styles.chip}>
              <span>{chip.label}</span>
              <button type="button" aria-label={chip.removeName} onClick={() => ports.ui.explorer.getState().replaceFilter(chip.without(filter))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {none ? (
        <p className={styles.empty}>No reactions yet.</p>
      ) : result.rows.length === 0 ? (
        <div className={styles.empty}>
          <p>No reaction matches these filters.</p>
          <button type="button" onClick={clear}>Clear all filters</button>
        </div>
      ) : (
        <Results
          ports={ports}
          state={state}
          indexes={indexes}
          rows={result.rows}
          total={result.total}
          view={view}
          limit={limit}
          labels={labels}
          selected={selected}
          outsideNote={examName === undefined ? undefined : `outside ${examName}`}
          onMore={() => setLimit((n) => n + PAGE_SIZE)}
        />
      )}
      <LiveRegion message={said.message} serial={said.serial} />
    </section>
  );
}
