import { EDITING } from '@/app/edition';
import type { ExplorerKind } from '@/ui/state';
import type { ModeItem } from '@/ui/shell';
import type { StudyChrome } from '@/ui/study-chrome';

/**
 * The modes of UI_ARCHITECTURE §5 (note E8: Phase 5 builds the Navigator view only; the others are listed, disabled, with the phase
 * that brings them, never hidden and never a silent no-op).
 */
export const NAVIGATOR_MODE = 'navigator';
/** The record counts of step 5.1d, kept reachable beside the navigator (step 5.5a). */
export const DATASET_MODE = 'dataset';

/** The Chapters view (step 7.3b): the study order, one page per chapter. */
export const CHAPTERS_MODE = 'chapters';

/** The Reactions list (step 7.1b). */
export const REACTIONS_MODE = 'reactions';

/** The Precursors view (step 7.2a). */
export const PRECURSORS_MODE = 'precursors';

/** The Reagents view (step 7.3c): the list of reagents and one page per reagent. */
export const REAGENTS_MODE = 'reagents';

/** The Named reactions view (step 7.4): the list of named reactions and one page per named reaction. */
export const NAMED_MODE = 'named';

/** The Mechanisms view (step 7.4): the list of mechanisms and one page per mechanism. */
export const MECHANISMS_MODE = 'mechanisms';

/** The Syllabus view (step 7.6): one exam version's units, topics, content and gaps. */
export const SYLLABUS_MODE = 'syllabus';

export const WORKBENCH_MODE = 'workbench';
/** Studio's review queue (step 6.8b). */
export const REVIEW_MODE = 'review';

/** The Explore tab's modes (the phone's Explore switch chooses among them). */
export const EXPLORER_MODES: readonly string[] = [REACTIONS_MODE, PRECURSORS_MODE, REAGENTS_MODE, NAMED_MODE, MECHANISMS_MODE, SYLLABUS_MODE];

/** The mode a remembered explorer names. */
export function modeOfExplorer(kind: ExplorerKind): string {
  return kind === 'precursors' ? PRECURSORS_MODE : kind === 'reagents' ? REAGENTS_MODE : kind === 'named' ? NAMED_MODE : kind === 'mechanisms' ? MECHANISMS_MODE : kind === 'syllabus' ? SYLLABUS_MODE : REACTIONS_MODE;
}

export const MODES: readonly ModeItem[] = [
  { id: CHAPTERS_MODE, label: 'Chapters', icon: 'book-open', group: 'study' },
  { id: NAVIGATOR_MODE, label: 'Map', icon: 'map', group: 'study' },
  // the Dataset page is an author view in Studio; the Study build lists it with the other views (no Author heading there)
  { id: DATASET_MODE, label: 'Dataset', icon: 'database', group: EDITING ? 'author' : 'study' },
  { id: REACTIONS_MODE, label: 'Reactions', icon: 'flask', group: 'study' },
  { id: PRECURSORS_MODE, label: 'Precursors', icon: 'route', group: 'study' },
  { id: REAGENTS_MODE, label: 'Reagents', icon: 'test-tube', group: 'study' },
  { id: NAMED_MODE, label: 'Named reactions', icon: 'tag', group: 'study' },
  { id: MECHANISMS_MODE, label: 'Mechanisms', icon: 'atom', group: 'study' },
  { id: SYLLABUS_MODE, label: 'Syllabus', icon: 'list-checks', group: 'study' },
  ...(EDITING ? [{ id: WORKBENCH_MODE, label: 'Workbench', icon: 'pencil', group: 'author' }, { id: REVIEW_MODE, label: 'Review', icon: 'clipboard-check', group: 'author' }] satisfies readonly ModeItem[] : []),
];

/** The rail for this reader: a student does not get the Dataset page (step 8.3, C4). */
export const modesFor = (chrome: StudyChrome): readonly ModeItem[] => (chrome.datasetRail ? MODES : MODES.filter((item) => item.id !== DATASET_MODE));
