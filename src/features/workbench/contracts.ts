/**
 * What the workbench (the editors and the drafts list) needs of the app, as plain types and ports (ADR-040). The app's session manager
 * fits these structurally; a feature never imports the app. Nothing here is chemistry: the editor renders and edits, the core decides.
 */
import type { RecordKind } from '@/core/schema';

/** What the editor says about the storage of the draft. */
export type DraftSaveView =
  | { readonly state: 'idle' }
  | { readonly state: 'saving' }
  | { readonly state: 'saved'; readonly at: string }
  | { readonly state: 'failed'; readonly reason: string }
  | { readonly state: 'memory' };

export interface DraftListItemView {
  readonly id: string;
  readonly unreadable: false;
  readonly kind: RecordKind;
  readonly name: string;
  readonly isNew: boolean;
  readonly updatedAt: string;
  readonly changedSince: boolean;
}

export interface UnreadableDraftView {
  readonly id: string;
  readonly unreadable: true;
  readonly reason: string;
}

export interface DraftsViewModel {
  readonly items: readonly (DraftListItemView | UnreadableDraftView)[];
  readonly count: number | null;
  readonly keeping: 'stored' | 'memory' | 'read_only';
}

/** The drafts list's port: read the list, discard one. */
export interface DraftsListPort {
  view(): DraftsViewModel;
  subscribe(listener: () => void): () => void;
  discard(id: string): Promise<void>;
  discardUnreadable(id: string): Promise<void>;
}
