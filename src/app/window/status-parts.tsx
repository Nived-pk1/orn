/**
 * The status line, the banners and the boot-report lines (step 5.1d). Semantic HTML and text nodes only; every word comes from
 * `banners.ts`, which is a pure function of `AppStatus`.
 */
import { useSubscribable } from '@/ui/hooks';
import { Banner as BannerView, Button } from '@/ui/primitives';
import { usePanels } from '@/ui/state';
import { useStudyChrome } from '@/ui/study-chrome';
import { bannersOf, bannerKindOf, type Banner, bootLinesOf, draftsLineOf, type BannerAction } from './banners';
import { useApp } from './context';
import { LazyFullStatus } from './lazy-full-status';
import { useDraftsOpen, useDraftsView } from './editors-access';
import { useExportOpen } from './export-context';
import styles from './status-parts.module.css';

/** The one quiet line a student with own imported data sees (step 8.3, C1). */
export const SAVED_LINE = 'Your data is saved in this browser';

export function StatusLine() {
  const chrome = useStudyChrome();
  if (chrome.statusBar === 'none') return null;
  if (chrome.statusBar === 'saved-line') {
    return (
      <section aria-label="Status">
        <p className={styles.savedLine}>{SAVED_LINE}</p>
      </section>
    );
  }
  return <LazyFullStatus />;
}

/** What a banner's buttons do (shared by the phone list, the desktop band and its list). */
export function useBannerRunner(): (kind: BannerAction) => void {
  const { services, reload, panels } = useApp();
  const openExport = useExportOpen();
  return (kind) => {
    if (kind === 'reload') reload();
    else if (kind === 'export') openExport?.();
    else if (kind === 'save_everything') void services.saveEverythingNow();
    else if (kind === 'dismiss_storage') panels.getState().dismissStorageNotice();
    else if (kind === 'retry_replica') void services.retryReplica();
    else void services.retryEngine(kind === 'retry_chem' ? 'chem' : 'layout');
  };
}

/** The buttons of one banner (its action, then its second one); an export button only where export exists. */
export function BannerButtons(props: { readonly banner: Banner; readonly run: (kind: BannerAction) => void; readonly canExport: boolean }) {
  const { banner, run, canExport } = props;
  const actions = [banner.action, banner.also].filter((action) => action !== undefined && (action.kind !== 'export' || canExport));
  if (banner.action === undefined || actions.length === 0) return null;
  return (
    <>
      {actions.map((action) => (
        <Button key={action?.kind} onClick={() => run(action?.kind ?? 'reload')}>
          {action?.label}
        </Button>
      ))}
    </>
  );
}

export function Banners() {
  const { services, panels } = useApp();
  const status = useSubscribable(services.status);
  const storageNoticeDismissed = usePanels(panels, (s) => s.storageNoticeDismissed);
  const openExport = useExportOpen();
  const chrome = useStudyChrome();
  const run = useBannerRunner();
  const banners = bannersOf(status, { storageNoticeDismissed, chrome });
  if (banners.length === 0) return null;
  return (
    <section aria-label="Notices">
      <ul className={styles.list}>
        {banners.map((banner) => (
          <li key={banner.id}>
            <BannerView kind={bannerKindOf(banner.id)} actions={banner.action === undefined ? undefined : <BannerButtons banner={banner} run={run} canExport={openExport !== undefined} />}>
              {banner.text}
            </BannerView>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BootLines() {
  const { services } = useApp();
  const status = useSubscribable(services.status);
  const lines = bootLinesOf(status.notices);
  const draftsLine = draftsLineOf(useDraftsView().count);
  const showDrafts = useDraftsOpen();
  if (lines.length === 0 && draftsLine === null) return null;
  return (
    <section aria-label="Start-up report">
      <ul className={styles.report}>
        {draftsLine === null ? null : (
          <li>
            {draftsLine}
            {showDrafts === null ? null : (
              <>
                {' '}
                <Button onClick={showDrafts}>Show drafts</Button>
              </>
            )}
          </li>
        )}
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
