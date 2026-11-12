/** The first-run exam card is a lazy chunk (step 8.3b, B3), mounted in Study only; the first screen does not load it. (The phone's exam chip is the menu chip of the exam selector since step 8.4f.) */
import { lazy, Suspense } from "react";
import type { ExamScopeBinding } from "./exam-scope-selector";

const FirstRun = /* @__PURE__ */ lazy(() =>
  import("./exam-first-run").then((m) => ({ default: m.ExamFirstRun })),
);

export function LazyExamFirstRun(props: { readonly binding: ExamScopeBinding }) {
  return (
    <Suspense fallback={null}>
      <FirstRun binding={props.binding} />
    </Suspense>
  );
}
