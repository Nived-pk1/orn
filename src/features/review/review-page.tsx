/**
 * The Review page of Studio (ADR-040 addendum, step 6.8b, R1): every record whose review status is not "verified", one compact row each,
 * with filters (kind, status, has errors, has warnings, origin, tag), checkboxes (Shift-click for a range, "Select all shown") and the
 * per-row and BULK actions "Mark verified" and "Needs review". Long lists are virtual. The rows, the order and the changes come from the
 * core (`core/editing/review-queue.ts`); this file shows them. The app never verifies anything by itself.
 */
import { useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent } from 'react';
import { queueRows, STATUS_WORDS, type QueueFilters, type QueueRow, type ReviewStatus } from '@/core/editing';
import type { RecordKind, RecordRef } from '@/core/schema';
import { Button, VirtualList } from '@/ui/primitives';
import type { ReviewPort } from './contracts';
import { ReviewRow } from './review-row';
import { useBulkReview } from './use-bulk-review';
import styles from './review.module.css';

const keyOf = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;
const ROW_ESTIMATE = 84;

function Select(props: { readonly label: string; readonly value: string; readonly options: readonly (readonly [string, string])[]; readonly onChange: (value: string) => void }) {
  return (
    <div className={styles.filter}>
      <label>
        {props.label}
        <select value={props.value} onChange={(event: ChangeEvent<HTMLSelectElement>) => props.onChange(event.target.value)}>
          <option value="">All</option>
          {props.options.map(([value, words]) => (
            <option key={value} value={value}>
              {words}
            </option>
          ))}
        </select>
      </label>
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
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const anchor = useRef<string | undefined>(undefined);

  const filters: QueueFilters = {
    ...(kind === '' ? {} : { kinds: [kind as RecordKind] }),
    ...(status === '' ? {} : { statuses: [status as ReviewStatus] }),
    ...(errorsOnly ? { hasErrors: true } : {}),
    ...(warningsOnly ? { hasWarnings: true } : {}),
    ...(origin === '' ? {} : { origin: origin as QueueRow['origin'] }),
    ...(tag === '' ? {} : { tag }),
  };
  const state = port.state();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the tick (`bump`) is the dependency: the port's state and findings are read live
  const everything = useMemo(() => queueRows(state, port.findingsOf, {}), [state, port, bump]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the filters are the six values above
  const shown = useMemo(() => queueRows(state, port.findingsOf, filters), [state, port, bump, kind, status, errorsOnly, warningsOnly, origin, tag]);
  const kinds = useMemo(() => [...new Map(everything.map((row) => [row.ref.kind, row.kindWords])).entries()].sort((a, b) => (a[1] < b[1] ? -1 : 1)), [everything]);
  const origins = useMemo(() => [...new Set(everything.map((row) => row.origin))].sort().map((one) => [one, one.replace(/_/g, ' ')] as const), [everything]);
  const tags = useMemo(() => [...new Set(everything.flatMap((row) => row.tags))].sort().map((one) => [one, one] as const), [everything]);

  // a verified record leaves the queue: it also leaves the choice
  const live = useMemo(() => new Set(shown.map((row) => keyOf(row.ref))), [shown]);
  const selected = shown.filter((row) => chosen.has(keyOf(row.ref)));
  const bulk = useBulkReview(port);

  const toggle = (row: QueueRow, on: boolean, range: boolean): void => {
    const next = new Set([...chosen].filter((one) => live.has(one)));
    const from = range && anchor.current !== undefined ? shown.findIndex((one) => keyOf(one.ref) === anchor.current) : -1;
    const to = shown.findIndex((one) => keyOf(one.ref) === keyOf(row.ref));
    if (from >= 0 && to >= 0) for (const one of shown.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(keyOf(one.ref));
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
      <div className={styles.filters} role="group" aria-label="Filters">
        <Select label="Kind" value={kind} options={kinds} onChange={setKind} />
        <Select label="Status" value={status} options={(['unreviewed', 'review_required'] as const).map((one) => [one, STATUS_WORDS[one]] as const)} onChange={setStatus} />
        <Select label="Origin" value={origin} options={origins} onChange={setOrigin} />
        <Select label="Tag" value={tag} options={tags} onChange={setTag} />
        <label className={styles.check}>
          <input type="checkbox" checked={errorsOnly} onChange={(event) => setErrorsOnly(event.target.checked)} /> Has errors
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={warningsOnly} onChange={(event) => setWarningsOnly(event.target.checked)} /> Has warnings
        </label>
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
          items={shown}
          itemKey={(row) => keyOf(row.ref)}
          estimateSize={() => ROW_ESTIMATE}
          focusable
          renderItem={(row) => (
            <ReviewRow
              row={row}
              checked={chosen.has(keyOf(row.ref))}
              unavailable={port.unavailable}
              editReason={port.editReason(row.ref)}
              onCheck={(on, range) => toggle(row, on, range)}
              onOpen={() => port.open(row.ref)}
              onEdit={() => port.edit(row.ref)}
              onVerify={() => bulk.markVerified([row.ref])}
              onNeeds={() => bulk.needsReview([row.ref])}
            />
          )}
        />
      )}
      {bulk.dialogs}
    </section>
  );
}
