/**
 * What the window shows on its canvas for the chosen mode (split out of window.tsx, step 7.2a): the navigator, the dataset page, the
 * Workbench, and the lazy views (Reactions and Precursors in BOTH editions; the review queue in Studio only).
 */
import { lazy, Suspense, useCallback, useRef } from "react";
import { NavigatorView } from "@/features/navigator";
import { RECORD_KINDS, type RecordKind } from "@/core/schema";
import { EDITING } from "@/app/edition";
import { useLayoutMode } from "@/ui/hooks";
import { PageSkeleton } from "@/ui/primitives";
import type { ExamScopeBinding } from "./exam-scope-selector";
import { usePanels, type ExplorerFilter } from "@/ui/state";
import { ExploreSwitch } from "./explore-switch";
import { LoadingLine } from "./loading-line";
import { useApp } from "./context";
import { DatasetActions } from "./dataset-actions";
import { FirstRun } from "./first-run";
import { CHAPTERS_MODE, EXPLORER_MODES, MECHANISMS_MODE, NAMED_MODE, SYLLABUS_MODE, NAVIGATOR_MODE, PRECURSORS_MODE, REACTIONS_MODE, REAGENTS_MODE, REVIEW_MODE, SETTINGS_MODE, WORKBENCH_MODE } from "./modes";
import { RecordCounts } from "./record-counts";
import type { ExportActions } from "./use-export-actions";
import type { ImportActions } from "./use-import-actions";
import { WorkbenchPage } from "./workbench-page";
import styles from "./window.module.css";

// the Reactions list: a lazy chunk in BOTH editions (step 7.1b)
const SettingsHost = lazy(() => import("./settings-host").then((m) => ({ default: m.SettingsHost })));
const ReactionsHost = lazy(() => import("./reactions-host").then((m) => ({ default: m.ReactionsHost })));
// the Chapters view: a lazy chunk in BOTH editions (step 7.3b)
const ChaptersHost = lazy(() => import("./chapters-host").then((m) => ({ default: m.ChaptersHost })));
// the Reagents view: a lazy chunk in BOTH editions (step 7.3c)
const ReagentsHost = lazy(() => import("./reagents-host").then((m) => ({ default: m.ReagentsHost })));
// the Named reactions and Mechanisms views: lazy chunks in BOTH editions (step 7.4)
const NamedHost = lazy(() => import("./named-host").then((m) => ({ default: m.NamedHost })));
const SyllabusHost = lazy(() => import("./syllabus-host").then((m) => ({ default: m.SyllabusHost })));
const MechanismsHost = lazy(() => import("./mechanisms-host").then((m) => ({ default: m.MechanismsHost })));
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
  /** The exam binding the Settings page's exam row uses (step 8.4f). */
  readonly exam?: ExamScopeBinding;
  readonly mode: string;
  readonly counts: Readonly<Record<RecordKind, number>>;
  readonly imports: ImportActions;
  readonly exports: ExportActions;
  readonly onAskReplace: () => void;
  /** Opens Reactions with this filter (the Precursors view's by-product line). */
  readonly onReactions: (filter: Partial<ExplorerFilter>) => void;
  /** Opens the inspector pane (a card of the Chapters view selects a record). */
  readonly openPane: () => void;
  /** Opens Reactions with the Substance filter set to this reagent (the Reagents page's button). */
  readonly onShowInReactions: (reagentId: string) => void;
  /** Opens Reactions with the Named reaction filter set to this record (the Named reactions page's button). */
  readonly onShowNamedInReactions: (namedReactionId: string) => void;
  /** Opens a named reaction's or a mechanism's page (the links between the pages) and a chapter's page. */
  readonly onNamed: (namedReactionId: string) => void;
  readonly onMechanism: (mechanismId: string) => void;
  readonly onChapter: (chapterId: string) => void;
  /** Opens the Syllabus view (the quiet link in the Chapters header). */
  readonly onSyllabus: () => void;
}) {
  const { panels } = useApp();
  const { imports } = props;
  const startedEmpty = usePanels(panels, (s) => s.startEmptyDismissed);
  const onStartEmpty = useCallback(
    () => panels.getState().dismissStartEmpty(),
    [panels],
  );
  const empty = totalOf(props.counts) === 0;
  // 8.4f D6: each change of view restarts a short opacity fade of the main column. The attribute alternates, so the CSS animation restarts without the column being remounted (focus stays).
  const fade = useRef({ mode: props.mode, n: 0 });
  if (fade.current.mode !== props.mode) fade.current = { mode: props.mode, n: fade.current.n + 1 };
  const phoneExplorer = useLayoutMode() === 'phone' && !empty && EXPLORER_MODES.includes(props.mode);
  const showsNavigator = !empty && props.mode === NAVIGATOR_MODE;
  return (
    <div className={`${showsNavigator ? styles.canvasFull : EDITING && props.mode === REVIEW_MODE ? styles.canvasFill : styles.canvas} ${styles.viewFade}`} data-fade={fade.current.n % 2 === 0 ? 'a' : 'b'}>
      {phoneExplorer ? <ExploreSwitch /> : null}
      {props.mode === SETTINGS_MODE && props.exam !== undefined ? (
        <Suspense fallback={<PageSkeleton label="Loading settings" shape="rows" />}>
          <SettingsHost exam={props.exam} />
        </Suspense>
      ) : empty && !startedEmpty ? (
        <FirstRun imports={imports} onStartEmpty={onStartEmpty} />
      ) : showsNavigator ? (
        <NavigatorView />
      ) : !empty && props.mode === CHAPTERS_MODE ? (
        <Suspense fallback={<LoadingLine />}>
          <ChaptersHost onSyllabus={props.onSyllabus} openPane={props.openPane} onNamed={props.onNamed} onMechanism={props.onMechanism} />
        </Suspense>
      ) : !empty && props.mode === REACTIONS_MODE ? (
        <Suspense fallback={<LoadingLine />}>
          <ReactionsHost />
        </Suspense>
      ) : !empty && props.mode === REAGENTS_MODE ? (
        <Suspense fallback={<LoadingLine />}>
          <ReagentsHost openPane={props.openPane} onShowInReactions={props.onShowInReactions} />
        </Suspense>
      ) : !empty && props.mode === NAMED_MODE ? (
        <Suspense fallback={<LoadingLine />}>
          <NamedHost openPane={props.openPane} onShowInReactions={props.onShowNamedInReactions} onMechanism={props.onMechanism} onChapter={props.onChapter} />
        </Suspense>
      ) : !empty && props.mode === MECHANISMS_MODE ? (
        <Suspense fallback={<LoadingLine />}>
          <MechanismsHost openPane={props.openPane} onChapter={props.onChapter} />
        </Suspense>
      ) : !empty && props.mode === SYLLABUS_MODE ? (
        <Suspense fallback={<LoadingLine />}>
          <SyllabusHost openPane={props.openPane} onChapter={props.onChapter} />
        </Suspense>
      ) : !empty && props.mode === PRECURSORS_MODE ? (
        <Suspense fallback={<LoadingLine />}>
          <PrecursorsHost onReactions={props.onReactions} />
        </Suspense>
      ) : EDITING && props.mode === WORKBENCH_MODE ? (
        <WorkbenchPage />
      ) : EDITING && props.mode === REVIEW_MODE ? (
        <Suspense fallback={<LoadingLine />}>
          <ReviewHost />
        </Suspense>
      ) : (
        <DatasetView counts={props.counts} empty={empty} imports={imports} exports={props.exports} onAskReplace={props.onAskReplace} />
      )}
    </div>
  );
}

