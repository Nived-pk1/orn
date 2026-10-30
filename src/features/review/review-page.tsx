/**
 * The Review page of Studio (ADR-040 addendum, step 6.8b, R1): every record whose review status is not "verified", one compact row each,
 * with filters (kind, status, has errors, has warnings, origin, tag), checkboxes (Shift-click for a range, "Select all shown") and the
 * per-row and BULK actions "Mark verified" and "Needs review". Long lists are virtual. The rows, the order and the changes come from the
 * core (`core/editing/review-queue.ts`); this file shows them. The app never verifies anything by itself.
 */
import { useEffect, useId, useMemo, useReducer, useRef, useState, type ChangeEvent } from 'react';
import { chapterIndexOf, facetCountsOf, groupQueueRows, queueRows, rowsMatching, type GroupBy, type QueueFilters, type QueueRow, type ReviewGroup } from '@/core/editing';
import type { RecordRef } from '@/core/schema';
import { useLayoutMode } from '@/ui/hooks';
import { Button, SegmentedControl, VirtualList } from '@/ui/primitives';
import type { ReviewPort } from './contracts';
import { ReviewRow } from './review-row';
import { useBulkReview } from './use-bulk-review';
import styles from './review.module.css';

const keyOf = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;
const ROW_ESTIMATE = 84;
const HEAD_ESTIMATE = 44;

/** The list is the groups flattened: a heading, then its rows. A record in two groups is two items, so the key says which. */
type Item = { readonly kind: 'head'; readonly key: string; readonly group: ReviewGroup } | { readonly kind: 'row'; readonly key: string; readonly row: QueueRow };
const itemsOf = (groups: readonly ReviewGroup[]): Item[] => groups.flatMap((group) => [{ kind: 'head', key: `head:${group.key}`, group } as Item, ...group.rows.map((row): Item => ({ kind: 'row', key: `${group.key}|${keyOf(row.ref)}`, row }))]);

