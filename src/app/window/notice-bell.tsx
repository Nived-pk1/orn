/**
 * The notices bell with its data (step 8.4d, Part C): the count of the band's notices, and a click opens the list of ALL of them (the list
 * the band's "+n more" opens, here with every notice). A lazy chunk with the band: its data hooks are not in the entry chunk.
 */
import { useState } from 'react';
import { LazyNoticeList } from './lazy-notice-list';
import { useBandNotices } from './notice-band';
import { NoticeBellButton } from './notice-bell-button';
import { orderNotices } from './notice-order';

export function NoticeBell() {
  const ordered = orderNotices(useBandNotices());
  const [open, setOpen] = useState(false);
  return (
    <>
      <NoticeBellButton count={ordered.length} onOpen={() => setOpen(true)} />
      {open ? <LazyNoticeList notices={ordered} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
