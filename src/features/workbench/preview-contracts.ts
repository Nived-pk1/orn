/**
 * What the reaction editor's live preview needs of the app (step 6.3b decision D2), as plain types: the app fills the port from the store, the
 * indexes, the depiction port and the Structures setting. `build` is the core's `previewOfDraft` over the current state (derived; nothing is
 * stored); the preview draws it with the card's own equation component.
 */
import type { DraftPreview } from '@/core/graph';
import type { StructureFactsPort } from '@/render/equation';
import type { DepictionBinding, DepictionTimers } from '@/render/svg';

export interface PreviewPort {
  /** The reaction draft as its card will show it, or in words what it still lacks. Synchronous and cheap (microseconds); never writes. */
  build(draft: unknown): DraftPreview;
  /** The fixed-scale depiction binding that follows the Structures setting; absent: no drawing is asked for (terms are formulas or names). */
  readonly binding: DepictionBinding | undefined;
  readonly facts: StructureFactsPort | undefined;
  readonly timers: DepictionTimers;
  /** The "Names" setting of the equation (saved with the panels). */
  readonly names: { get(): boolean; set(names: boolean): void; subscribe(listener: () => void): () => void };
}
