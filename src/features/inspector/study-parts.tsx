/**
 * The small parts of the Study inspector (step 8.1 Part C): the lead with "Read more", the fact chips, the watch-out callouts, the
 * go-next buttons and the connected cards. Each draws a value the model made; the only state is "is it expanded".
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLayoutMode } from '@/ui/hooks';
import { Button, Menu } from '@/ui/primitives';
import { useInspectorEnv } from './env';
import type { CardGroup, Chip, WatchOut } from './model/study-model';
import { RichText } from './rich-text';
import styles from './study-inspector.module.css';

/** Text longer than this (or with a blank line) is clamped to four lines with "Read more". */
export const LEAD_CLAMP_CHARS = 220;
const MAX_CHIPS = 6;
const MAX_WATCH = 2;
export const MAX_GO_NEXT = 3;
const CARDS_SHOWN = 4;

export function Disclosure(props: { readonly title: string; readonly children: ReactNode; readonly full?: boolean; readonly open?: boolean }) {
  const [open, setOpen] = useState(props.open === true);
  const body = useId();
  return (
    <section className={styles.disclosure} {...(props.full === true ? { 'data-sheet-full': '' } : {})}>
      <h4 className={styles.disclosureHeading}>
        <button type="button" aria-expanded={open} aria-controls={body} onClick={() => setOpen(!open)}>
          <span aria-hidden="true">{open ? '▾' : '▸'}</span> {props.title}
        </button>
      </h4>
      <div id={body} hidden={!open}>
        {open ? props.children : null}
      </div>
    </section>
  );
}

export function Lead(props: { readonly source: string }) {
  const [open, setOpen] = useState(false);
  const long = props.source.length > LEAD_CLAMP_CHARS || props.source.includes('\n\n');
  const id = useId();
  return (
    <div className={styles.leadBox} data-sheet-full="">
      <div id={id} className={`${styles.lead} ${long && !open ? styles.clamped : ''}`} data-lead={long ? (open ? 'open' : 'clamped') : 'short'}>
        <RichText source={props.source} />
      </div>
      {!long ? null : (
        <button type="button" className={styles.more} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

export function Chips(props: { readonly chips: readonly Chip[] }) {
  const { open: openRecord } = useInspectorEnv();
  const [all, setAll] = useState(false);
  if (props.chips.length === 0) return null;
  const shown = all ? props.chips : props.chips.slice(0, MAX_CHIPS);
  const more = props.chips.length - MAX_CHIPS;
  return (
    <ul className={styles.chips} aria-label="Key facts" data-sheet-full="">
      {shown.map((chip, index) => (
        <li key={`${chip.label}:${index}`}>
          {chip.ref === undefined ? (
            <span className={styles.chip}>{chip.label}</span>
          ) : (
            <button type="button" className={`${styles.chip} ${styles.chipLink}`} data-record-id={chip.ref.id} onClick={() => openRecord(chip.ref as NonNullable<Chip['ref']>)}>
              {chip.label}
            </button>
          )}
        </li>
      ))}
      {more <= 0 ? null : (
        <li>
          <button type="button" className={`${styles.chip} ${styles.chipLink}`} aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? 'Show fewer' : `+${more}`}
          </button>
        </li>
      )}
    </ul>
  );
}

export function WatchOuts(props: { readonly items: readonly WatchOut[] }) {
  const { open: openRecord } = useInspectorEnv();
  const [all, setAll] = useState(false);
  if (props.items.length === 0) return null;
  const shown = all ? props.items : props.items.slice(0, MAX_WATCH);
  const more = props.items.length - MAX_WATCH;
  return (
    <section className={styles.watch} aria-label="Watch out" data-sheet-full="">
      {shown.map((item) => (
        <div key={item.ref.id} className={styles.callout}>
          <button type="button" className={styles.calloutTitle} onClick={() => openRecord(item.ref)}>
            {item.title}
          </button>
          <RichText source={item.statement} />
        </div>
      ))}
      {more <= 0 ? null : (
        <button type="button" className={styles.more} aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `+${more} more`}
        </button>
      )}
    </section>
  );
}

export interface GoNextAction {
  readonly label: string;
  readonly run: () => void;
}

/**
 * Up to three buttons on ONE row, the rest in a "⋯" menu named "More actions" (step 8.4a). A button's words never wrap (step 8.4b): when the row does
 * not fit, the last button moves into the menu, one at a time, and a wider pane tries all three again. On a phone the first two are in the peek.
 */
export function GoNext(props: { readonly actions: readonly GoNextAction[] }) {
  const row = useRef<HTMLDivElement>(null);
  const most = Math.min(MAX_GO_NEXT, props.actions.length);
  const [shown, setShown] = useState(most);
  const key = props.actions.map((action) => action.label).join('|');
  useLayoutEffect(() => setShown(most), [key, most]);
  useLayoutEffect(() => {
    const el = row.current;
    if (el !== null && shown > 1 && el.scrollWidth > el.clientWidth + 1) setShown(shown - 1);
  });
  useEffect(() => {
    const el = row.current;
    if (el === null || typeof ResizeObserver === 'undefined') return undefined;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - width) < 1) return;
      width = el.clientWidth;
      setShown(most);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [most]);
  if (props.actions.length === 0) return null;
  const first = props.actions.slice(0, shown);
  const rest = props.actions.slice(shown);
  return (
    <div ref={row} className={styles.goNext} role="group" aria-label="Go next">
      {first.map((action, index) => (
        <Button key={action.label} onClick={action.run} {...(index >= 2 ? { 'data-sheet-full': '' } : {})}>
          {action.label}
        </Button>
      ))}
      {rest.length === 0 ? null : (
        <span data-sheet-full="">
          <Menu label="More actions" trigger={<span aria-hidden="true">⋯</span>} items={rest.map((action) => ({ id: action.label, label: action.label, onSelect: action.run }))} />
        </span>
      )}
    </div>
  );
}

function CardGroupView(props: { readonly group: CardGroup }) {
  const { open: openRecord } = useInspectorEnv();
  const phone = useLayoutMode() === 'phone';
  const [all, setAll] = useState(false);
  const { group } = props;
  const shown = all ? group.cards : group.cards.slice(0, CARDS_SHOWN);
  return (
    <section aria-label={group.heading} className={styles.group} data-group={group.key}>
      <h4 className={styles.groupHeading}>{group.heading}</h4>
      <ul className={`${styles.cards} ${phone ? styles.cardsRow : ''}`} {...(phone ? { 'data-scroll-row': '' } : {})}>
        {shown.map((card) => (
          <li key={`${card.ref.kind}:${card.ref.id}`}>
            <button type="button" className={styles.card} data-record-id={card.ref.id} onClick={() => openRecord(card.ref)}>
              <span className={styles.cardTitle}>{card.title}</span>
              <span className={styles.cardLine}>{card.line}</span>
            </button>
          </li>
        ))}
      </ul>
      {group.cards.length <= CARDS_SHOWN ? null : (
        <button type="button" className={styles.more} aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${group.total}`}
        </button>
      )}
      {!all || group.total <= group.cards.length ? null : <p className={styles.note}>Showing {group.cards.length} of {group.total}.</p>}
    </section>
  );
}

export function Connected(props: { readonly groups: readonly CardGroup[] }) {
  if (props.groups.length === 0) return null;
  return (
    <div className={styles.connected} data-sheet-full="">
      {props.groups.map((group) => (
        <CardGroupView key={group.key} group={group} />
      ))}
    </div>
  );
}
