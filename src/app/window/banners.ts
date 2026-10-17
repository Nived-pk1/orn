/**
 * Banners and one-line notices as pure functions of `AppStatus` (step 5.1d). Plain words, no jargon; nothing is silent
 * (CLAUDE.md §1.5). The component only renders what these return and runs the named action.
 */
import type { AppStatus, BootNotices, EngineName, WorkerName } from '@/app/services';
import type { NoticeKind } from '@/ui/primitives';

export type BannerAction = 'reload' | 'save_everything' | 'retry_replica' | 'retry_chem' | 'retry_layout' | 'dismiss_storage' | 'export';

export interface Banner {
  readonly id: string;
  readonly text: string;
  readonly action?: { readonly label: string; readonly kind: BannerAction };
  /** A second button (step 5.9b: "Export a backup" beside "Dismiss"). */
  readonly also?: { readonly label: string; readonly kind: BannerAction };
}

/** How a banner looks (a word, a rule weight; colour is never the only carrier): by the condition it reports. */
const KIND_OF: Readonly<Record<string, NoticeKind>> = {
  follower: 'info',
  read_only: 'info',
  single_tab: 'info',
  storage_asking: 'info',
  validation_fallback: 'info',
  promotion_refused: 'warning',
  session_only: 'warning',
  replica_down: 'warning',
  rejected_rows: 'warning',
  worker_down_chem: 'warning',
  worker_down_layout: 'warning',
  worker_down_search: 'warning',
  engine_chem: 'warning',
  engine_layout: 'warning',
  layout_notice: 'info',
  l4_unavailable: 'warning',
  search_down: 'warning',
  storage_refused: 'warning',
  save_failed: 'error',
  revision_gap: 'error',
  reload_failure: 'error',
  l4_not_checked: 'review',
};

export const BLOB_REFUSED_TEXT = 'This browser window cannot keep data (it may be a private window). The app works, but nothing is saved after you close it. Export a backup to keep your work.';

/** A banner id this table does not know is shown as a warning, never hidden. */
export const bannerKindOf = (id: string): NoticeKind => KIND_OF[id] ?? 'warning';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const suffix = (detail: string | null): string => (detail === null || detail === '' ? '' : ` ${detail}`);
const WORKER_WORDS: Record<WorkerName, string> = { chem: 'structure-check', layout: 'layout', search: 'search' };
const ENGINE_NOUN: Record<EngineName, string> = { chem: 'structure checker', layout: 'layout engine' };

/** What the banners need besides the status: the choices the user saved (step 5.5d, item k). */
export interface BannerChoices {
  /** The storage warning was dismissed: its banner is not shown; the status line keeps `Storage: not persistent`. */
  readonly storageNoticeDismissed?: boolean;
}

