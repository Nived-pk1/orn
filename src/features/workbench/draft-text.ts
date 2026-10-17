/** The words of the draft's storage state and of the drafts list. Pure functions of the state; the editor and the list print them. */
import type { DraftSaveView, DraftsViewModel } from './contracts';

/** "2026-10-17T12:34:56.000Z" -> "2026-10-17 12:34 UTC" (deterministic; the text is never HTML). */
export function shortTime(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return match === null ? iso.slice(0, 40) : `${match[1]} ${match[2]} UTC`;
}

/** The line in the editor's footer. `keeping` says whether drafts are kept at all in this window. */
export function draftStatusText(save: DraftSaveView, keeping: DraftsViewModel['keeping']): string {
  if (keeping === 'memory' || save.state === 'memory') return 'Drafts are not kept in this window';
  switch (save.state) {
    case 'idle':
      return 'No changes yet';
    case 'saving':
      return 'Saving draft...';
    case 'saved':
      return `Draft saved ${shortTime(save.at)}`;
    case 'failed':
      return `Draft not saved: ${save.reason}`;
  }
}

/** Why editing is unavailable in a tab that is not the one saving; undefined when it is available. */
export function editingUnavailableReason(keeping: DraftsViewModel['keeping']): string | undefined {
  return keeping === 'read_only' ? 'This tab is read-only: edit in the tab that is saving' : undefined;
}

export const draftsLabel = (count: number | null): string => `Drafts (${count ?? 0})`;