function Select(props: { readonly label: string; readonly value: string; readonly options: readonly (readonly [string, string])[]; readonly onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className={styles.filter}>
      <label htmlFor={id}>{props.label}</label>
      <select id={id} value={props.value} onChange={(event: ChangeEvent<HTMLSelectElement>) => props.onChange(event.target.value)}>
        <option value="">All</option>
        {props.options.map(([value, words]) => (
          <option key={value} value={value}>
            {words}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ReviewPage(props: { readonly port: ReviewPort }) {
  const { port } = props;
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => port.subscribe(bump), [port]);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [origin, setOrigin] = useState('');
  const [tag, setTag] = useState('');
  const [chapter, setChapter] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>(port.grouping?.initial ?? 'kind');
  const phone = useLayoutMode() === 'phone';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | undefined>(undefined);

  // the filters the queue itself knows; kind, status and chapter are applied after, so each option can show its count (7.3a E2)
  const filters: QueueFilters = {
    ...(errorsOnly ? { hasErrors: true } : {}),
    ...(warningsOnly ? { hasWarnings: true } : {}),
    ...(origin === '' ? {} : { origin: origin as QueueRow['origin'] }),
    ...(tag === '' ? {} : { tag }),
  };
  const state = port.state();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the tick (`bump`) is the dependency: the port's state and findings are read live
  const everything = useMemo(() => queueRows(state, port.findingsOf, {}), [state, port, bump]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the filters are the values above
  const base = useMemo(() => queueRows(state, port.findingsOf, filters), [state, port, bump, errorsOnly, warningsOnly, origin, tag]);
  const chaptersOf = useMemo(() => chapterIndexOf(state), [state]);
  const chosenFacets = useMemo(() => ({ ...(kind === '' ? {} : { kind }), ...(status === '' ? {} : { status }), ...(chapter === '' ? {} : { chapter }) }), [kind, status, chapter]);
  const shown = useMemo(() => rowsMatching(base, chaptersOf, chosenFacets), [base, chaptersOf, chosenFacets]);
  const facets = useMemo(() => facetCountsOf(base, chaptersOf, chosenFacets), [base, chaptersOf, chosenFacets]);
  const withCount = (map: ReadonlyMap<string, { readonly title: string; readonly count: number }>, chosen: string): (readonly [string, string])[] => {
    const options = [...map.entries()].map(([value, one]) => [value, `${one.title} (${one.count})`] as const);
    return chosen === '' || map.has(chosen) ? options : [...options, [chosen, `${chosen} (0)`] as const];
  };
  // a chosen chapter shows its own group only (a record in two chapters would otherwise repeat under the other one)
  const groups = useMemo(() => groupQueueRows(shown, groupBy, chaptersOf).filter((group) => chapter === '' || groupBy !== 'chapter' || group.key === `chapter:${chapter}`), [shown, groupBy, chaptersOf, chapter]);
  // the rows in the order they are listed, each once: a range (Shift-click) follows what the person sees
  const listed = useMemo(() => [...new Map(groups.flatMap((group) => group.rows).map((row) => [keyOf(row.ref), row])).values()], [groups]);
  const items = useMemo(() => itemsOf(groups), [groups]);
  const setCount = [kind, status, chapter, origin, tag].filter((one) => one !== '').length + (errorsOnly ? 1 : 0) + (warningsOnly ? 1 : 0);
  const clearAll = (): void => {
    setKind('');
    setStatus('');
    setChapter('');
    setOrigin('');
    setTag('');
    setErrorsOnly(false);
    setWarningsOnly(false);
  };
  const chooseGroupBy = (value: GroupBy): void => {
    setGroupBy(value);
    port.grouping?.save(value);
  };
  const origins = useMemo(() => [...new Set(everything.map((row) => row.origin))].sort().map((one) => [one, one.replace(/_/g, ' ')] as const), [everything]);
  const tags = useMemo(() => [...new Set(everything.flatMap((row) => row.tags))].sort().map((one) => [one, one] as const), [everything]);

  // a verified record leaves the queue: it also leaves the choice
  const live = useMemo(() => new Set(shown.map((row) => keyOf(row.ref))), [shown]);
  const selected = shown.filter((row) => chosen.has(keyOf(row.ref)));
  const bulk = useBulkReview(port);

  const toggle = (row: QueueRow, on: boolean, range: boolean): void => {
    const next = new Set([...chosen].filter((one) => live.has(one)));
    const from = range && anchor.current !== undefined ? listed.findIndex((one) => keyOf(one.ref) === anchor.current) : -1;
    const to = listed.findIndex((one) => keyOf(one.ref) === keyOf(row.ref));
    if (from >= 0 && to >= 0) for (const one of listed.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(keyOf(one.ref));
    else if (on) next.add(keyOf(row.ref));
    else next.delete(keyOf(row.ref));
    anchor.current = keyOf(row.ref);
    setChosen(next);
  };
  const refsOf = (rows: readonly QueueRow[]): RecordRef[] => rows.map((row) => row.ref);

  return (
    <section aria-label="Review" className={styles.page}>
      <h2>Review</h2>
      <p>Records that are not verified yet. Nothing is verified by itself: you mark each one, and one Undo takes a whole step back.</p>
      <SegmentedControl<GroupBy> label="Group by" options={[{ value: 'chapter', label: 'Chapter' }, { value: 'kind', label: 'Kind' }]} value={groupBy} onChange={chooseGroupBy} />
      {phone ? (
        <Button aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>{`Filters (${setCount})`}</Button>
      ) : null}
      <div className={styles.filters} role="group" aria-label="Filters" hidden={phone && !filtersOpen} data-phone={phone ? '' : undefined}>
        <Select label="Chapter" value={chapter} options={withCount(facets.chapters, chapter)} onChange={setChapter} />
        <Select label="Kind" value={kind} options={withCount(facets.kinds, kind)} onChange={setKind} />
        <Select label="Status" value={status} options={withCount(facets.statuses, status)} onChange={setStatus} />
        <Select label="Origin" value={origin} options={origins} onChange={setOrigin} />
        <Select label="Tag" value={tag} options={tags} onChange={setTag} />
        <label className={styles.check}>
          <input type="checkbox" checked={errorsOnly} onChange={(event) => setErrorsOnly(event.target.checked)} /> Has errors
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={warningsOnly} onChange={(event) => setWarningsOnly(event.target.checked)} /> Has warnings
        </label>
        {setCount === 0 ? null : <Button onClick={clearAll}>Clear all filters</Button>}
      </div>
      <div className={styles.bulk}>
        <span role="status">{shown.length === everything.length ? `${shown.length} ${shown.length === 1 ? 'record' : 'records'} to review` : `${shown.length} of ${everything.length} records shown`}</span>
        <Button onClick={() => setChosen(new Set(shown.map((row) => keyOf(row.ref))))}>Select all shown</Button>
        <Button aria-label="Clear selection" onClick={() => setChosen(new Set())}>
          Clear
        </Button>
        <span>{`${selected.length} selected`}</span>
        <Button variant="primary" {...(selected.length === 0 ? { unavailable: 'Select records first' } : port.unavailable !== undefined ? { unavailable: port.unavailable } : { onClick: () => bulk.markVerified(refsOf(selected)) })}>
          {`Mark verified (${selected.length})`}
        </Button>
        <Button {...(selected.length === 0 ? { unavailable: 'Select records first' } : port.unavailable !== undefined ? { unavailable: port.unavailable } : { onClick: () => bulk.needsReview(refsOf(selected)) })}>
          {`Needs review (${selected.length})`}
        </Button>
      </div>
      {shown.length === 0 ? (
        <p>{everything.length === 0 ? 'Nothing needs review.' : 'No record matches these filters.'}</p>
      ) : (
        <VirtualList
          label="Records to review"
          items={items}
          itemKey={(item) => item.key}
          estimateSize={(item) => (item.kind === 'head' ? HEAD_ESTIMATE : ROW_ESTIMATE)}
          focusable
          renderItem={(item) =>
            item.kind === 'head' ? (
              <h3 className={styles.groupHead}>{`${item.group.title} (${item.group.rows.length})`}</h3>
            ) : (
              <ReviewRow
                row={item.row}
                checked={chosen.has(keyOf(item.row.ref))}
                unavailable={port.unavailable}
                editReason={port.editReason(item.row.ref)}
                onCheck={(on, range) => toggle(item.row, on, range)}
                onOpen={() => port.open(item.row.ref)}
                onEdit={() => port.edit(item.row.ref)}
                onVerify={() => bulk.markVerified([item.row.ref])}
                onNeeds={() => bulk.needsReview([item.row.ref])}
              />
            )
          }
        />
      )}
      {bulk.dialogs}
    </section>
  );
}
