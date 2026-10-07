/**
 * The status line, the banners and the boot-report lines (step 5.1d). Semantic HTML and text nodes only; every word comes from
 * `banners.ts`, which is a pure function of `AppStatus`.
 */
import { useCounts, useSubscribable } from '@/ui/hooks';
import { bannersOf, bootLinesOf, operationTextOf, saveTextOf, workersTextOf, type BannerAction } from './banners';
import { useApp } from './context';

export function StatusLine() {
  const { services } = useApp();
  const status = useSubscribable(services.status);
  const counts = useCounts(services.store.findings);
  const operation = operationTextOf(status);
  const readOnly = status.mode === 'follower' || status.mode === 'read_only';
  return (
    <section aria-label="Status">
      <ul>
        <li>{saveTextOf(status)}</li>
        <li>
          Findings: E {counts.error} / W {counts.warning} / I {counts.info} / Review {counts.review_required}
        </li>
        <li>{workersTextOf(status)}</li>
        {status.stage === 'booting' ? <li>Starting up</li> : null}
        {readOnly ? <li>Read-only</li> : null}
        {status.singleTab ? <li>Single tab only</li> : null}
        {operation === null ? null : <li>{operation}</li>}
      </ul>
    </section>
  );
}

export function Banners() {
  const { services, reload } = useApp();
  const status = useSubscribable(services.status);
  const banners = bannersOf(status);
  if (banners.length === 0) return null;
  const run = (kind: BannerAction): void => {
    if (kind === 'reload') reload();
    else if (kind === 'save_everything') void services.saveEverythingNow();
    else if (kind === 'retry_replica') void services.retryReplica();
    else void services.retryEngine(kind === 'retry_chem' ? 'chem' : 'layout');
  };
  return (
    <section aria-label="Notices">
      <ul>
        {banners.map((banner) => (
          <li key={banner.id}>
            {banner.text}
            {banner.action === undefined ? null : (
              <>
                {' '}
                <button type="button" onClick={() => run(banner.action?.kind ?? 'reload')}>
                  {banner.action.label}
                </button>
              </>
            )}
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
  if (lines.length === 0) return null;
  return (
    <section aria-label="Start-up report">
      <ul>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
