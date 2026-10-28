import { EDITING } from '@/app/edition';
import type { ModeItem } from '@/ui/shell';

/**
 * The modes of UI_ARCHITECTURE §5 (note E8: Phase 5 builds the Navigator view only; the others are listed, disabled, with the phase
 * that brings them, never hidden and never a silent no-op).
 */
export const NAVIGATOR_MODE = 'navigator';
/** The record counts of step 5.1d, kept reachable beside the navigator (step 5.5a). */
export const DATASET_MODE = 'dataset';

/** The Reactions list (step 7.1b). */
export const REACTIONS_MODE = 'reactions';

/** The Precursors view (step 7.2a). */
export const PRECURSORS_MODE = 'precursors';

export const WORKBENCH_MODE = 'workbench';
/** Studio's review queue (step 6.8b). */
export const REVIEW_MODE = 'review';

export const MODES: readonly ModeItem[] = [
  { id: NAVIGATOR_MODE, label: 'Navigator' },
  { id: DATASET_MODE, label: 'Dataset' },
  { id: REACTIONS_MODE, label: 'Reactions' },
  { id: PRECURSORS_MODE, label: 'Precursors' },
  { id: 'reagents', label: 'Reagents', unavailable: 'Phase 7' },
  { id: 'named', label: 'Named', unavailable: 'Phase 7' },
  { id: 'mechanisms', label: 'Mechanisms', unavailable: 'Phase 7' },
  { id: 'syllabus', label: 'Syllabus', unavailable: 'Phase 7' },
  ...(EDITING ? [{ id: WORKBENCH_MODE, label: 'Workbench' }, { id: REVIEW_MODE, label: 'Review' }] : []),
];
