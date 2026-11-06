/** The first-run exam card and the phone's exam chip are lazy chunks (step 8.3b, B3), mounted in Study only; the first screen does not load them. */
import { lazy, Suspense } from 'react';
import type { ExamScopeBinding } from './exam-scope-selector';

const FirstRun = /* @__PURE__ */ lazy(() => import('./exam-first-run').then((m) => ({ default: m.ExamFirstRun })));
const Chip = /* @__PURE__ */ lazy(() => import('./exam-first-run').then((m) => ({ default: m.ExamChip })));

export function LazyExamFirstRun(props: { readonly binding: ExamScopeBinding }) {
  return (
    <Suspense fallback={null}>
      <FirstRun binding={props.binding} />
    </Suspense>
  );
}

export function LazyExamChip(props: { readonly binding: ExamScopeBinding }) {
  return (
    <Suspense fallback={null}>
      <Chip binding={props.binding} />
    </Suspense>
  );
}
