/** The words of the draft's storage state and of the drafts list. Pure functions of the state; the editor and the list print them. */
import type { DraftSaveView, DraftsViewModel } from './contracts';

/** The one injected formatter of the window (a stored UTC time shown in the reader's zone); a feature never formats a zone itself. */
export type FormatTime = (iso: string) => string;

/** The line in the editor's footer. `keeping` says whether drafts are kept at all in this window. */
export function draftStatusText(save: DraftSaveView, keeping: DraftsViewModel['keeping'], formatTime: FormatTime): string {
  if (keeping === 'memory' || save.state === 'memory') return 'Drafts are not kept in this window';
  switch (save.state) {
    case 'idle':
      return 'No changes yet';
    case 'saving':
      return 'Saving draft...';
    case 'saved':
      return `Draft saved ${formatTime(save.at)}`;
    case 'failed':
      return `Draft not saved: ${save.reason}`;
  }
}

/** Why editing is unavailable in a tab that is not the one saving; undefined when it is available. */
export function editingUnavailableReason(keeping: DraftsViewModel['keeping']): string | undefined {
  return keeping === 'read_only' ? 'This tab is read-only: edit in the tab that is saving' : undefined;
}

export const draftsLabel = (count: number | null): string => `Drafts (${count ?? 0})`;
