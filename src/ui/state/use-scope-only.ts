/** The one switch every view reads (step 8.3b, B2; ADR-046): records outside the chosen exam are hidden when an exam is chosen and the mode is "Only". */
import { useStore } from 'zustand';
import { effectiveOnly } from './exam-state';
import type { ActiveExamStore } from './navigator-stores';

export function useScopeOnly(exam: ActiveExamStore): boolean {
  return useStore(exam, (state) => effectiveOnly(state));
}
