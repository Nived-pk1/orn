/**
 * Banners and one-line notices as pure functions of `AppStatus` (step 5.1d). Plain words, no jargon; nothing is silent
 * (CLAUDE.md §1.5). The component only renders what these return and runs the named action.
 */
import type { AppStatus, BootNotices, EngineName, WorkerName } from '@/app/services';

export type BannerAction = 'reload' | 'save_everything' | 'retry_replica' | 'retry_chem' | 'retry_layout';

export interface Banner {
  readonly id: string;
  readonly text: string;
  readonly action?: { readonly label: string; readonly kind: BannerAction };
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const suffix = (detail: string | null): string => (detail === null || detail === '' ? '' : ` ${detail}`);
const WORKER_WORDS: Record<WorkerName, string> = { chem: 'structure-check', layout: 'layout', search: 'search' };
const ENGINE_NOUN: Record<EngineName, string> = { chem: 'structure checker', layout: 'layout engine' };

export function bannersOf(status: AppStatus): readonly Banner[] {
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
  if (status.mode === 'session_only') {
    banners.push({ id: 'session_only', text: `Nothing is saved in this session (${status.reason ?? 'no reason given'}). Closing the tab loses everything.${suffix(status.detail)}` });
  }
  if (status.save?.failureReason === 'revision_gap') {
    banners.push({
      id: 'revision_gap',
      text: `Saving stopped: the stored data and this tab disagree about which changes came first (${status.save.lastError ?? 'revision gap'}). Everything is still on this page.`,
      action: { label: 'Save everything now', kind: 'save_everything' },
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
  if (status.l4.state === 'unavailable' && !chemBannerShown) {
    banners.push({ id: 'l4_unavailable', text: `Check unavailable: ${status.l4.message ?? 'structures are not being checked'}.` });
  }
  if (status.l4.notChecked > 0 && status.l4.state !== 'unavailable') {
    banners.push({ id: 'l4_not_checked', text: `${plural(status.l4.notChecked, 'structure was', 'structures were')} not checked (${status.l4.message ?? 'the toolkit gave no answer'}). They are not known to be clean.` });
  }
  if (status.search.state === 'down' && status.workers.search.state !== 'down') {
    banners.push({ id: 'search_down', text: `Search is unavailable (${status.search.reason}).` });
  }
  if (status.storage.persistence === 'refused') {
    banners.push({ id: 'storage_refused', text: `The browser did not grant persistent storage${suffix(status.storage.message)} It may delete this data when disk space runs low.` });
  }
  return banners;
}

/** One plain line for each thing boot found (nothing silent). */
export function bootLinesOf(notices: BootNotices | null): readonly string[] {
  if (notices === null) return [];
  const lines: string[] = [];
  if (notices.crashSuspected) lines.push('The last session may not have closed cleanly (a crash is suspected). Check your latest changes.');
  if (notices.quarantinedRows > 0) lines.push(`${plural(notices.quarantinedRows, 'stored row', 'stored rows')} failed validation and ${notices.quarantinedRows === 1 ? 'was' : 'were'} set aside (quarantined).`);
  if (notices.assetsWithoutBytes > 0) lines.push(`${plural(notices.assetsWithoutBytes, 'asset record has', 'asset records have')} no stored file.`);
  if (notices.unverifiedAssetBlobs > 0) lines.push(`${plural(notices.unverifiedAssetBlobs, 'stored file was', 'stored files were')} not verified.`);
  if (notices.migrationSteps > 0) lines.push(`${plural(notices.migrationSteps, 'data migration step', 'data migration steps')} ran at start-up.`);
  return lines;
}

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

export function operationTextOf(status: AppStatus): string | null {
  const op = status.operation;
  if (op === null) return null;
  const kind = { import_preview: 'Reading an import file', import_apply: 'Applying an import', restore: 'Restoring a snapshot', export: 'Exporting' }[op.kind];
  const progress = op.progress === null ? '' : `, ${op.progress.done}${op.progress.total === null ? '' : ` of ${op.progress.total}`}`;
  return `${kind}: ${op.stage}${progress}`;
}