export function bannersOf(status: AppStatus, choices: BannerChoices = {}): readonly Banner[] {
  const banners: Banner[] = [];
  const reload = { label: 'Reload', kind: 'reload' } as const;

  if (status.mode === 'follower' && status.promotion !== 'refused') {
    banners.push({ id: 'follower', text: `This tab is read-only because another tab of this app is the writer. It shows that tab's changes and takes over when that tab closes.${suffix(status.detail)}` });
  }
  if (status.mode === 'read_only') {
    banners.push({ id: 'read_only', text: `This tab is read-only (${status.reason ?? 'no reason given'}).${suffix(status.detail)}` });
  }
  if (status.promotion === 'refused') {
    banners.push({ id: 'promotion_refused', text: `This tab could not take over as the writer (${status.reason ?? 'no reason given'}), so it stays read-only.${suffix(status.detail)}`, action: reload });
  }
  if (status.singleTab) {
    banners.push({ id: 'single_tab', text: 'This browser has no tab locks, so the app cannot stop a second tab from writing. Keep it open in one tab only.' });
  }
  if (status.mode === 'session_only' && status.reason === 'blob_storage_refused') {
    // Step 5.10a: the window opens the database but refuses to keep a Blob (a private window): the app works, nothing is kept.
    banners.push({ id: 'session_only', text: BLOB_REFUSED_TEXT, action: { label: 'Export a backup', kind: 'export' } });
  } else if (status.mode === 'session_only') {
    banners.push({ id: 'session_only', text: `Nothing is saved in this session (${status.reason ?? 'no reason given'}). Closing the tab loses everything.${suffix(status.detail)}` });
  }
  if (status.save?.failureReason === 'revision_gap') {
    banners.push({
      id: 'revision_gap',
      text: `Saving stopped: the stored data and this tab disagree about which changes came first (${status.save.lastError ?? 'revision gap'}). Everything is still on this page.`,
      action: { label: 'Save everything now', kind: 'save_everything' },
    });
  }
  if (status.save?.state === 'failed' && status.save.failureReason !== 'revision_gap') {
    banners.push({
      id: 'save_failed',
      text: `Saving failed${status.save.lastError === null ? '' : ` (${status.save.lastError})`}. Your changes are still on this page, but they are NOT saved: closing the tab would lose them. Export a copy now.`,
      action: { label: 'Export now', kind: 'export' },
    });
  }
  if (status.replica.state === 'down') {
    banners.push({ id: 'replica_down', text: `The background copy used for checking data is down (${status.replica.reason}).`, action: { label: 'Retry', kind: 'retry_replica' } });
  }
  if (status.validation?.where === 'main') {
    banners.push({ id: 'validation_fallback', text: `Data checks ran on this page because the background worker was not available (${status.validation.reason}). The page may feel slow while it checks.` });
  }
  if (status.reloadFailure !== null) {
    banners.push({ id: 'reload_failure', text: `This tab could not load another tab's changes (${status.reloadFailure.reason}: ${status.reloadFailure.detail}).`, action: reload });
  }
  if (status.rejectedRows > 0) {
    banners.push({ id: 'rejected_rows', text: `${plural(status.rejectedRows, 'row', 'rows')} written by another tab failed validation and are not shown.` });
  }

  for (const name of ['chem', 'layout', 'search'] as const) {
    if (status.workers[name].state === 'down') {
      const prefix = name === 'chem' ? 'Check unavailable: ' : '';
      banners.push({ id: `worker_down_${name}`, text: `${prefix}the ${WORKER_WORDS[name]} worker stopped and gave up (${status.workers[name].reason}). Reload the page to start it again.`, action: reload });
    }
  }
  for (const name of ['chem', 'layout'] as const) {
    const engine = status.engines[name];
    if (engine.state !== 'unavailable' || status.workers[name].state === 'down') continue;
    const text =
      name === 'chem'
        ? `Check unavailable: the ${ENGINE_NOUN[name]} could not start (${engine.message ?? 'no reason given'}). Structures are not being checked.`
        : `Layout unavailable: the ${ENGINE_NOUN[name]} could not start (${engine.message ?? 'no reason given'}). A simple fallback layout is used.`;
    banners.push({ id: `engine_${name}`, text, action: { label: 'Retry', kind: name === 'chem' ? 'retry_chem' : 'retry_layout' } });
  }
  const chemBannerShown = banners.some((b) => b.id === 'engine_chem' || b.id === 'worker_down_chem');
  if (status.layoutNotice !== null) banners.push({ id: 'layout_notice', text: `Layout note: ${status.layoutNotice}.` });
  if (status.l4.state === 'unavailable' && !chemBannerShown) {
    banners.push({ id: 'l4_unavailable', text: `Check unavailable: ${status.l4.message ?? 'structures are not being checked'}.` });
  }
  if (status.l4.notChecked > 0 && status.l4.state !== 'unavailable') {
    banners.push({ id: 'l4_not_checked', text: `${plural(status.l4.notChecked, 'structure was', 'structures were')} not checked (${status.l4.message ?? 'the toolkit gave no answer'}). They are not known to be clean.` });
  }
  if (status.search.state === 'down' && status.workers.search.state !== 'down') {
    banners.push({ id: 'search_down', text: `Search is unavailable (${status.search.reason}).` });
  }
  if (status.storage.persistence === 'asking') {
    banners.push({ id: 'storage_asking', text: 'Waiting for the browser to answer the request for persistent storage. Your data is saved; you can keep working.' });
  }
  if (status.storage.persistence === 'refused' && choices.storageNoticeDismissed !== true) {
    banners.push({ id: 'storage_refused', action: { label: 'Dismiss', kind: 'dismiss_storage' }, also: { label: 'Export a backup', kind: 'export' }, text: status.storage.message === null ? 'The browser did not grant persistent storage. It may delete this data when disk space runs low.' : `${status.storage.message.charAt(0).toUpperCase()}${status.storage.message.slice(1)}.` });
  }
  return banners;
}

