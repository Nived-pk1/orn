/**
 * The desktop notice band (step 8.4a, Part C): ONE row at the top of the main column. It shows the most severe notice with its own actions
 * and, when there are others, "+n more", which opens the list of the rest (the caller supplies it, a lazy chunk). A long text is cut to
 * one line; "Details" opens the full text in place. Presentational: the notices come in as data.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Banner, Button, type NoticeKind } from '@/ui/primitives';
import { orderNotices, type NoticeEntry } from './notice-order';
import styles from './notice-band.module.css';

export interface BandNotice extends NoticeEntry {
  readonly kind: NoticeKind;
  readonly text: string;
  readonly actions?: ReactNode;
}

export interface NoticeBandViewProps {
  readonly notices: readonly BandNotice[];
  /** The list of the other notices (the lazy chunk); called with the rest, most severe first, while "+n more" is open. */
  readonly renderList: (rest: readonly BandNotice[], close: () => void) => ReactNode;
}

export function NoticeBandView(props: NoticeBandViewProps) {
  const ordered = orderNotices(props.notices);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cut, setCut] = useState(false);
  const text = useRef<HTMLSpanElement>(null);
  const first = ordered[0];
  const shownId = first?.id;
  const expandedNow = expanded !== null && expanded === shownId;
  useLayoutEffect(() => {
    const el = text.current;
    if (el === null || expandedNow) return;
    setCut(el.scrollWidth > el.clientWidth + 1);
  });
  const rest = ordered.slice(1);
  // the list closes itself when nothing is left in it (every notice in it was dealt with)
  useEffect(() => {
    if (open && rest.length === 0) setOpen(false);
  }, [open, rest.length]);
  if (first === undefined) return null;
  return (
    <section aria-label="Notices" className={styles.band}>
      <Banner
        kind={first.kind}
        compact
        expanded={expandedNow}
        textRef={text}
        actions={
          <>
            {first.actions}
            {cut || expandedNow ? (
              <Button variant="quiet" aria-expanded={expandedNow} onClick={() => setExpanded(expandedNow ? null : first.id)}>
                {expandedNow ? 'Less' : 'Details'}
              </Button>
            ) : null}
            {rest.length === 0 ? null : (
              <Button variant="quiet" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(true)}>{`+${rest.length} more`}</Button>
            )}
          </>
        }
      >
        {first.text}
      </Banner>
      {open && rest.length > 0 ? props.renderList(rest, () => setOpen(false)) : null}
    </section>
  );
}
