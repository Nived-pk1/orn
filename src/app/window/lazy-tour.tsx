/**
 * The first-run tour (step 8.4g Part B, G4), Study only. The entry holds only the question "is it time?" (the exam question answered, the data
 * there, and no `tourDone` mark in the boot state); the flag and the tour itself are one lazy chunk, fetched only when the answer is yes.
 */
import { lazy, Suspense } from 'react';
import { useStore } from 'zustand';
import type { ActiveExamStore } from '@/ui/state';
import type { TourServices } from './tour-flag';

const Gate = /* @__PURE__ */ lazy(() => import('./tour-gate'));

export function LazyTour(props: { readonly exam: ActiveExamStore; readonly hasData: boolean; readonly services: TourServices }) {
  const asked = useStore(props.exam, (s) => s.asked);
  const seen = (props.services.bootReport?.uiState.tourDone as { done?: unknown } | undefined)?.done === true;
  if (seen || !asked || !props.hasData) return null;
  return (
    <Suspense fallback={null}>
      <Gate services={props.services} />
    </Suspense>
  );
}
