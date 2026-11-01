/**
 * The list of the Named reactions and Mechanisms views (7.4 D, E): the header with the count line and "Clear all filters", the name box and
 * "Only <exam version>" (on a phone behind "Filters (n)"), the entries 30 at a time with the truncation notice, and the records with nothing
 * written apart at the end ("Not written yet: ..." in Studio only). The entries are `ListEntry` rows (drawn by the caller). Every state has words.
 */
import { useState, type ReactNode } from 'react';
import { plural } from '@/core/text';
import { Button, Dialog } from '@/ui/primitives';
import { ScopeBox } from './parts';
import styles from './study-page.module.css';

export const LIST_PAGE_SIZE = 30;

export interface ListShellProps {
  readonly title: string;
  readonly noun: readonly [string, string];
  /** The view's accessible name (the region) is the caller's; this is the list's label. */
  readonly listLabel: string;
  readonly total: number;
  readonly shown: number;
  readonly text: string;
  readonly onText: (text: string) => void;
  readonly versionName: string | undefined;
  readonly onlyInScope: boolean;
  readonly onScope: (on: boolean) => void;
  readonly onClear: () => void;
  readonly phone: boolean;
  /** Renders the entries `0 ... count`; the shell cuts the list 30 at a time. */
  readonly count: number;
  readonly renderEntries: (limit: number) => ReactNode;
  /** Studio only: the names of the records with nothing written. */
  readonly unwritten?: readonly string[];
}

export function ListShell(props: ListShellProps) {
  const [limit, setLimit] = useState(LIST_PAGE_SIZE);
  const [sheet, setSheet] = useState(false);
  const [one, many] = props.noun;
  const chosen = (props.text.trim() === '' ? 0 : 1) + (props.onlyInScope ? 1 : 0);
  const countLine = props.shown === props.total ? plural(props.total, one, many) : `${props.shown} of ${plural(props.total, one, many)}`;
  const controls = (
    <>
      <label className={styles.field}>
        <span>Find by name</span>
        <input type="search" value={props.text} autoComplete="off" spellCheck={false} onChange={(event) => props.onText(event.target.value)} />
      </label>
      <ScopeBox versionName={props.versionName} checked={props.onlyInScope} onChange={props.onScope} />
    </>
  );
  return (
    <>
      <header className={styles.header}>
        <h2 className={styles.title}>{props.title}</h2>
        <p className={styles.muted}>{countLine}</p>
        {chosen === 0 ? null : (
          <button type="button" onClick={props.onClear}>
            Clear all filters
          </button>
        )}
      </header>
      {props.total === 0 ? (
        <p className={styles.muted}>{`There are no ${many} in the data yet.`}</p>
      ) : (
        <>
          {props.phone ? (
            <button type="button" aria-haspopup="dialog" onClick={() => setSheet(true)}>{`Filters (${chosen})`}</button>
          ) : (
            <div className={styles.filters} role="group" aria-label="Filters">
              {controls}
            </div>
          )}
          {props.phone && sheet ? (
            <Dialog open onClose={() => setSheet(false)} title="Filters" size="screen" footer={<Button variant="primary" onClick={() => setSheet(false)}>{`Show ${plural(props.shown, one, many)}`}</Button>}>
              <div className={styles.sheet}>{controls}</div>
            </Dialog>
          ) : null}
          {props.shown === 0 && (props.unwritten ?? []).length === 0 ? <p className={styles.muted}>{`No ${one} matches these filters.`}</p> : null}
          {props.renderEntries(limit)}
          {props.count > limit ? (
            <div className={styles.more}>
              <p className={styles.muted} role="status">{`Showing ${limit} of ${plural(props.count, one, many)}`}</p>
              <button type="button" onClick={() => setLimit((n) => n + LIST_PAGE_SIZE)}>{`Show ${LIST_PAGE_SIZE} more`}</button>
            </div>
          ) : null}
          {props.unwritten === undefined || props.unwritten.length === 0 ? null : (
            <p className={styles.unwritten} data-unwritten="">{`Not written yet: ${props.unwritten.join(', ')}`}</p>
          )}
        </>
      )}
    </>
  );
}
