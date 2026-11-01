/**
 * The ONE interface the Syllabus view needs from outside (step 7.6, as the Named reactions view's ports): the canonical store (read only), the
 * UI stores it reads and writes, and the rich text renderer of another feature (handed in as a function: features never import each other).
 * `src/app` fills it; the feature imports no `src/app`. Nothing here edits a record.
 */
import type { ReactNode } from 'react';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CanonicalState } from '@/core/schema';
import type { ActiveExamStore, SyllabusStore } from '@/ui/state';

export interface SyllabusPorts {
  readonly store: {
    getState(): CanonicalState;
    subscribe(listener: (changes: ChangeSet) => void): () => void;
  };
  readonly ui: {
    readonly syllabus: SyllabusStore;
    /** Read only: the active exam scope decides the default version. This view never changes it. */
    readonly exam: ActiveExamStore;
  };
  /** Rich text as the inspector draws it (the official wording of a unit). */
  renderRichText(source: string | undefined): ReactNode;
  /** Opens a chapter's page in the Chapters view. */
  openChapter(chapterId: string): void;
  readonly timers: { after(ms: number, run: () => void): () => void };
  readonly log: (type: string, message: string) => void;
  /** True in Studio: gap rows say "Nothing here yet", and "Gaps only" is offered. Study shows a dash and has no toggle. */
  readonly editing: boolean;
}
