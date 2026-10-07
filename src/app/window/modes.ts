import type { ModeItem } from '@/ui/shell';

/**
 * The modes of UI_ARCHITECTURE §5 (note E8: Phase 5 builds the Navigator view only; the others are listed, disabled, with the phase
 * that brings them, never hidden and never a silent no-op).
 */
export const NAVIGATOR_MODE = 'navigator';

export const MODES: readonly ModeItem[] = [
  { id: NAVIGATOR_MODE, label: 'Navigator' },
  { id: 'reactions', label: 'Reactions', unavailable: 'Phase 7' },
  { id: 'precursors', label: 'Precursors', unavailable: 'Phase 7' },
  { id: 'reagents', label: 'Reagents', unavailable: 'Phase 7' },
  { id: 'named', label: 'Named', unavailable: 'Phase 7' },
  { id: 'mechanisms', label: 'Mechanisms', unavailable: 'Phase 7' },
  { id: 'syllabus', label: 'Syllabus', unavailable: 'Phase 7' },
  { id: 'workbench', label: 'Workbench', unavailable: 'Phase 6' },
];
