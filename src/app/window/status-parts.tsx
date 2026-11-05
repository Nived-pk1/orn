/**
 * The status line, the banners and the boot-report lines (step 5.1d). Semantic HTML and text nodes only; every word comes from
 * `banners.ts`, which is a pure function of `AppStatus`.
 */
import { useCounts, useSubscribable } from '@/ui/hooks';
import { Banner, Button } from '@/ui/primitives';
import { usePanels } from '@/ui/state';
import { useStudyChrome } from '@/ui/study-chrome';
import { bannersOf, bannerKindOf, bootLinesOf, draftsLineOf, layoutCacheTextOf, operationTextOf, periodicTextOf, quarantineTextOf, saveTextOf, storageTextOf, workersTextOf, type BannerAction } from './banners';
import { useApp } from './context';
import { createLocalTimeFormatter } from './local-time';
import { useDraftsOpen, useDraftsView } from './editors-access';
import { useExportOpen } from './export-context';
import styles from './status-parts.module.css';

const localTime = createLocalTimeFormatter();

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
  return <FullStatusLine />;
}

function FullStatusLine() {
  const { services, formatTime } = useApp();
  const status = useSubscribable(services.status);
  const counts = useCounts(services.store.findings);
  const operation = operationTextOf(status);
  const storage = storageTextOf(status);
  const layoutCache = layoutCacheTextOf(status);
  const setAside = quarantineTextOf(status);
  const snapshots = periodicTextOf(status, formatTime ?? localTime);
  const readOnly = status.mode === 'follower' || status.mode === 'read_only';
  return (
    <section aria-label="Status">
      <ul className={styles.inline}>
        <li>{saveTextOf(status)}</li>
        <li>
          Findings: E {counts.error} / W {counts.warning} / I {counts.info} / Review {counts.review_required}
        </li>
        <li>{workersTextOf(status)}</li>
        {status.stage === 'booting' ? <li>Starting up</li> : null}
        {readOnly ? <li>Read-only</li> : null}
        {status.singleTab ? <li>Single tab only</li> : null}
        {storage === null ? null : <li>{storage}</li>}
        {layoutCache === null ? null : <li>{layoutCache}</li>}
        {setAside === null ? null : <li>{setAside}</li>}
        {snapshots === null ? null : <li>{snapshots}</li>}
        {operation === null ? null : <li>{operation}</li>}
      </ul>
    </section>
  );
}

export function Banners() {
  const { services, reload, panels } = useApp();
  const status = useSubscribable(services.status);
  const storageNoticeDismissed = usePanels(panels, (s) => s.storageNoticeDismissed);
  const openExport = useExportOpen();
  const chrome = useStudyChrome();
  const banners = bannersOf(status, { storageNoticeDismissed, chrome });
  if (banners.length === 0) return null;
  const run = (kind: BannerAction): void => {
    if (kind === 'reload') reload();
    else if (kind === 'export') openExport?.();
    else if (kind === 'save_everything') void services.saveEverythingNow();
    else if (kind === 'dismiss_storage') panels.getState().dismissStorageNotice();
    else if (kind === 'retry_replica') void services.retryReplica();
    else void services.retryEngine(kind === 'retry_chem' ? 'chem' : 'layout');
  };
  return (
    <section aria-label="Notices">
      <ul className={styles.list}>
        {banners.map((banner) => (
          <li key={banner.id}>
            <Banner
              kind={bannerKindOf(banner.id)}
              actions={
                banner.action === undefined ? undefined : (
                  <>
                    {[banner.action, banner.also]
                      .filter((action) => action !== undefined && (action.kind !== 'export' || openExport !== undefined))
                      .map((action) => (
                        <Button key={action?.kind} onClick={() => run(action?.kind ?? 'reload')}>
                          {action?.label}
                        </Button>
                      ))}
                  </>
                )
              }
            >
              {banner.text}
            </Banner>
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
