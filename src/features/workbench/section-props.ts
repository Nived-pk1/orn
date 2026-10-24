/** What every section of the species editor gets (step 6.2a part 4): the whole draft, how to edit it, which paths have findings, and why editing may be off. */
import type { DraftRecipe } from '@/core/editing';
import type { PicturesSlot } from './picture-contracts';

export interface SectionProps {
  readonly draft: unknown;
  /** `path` is given for typing into a field (edits to the same path within a second are ONE undo step) and absent for add, remove and move. */
  readonly onEdit: (recipe: DraftRecipe, path?: string) => void;
  /** Field paths that have a finding now (marked invalid). */
  readonly invalid?: ReadonlySet<string>;
  /** Why editing is unavailable (a read-only tab); absent: it is available. */
  readonly unavailable?: string;
  /** A phone: rows stack. */
  readonly phone?: boolean;
  /** The Pictures section's port and whether the record is saved (step 7.1a); absent: the form has no Pictures section. */
  readonly recordPictures?: PicturesSlot | undefined;
}
