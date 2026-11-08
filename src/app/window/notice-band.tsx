/**
 * The desktop notice band's data (step 8.4a, Part C): the banners of the status, the study-dataset update, the start-up lines and the
 * unfinished-drafts line become entries of ONE band; `NoticeBandView` shows the most severe and "+n more". Toasts are not here (they dock at
 * the foot of the main column); layout notes are not here (a status-bar item). "Newest" is the order a notice was first seen.
 */
import { useRef, useContext, type ReactNode } from 'react';
import { Button } from '@/ui/primitives';
import { useSubscribable } from '@/ui/hooks';
import { usePanels } from '@/ui/state';
import { useStudyChrome } from '@/ui/study-chrome';
import { bannersOf, bannerKindOf, bootLinesOf, draftsLineOf } from './banners';
import { useApp } from './context';
import { useDraftsOpen, useDraftsView } from './editors-access';
import { useExportOpen } from './export-context';
import { LazyNoticeList } from './lazy-notice-list';
import { NoticeBandView, type BandNotice } from './notice-band-view';
import { BannerButtons, useBannerRunner } from './status-parts';
import { NOTICE_TEXT, StudyUpdateContext } from './study-update';

export function useBandNotices(): readonly BandNotice[] {
  const { services, panels } = useApp();
  const status = useSubscribable(services.status);
  const storageNoticeDismissed = usePanels(panels, (s) => s.storageNoticeDismissed);
  const chrome = useStudyChrome();
  const openExport = useExportOpen();
  const run = useBannerRunner();
  const update = useContext(StudyUpdateContext);
  const draftsLine = draftsLineOf(useDraftsView().count);
  const showDrafts = useDraftsOpen();
  const seen = useRef(new Map<string, number>());
  const orderOf = (id: string): number => {
    const known = seen.current.get(id);
    if (known !== undefined) return known;
    const next = seen.current.size + 1;
    seen.current.set(id, next);
    return next;
  };
  const out: BandNotice[] = [];
  for (const banner of bannersOf(status, { storageNoticeDismissed, chrome: { ...chrome, layoutNotice: false } })) {
    const actions: ReactNode = banner.action === undefined ? undefined : <BannerButtons banner={banner} run={run} canExport={openExport !== undefined} />;
    out.push({ id: banner.id, kind: bannerKindOf(banner.id), text: banner.text, order: orderOf(banner.id), ...(actions === undefined ? {} : { actions }) });
  }
  if (update.due) {
    out.push({
      id: 'study_update',
      kind: 'info',
      text: NOTICE_TEXT,
      order: orderOf('study_update'),
      actions: (
        <>
          <Button onClick={update.loadIt}>Load it</Button>
          <Button onClick={update.later}>Later</Button>
          <Button onClick={update.keep}>Keep my data</Button>
        </>
      ),
    });
  }
  for (const line of bootLinesOf(status.notices)) out.push({ id: `boot:${line}`, kind: 'info', text: line, order: orderOf(`boot:${line}`) });
  if (draftsLine !== null) {
    out.push({ id: 'drafts', kind: 'info', text: draftsLine, order: orderOf('drafts'), ...(showDrafts === null ? {} : { actions: <Button onClick={showDrafts}>Show drafts</Button> }) });
  }
  return out;
}

export function NoticeBand() {
  const notices = useBandNotices();
  return <NoticeBandView notices={notices} renderList={(rest, close) => <LazyNoticeList notices={rest} onClose={close} />} />;
}
