/**
 * What the window shows on its canvas for the chosen mode (split out of window.tsx, step 7.2a): the navigator, the dataset page, the
 * Workbench, and the lazy views (Reactions and Precursors in BOTH editions; the review queue in Studio only).
 */
import { lazy, Suspense, useCallback } from "react";
import { NavigatorView } from "@/features/navigator";
import { RECORD_KINDS, type RecordKind } from "@/core/schema";
import { EDITING } from "@/app/edition";
import { usePanels, type ExplorerFilter } from "@/ui/state";
import { useApp } from "./context";
import { DatasetActions } from "./dataset-actions";
import { FirstRun } from "./first-run";
import { NAVIGATOR_MODE, PRECURSORS_MODE, REACTIONS_MODE, REVIEW_MODE, WORKBENCH_MODE } from "./modes";
import { RecordCounts } from "./record-counts";
import type { ExportActions } from "./use-export-actions";
import type { ImportActions } from "./use-import-actions";
import { WorkbenchPage } from "./workbench-page";
import styles from "./window.module.css";

// the Reactions list: a lazy chunk in BOTH editions (step 7.1b)
const ReactionsHost = lazy(() => import("./reactions-host").then((m) => ({ default: m.ReactionsHost })));
// the Precursors view: a lazy chunk in BOTH editions (step 7.2a)
const PrecursorsHost = lazy(() => import("./precursors-host").then((m) => ({ default: m.PrecursorsHost })));
// Studio only: the review queue is a lazy chunk (and a dropped one in Study, where EDITING is false)
const ReviewHost = /* @__PURE__ */ lazy(() => import("./review-host").then((m) => ({ default: m.ReviewHost })));
export const totalOf = (counts: Readonly<Record<RecordKind, number>>): number =>
  RECORD_KINDS.reduce((sum, kind) => sum + counts[kind], 0);

function DatasetView(props: {
  readonly counts: Readonly<Record<RecordKind, number>>;
  readonly empty: boolean;
  readonly imports: ImportActions;
  readonly exports: ExportActions;
  readonly onAskReplace: () => void;
}) {
  return (
    <section aria-label="Dataset">
      <h2>Dataset</h2>
      <RecordCounts counts={props.counts} />
      <DatasetActions imports={props.imports} exports={props.exports} onAskReplace={props.onAskReplace} />
      {props.empty ? (
        <p>
          Started empty. Nothing can be added in this version; authoring comes
          later.
        </p>
      ) : null}
    </section>
  );
}

export function Canvas(props: {
  readonly mode: string;
  readonly counts: Readonly<Record<RecordKind, number>>;
  readonly imports: ImportActions;
  readonly exports: ExportActions;
  readonly onAskReplace: () => void;
  /** Opens Reactions with this filter (the Precursors view's by-product line). */
  readonly onReactions: (filter: Partial<ExplorerFilter>) => void;
}) {
  const { panels } = useApp();
  const { imports } = props;
  const startedEmpty = usePanels(panels, (s) => s.startEmptyDismissed);
  const onStartEmpty = useCallback(
    () => panels.getState().dismissStartEmpty(),
    [panels],
  );
  const empty = totalOf(props.counts) === 0;
  const showsNavigator = !empty && props.mode === NAVIGATOR_MODE;
  return (
    <div className={showsNavigator ? styles.canvasFull : EDITING && props.mode === REVIEW_MODE ? styles.canvasFill : styles.canvas}>
      {empty && !startedEmpty ? (
        <FirstRun imports={imports} onStartEmpty={onStartEmpty} />
      ) : showsNavigator ? (
        <NavigatorView />
      ) : !empty && props.mode === REACTIONS_MODE ? (
        <Suspense fallback={null}>
          <ReactionsHost />
        </Suspense>
      ) : !empty && props.mode === PRECURSORS_MODE ? (
        <Suspense fallback={null}>
          <PrecursorsHost onReactions={props.onReactions} />
        </Suspense>
      ) : EDITING && props.mode === WORKBENCH_MODE ? (
        <WorkbenchPage />
      ) : EDITING && props.mode === REVIEW_MODE ? (
        <Suspense fallback={null}>
          <ReviewHost />
        </Suspense>
      ) : (
        <DatasetView counts={props.counts} empty={empty} imports={imports} exports={props.exports} onAskReplace={props.onAskReplace} />
      )}
    </div>
  );
}