/** One plain line for each thing boot found (nothing silent). */
export function bootLinesOf(notices: BootNotices | null): readonly string[] {
  if (notices === null) return [];
  const lines: string[] = [];
  // `crashSuspected` is a Diagnostics fact only (ADR-040): an unload cannot be trusted to write the marker, so nothing the user sees depends on it.
  // Unfinished drafts have their own line (`draftsLineOf`, from the session manager).
  if (notices.quarantinedRows > 0) lines.push(`${plural(notices.quarantinedRows, 'stored row', 'stored rows')} failed validation and ${notices.quarantinedRows === 1 ? 'was' : 'were'} set aside (quarantined).`);
  if (notices.assetsWithoutBytes > 0) lines.push(`${plural(notices.assetsWithoutBytes, 'asset record has', 'asset records have')} no stored file.`);
  if (notices.unverifiedAssetBlobs > 0) lines.push(`${plural(notices.unverifiedAssetBlobs, 'stored file was', 'stored files were')} not verified.`);
  if (notices.migrationSteps > 0) lines.push(`${plural(notices.migrationSteps, 'data migration step', 'data migration steps')} ran at start-up.`);
  return lines;
}

/** The start-up line for unfinished drafts: "N unfinished drafts" (with "Show drafts"); nothing when there are none or the count is not known yet. */
export const draftsLineOf = (count: number | null): string | null => (count === null || count === 0 ? null : plural(count, 'unfinished draft', 'unfinished drafts'));

/** The save state as the status line says it. "Applied, not saved" is never "done" (5.1c decision 5). */
export function saveTextOf(status: AppStatus): string {
  const save = status.save;
  if (save === null) return 'Not saved: this session keeps nothing';
  switch (save.state) {
    case 'saved':
      return `Saved (revision ${save.lastSavedRevision})`;
    case 'saving':
      return `Applied, not saved yet: saving ${plural(save.pendingRevisions, 'change', 'changes')}`;
    case 'retrying':
      return `Applied, not saved: retrying${save.lastError === null ? '' : ` (${save.lastError})`}`;
    case 'failed':
      return `Applied, NOT saved: saving failed${save.lastError === null ? '' : ` (${save.lastError})`}`;
    case 'read_only':
      return 'Read-only: this tab saves nothing';
  }
}

/** The workers as the status line says them: the compute worker is the replica; an engine worker is started at its first need (PERFORMANCE §7). */
export function workersTextOf(status: AppStatus): string {
  const replica = { in_sync: 'ok', reloading: 'reloading', down: 'down', absent: 'absent' }[status.replica.state];
  const worker = (name: WorkerName): string => {
    const view = status.workers[name];
    // The same state as the banner: a running worker whose engine could not start is not "ok" (5.10a review, header-CSP case A).
    if (view.state === 'ok' && name !== 'search' && status.engines[name].state === 'unavailable') return 'unavailable';
    return view.state === 'ok' ? (view.started ? 'ok' : 'not started') : view.state;
  };
  return `Workers: compute ${replica}, chem ${worker('chem')}, layout ${worker('layout')}, search ${worker('search')}`;
}

/** The short status-line word for storage that is not persistent (step 5.5d, item k): shown even when the warning was dismissed, so it is never silent. */
export const storageTextOf = (status: AppStatus): string | null => (status.storage.persistence === 'refused' ? 'Storage: not persistent' : null);

/** The status-line word for a layout that could not be saved to the cache (step 5.5d, item h); the layout itself is fine. */
export const layoutCacheTextOf = (status: AppStatus): string | null => (status.layoutCache.state === 'refused' ? `Layout cache: not saved (${status.layoutCache.message ?? 'refused'})` : null);

/** The status-line words for rows set aside (step 5.11b): every boot while the stored count is above 0; null for 0. */
export const quarantineTextOf = (status: AppStatus): string | null =>
  status.quarantinedCount > 0 ? `${status.quarantinedCount} ${status.quarantinedCount === 1 ? 'record' : 'records'} set aside` : null;

export function operationTextOf(status: AppStatus): string | null {
  const op = status.operation;
  if (op === null) return null;
  const kind = { import_preview: 'Reading an import file', import_apply: 'Applying an import', restore: 'Restoring a snapshot', export: 'Exporting' }[op.kind];
  const progress = op.progress === null ? '' : `, ${op.progress.done}${op.progress.total === null ? '' : ` of ${op.progress.total}`}`;
  return `${kind}: ${op.stage}${progress}`;
}
