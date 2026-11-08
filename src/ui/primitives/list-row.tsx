/**
 * The list row (step 8.4d, Part D; design reference "List row"): a dot or an icon, a label, a sub-line, a count and a chevron. Dense lists (the
 * inspector's go-next lists, facts) use it instead of cards. A row with `onOpen` is ONE button; without it, plain text in a list item. Text is
 * always a React child (never markup). The family dot is only a hint: the label always carries the meaning. No chemistry here.
 */
import { useId, type ReactNode } from 'react';
import { Count } from './count';
import { Icon, type IconName } from './icons';
import styles from './list-row.module.css';

export type RowDot = 'hc' | 'hal' | 'oxy' | 'nit';

export interface ListRowProps {
  readonly label: string;
  readonly sub?: string;
  readonly count?: number;
  readonly icon?: IconName;
  readonly dot?: RowDot;
  /** Absent: a plain row (no button, no chevron). */
  readonly onOpen?: () => void;
  /** Why the row cannot be used now: it stays focusable, does nothing and says why. */
  readonly unavailable?: string;
  /** Attributes a caller's tests and specs find the row by (for example `data-record-id`); written on the row's button, or its item when it has none. */
  readonly dataAttr?: Readonly<Record<string, string>>;
  /** Extra text after the label, on the same line (a chip, a mark). */
  readonly trailing?: ReactNode;
}

function Body(props: ListRowProps) {
  return (
    <>
      {props.dot === undefined ? null : <span className={styles.dot} data-dot={props.dot} aria-hidden="true" />}
      {props.icon === undefined ? null : <Icon name={props.icon} />}
      <span className={styles.grow}>
        <span className={styles.label}>{props.label}</span>
        {props.sub === undefined ? null : <span className={styles.sub}>{props.sub}</span>}
      </span>
      {props.trailing}
      {props.count === undefined ? null : <Count value={props.count} />}
    </>
  );
}

export function ListRow(props: ListRowProps) {
  const reasonId = useId();
  const { onOpen, unavailable } = props;
  if (onOpen === undefined) {
    return (
      <li className={styles.row} {...props.dataAttr}>
        <div className={styles.inner}>
          <Body {...props} />
        </div>
      </li>
    );
  }
  const blocked = unavailable !== undefined;
  return (
    <li className={styles.row}>
      <button type="button" className={`${styles.inner} ${styles.action}`} {...props.dataAttr} aria-disabled={blocked ? true : undefined} aria-describedby={blocked ? reasonId : undefined} onClick={blocked ? undefined : onOpen}>
        <Body {...props} />
        <span className={styles.chevron} data-chevron="" aria-hidden="true">
          <Icon name="chevron-right" />
        </span>
      </button>
      {blocked ? (
        <span id={reasonId} className={styles.why}>
          {unavailable}
        </span>
      ) : null}
    </li>
  );
}

/** The list the rows sit in: a rounded, hairline-bordered surface. */
export function ListRows(props: { readonly label: string; readonly children: ReactNode }) {
  return (
    <ul className={styles.rows} aria-label={props.label}>
      {props.children}
    </ul>
  );
}
