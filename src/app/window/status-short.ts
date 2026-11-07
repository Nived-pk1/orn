/**
 * The status bar's short form (step 8.4a, Part C2): "Saved · rev 21 | Findings 0 · 0 · 143 | Review 1975 | Workers ok | Snapshot 2 Nov, 14:44".
 * Each item keeps its full words (`full`, from banners.ts) for the tooltip and the details; nothing is dropped, only shortened. Pure.
 */
import type { AppStatus, WorkerName } from '@/app/services';
import { layoutCacheTextOf, operationTextOf, periodicTextOf, quarantineTextOf, saveTextOf, storageTextOf, workersTextOf } from './banners';
import type { TimeFormatter } from './local-time';

export interface ShortItem {
  readonly id: string;
  readonly short: string;
  readonly full: string;
}

export interface FindingCounts {
  readonly error: number;
  readonly warning: number;
  readonly info: number;
  readonly review_required: number;
}

function saveShort(status: AppStatus): string {
  const save = status.save;
  if (save === null) return 'Not saved';
  switch (save.state) {
    case 'saved':
      return `Saved · rev ${save.lastSavedRevision}`;
    case 'saving':
      return `Saving ${save.pendingRevisions}`;
    case 'retrying':
      return 'Retrying save';
    case 'failed':
      return 'NOT saved';
    case 'read_only':
      return 'Read-only';
  }
}

/** The workers that are not fine, by name; empty when none is down (a worker that has not started yet, or is absent, is fine). */
function workersNotOk(status: AppStatus): string[] {
  const bad: string[] = [];
  if (status.replica.state === 'down' || status.replica.state === 'reloading') bad.push(`compute ${status.replica.state}`);
  for (const name of ['chem', 'layout', 'search'] as const satisfies readonly WorkerName[]) {
    const view = status.workers[name];
    if (view.state === 'down') bad.push(`${name} down`);
    else if (name !== 'search' && view.state === 'ok' && status.engines[name].state === 'unavailable') bad.push(`${name} unavailable`);
  }
  return bad;
}

export function shortStatusOf(status: AppStatus, counts: FindingCounts, formatTime: TimeFormatter, layoutNotes: number): ShortItem[] {
  const items: ShortItem[] = [
    { id: 'save', short: saveShort(status), full: saveTextOf(status) },
    { id: 'findings', short: `Findings ${counts.error} · ${counts.warning} · ${counts.info}`, full: `Findings: E ${counts.error} / W ${counts.warning} / I ${counts.info} / Review ${counts.review_required}` },
    { id: 'review', short: `Review ${counts.review_required}`, full: `Review ${counts.review_required}` },
  ];
  const bad = workersNotOk(status);
  items.push({ id: 'workers', short: bad.length === 0 ? 'Workers ok' : `Workers: ${bad.join(', ')}`, full: workersTextOf(status) });
  const periodic = periodicTextOf(status, formatTime);
  const view = status.periodicSnapshots;
  if (periodic !== null && view !== null) {
    items.push({ id: 'snapshot', short: view.failure !== null ? 'Snapshot failed' : view.lastAt === null ? 'Snapshot none yet' : `Snapshot ${formatTime(view.lastAt)}`, full: periodic });
  }
  if (layoutNotes > 0) items.push({ id: 'layout_notes', short: `Layout notes (${layoutNotes})`, full: `Layout notes (${layoutNotes})` });
  if (status.stage === 'booting') items.push({ id: 'booting', short: 'Starting up', full: 'Starting up' });
  const readOnlyMode = status.mode === 'follower' || status.mode === 'read_only';
  if (readOnlyMode) items.push({ id: 'read_only', short: status.save?.state === 'read_only' ? 'This tab' : 'Read-only', full: 'Read-only' });
  const extras: [string, string | null][] = [
    ['single_tab', status.singleTab ? 'Single tab only' : null],
    ['storage', storageTextOf(status)],
    ['layout_cache', layoutCacheTextOf(status)],
    ['set_aside', quarantineTextOf(status)],
    ['operation', operationTextOf(status)],
  ];
  for (const [id, text] of extras) if (text !== null) items.push({ id, short: text, full: text });
  return items;
}
