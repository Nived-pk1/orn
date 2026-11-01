/**
 * One entry of an explorer list (7.4 A6): the name (a link) and an optional formula on ONE line; a second line with chips and a short count
 * line; then smaller notes. The Reagents, Named reactions and Mechanisms lists all use it, so they look and measure alike. Text is always a
 * React child (never markup). No chemistry here.
 */
import type { ReactNode } from 'react';
import styles from './list-entry.module.css';

export interface ListEntryProps {
  /** Becomes the `data-entry-id` attribute (specs and tests find an entry by it). */
  readonly id: string;
  readonly name: string;
  readonly onOpen: () => void;
  /** Drawn right of the name, on the same line. */
  readonly formula?: ReactNode;
  readonly chips?: readonly string[];
  readonly chipsLabel?: string;
  /** "3 reactions · 2 profiles" */
  readonly meta?: string;
  /** Smaller lines under the second line. */
  readonly notes?: readonly string[];
  /** Extra attributes for callers that already have a data attribute (e.g. `data-reagent-id`). */
  readonly dataAttr?: Readonly<Record<string, string>>;
}

export function ListEntry(props: ListEntryProps) {
  const chips = props.chips ?? [];
  const second = chips.length > 0 || props.meta !== undefined;
  return (
    <li className={styles.entry} data-entry-id={props.id} {...props.dataAttr}>
      <div className={styles.head}>
        <button type="button" className={styles.name} onClick={props.onOpen}>
          {props.name}
        </button>
        {props.formula === undefined ? null : <span className={styles.formula}>{props.formula}</span>}
      </div>
      {second ? (
        <div className={styles.line}>
          {chips.length === 0 ? null : (
            <ul className={styles.chips} aria-label={props.chipsLabel ?? `Tags of ${props.name}`}>
              {chips.map((chip) => (
                <li key={chip} className={styles.chip}>
                  {chip}
                </li>
              ))}
            </ul>
          )}
          {props.meta === undefined ? null : <span>{props.meta}</span>}
        </div>
      ) : null}
      {(props.notes ?? []).map((note) => (
        <p key={note} className={styles.note}>
          {note}
        </p>
      ))}
    </li>
  );
}

export function ListEntries(props: { readonly label: string; readonly children: ReactNode }) {
  return (
    <ul className={styles.grid} aria-label={props.label}>
      {props.children}
    </ul>
  );
}
