/** The inspector with what only the window knows: the arrows on the canvas, whether the navigator is shown, how to open the pane (moved out of window.tsx for its size, step 8.4g Part B). */
import { useMemo } from 'react';
import { Inspector, type InspectorHost } from '@/features/inspector';
import { useNavigator } from '@/features/navigator';
import { REPORT_ADDRESS } from '@/app/report-config';
import type { RecordRef } from '@/core/schema';
import type { ExplorerFilter } from '@/ui/state';
import { useApp } from './context';
import { useEditors } from './editors-access';
import { filterFor } from './reactions-entry';
import { useStarsPort } from './my-records-host';

export function InspectorPanel(props: {
  readonly navigatorShown: boolean;
  readonly explorerShown: boolean;
  readonly openPane: () => void;
  readonly closePane: () => void;
  readonly onReactions: (filter: Partial<ExplorerFilter>) => void;
  readonly onPrecursors: (ref: RecordRef) => void;
  readonly onChapter: (chapterId: string) => void;
  readonly onReagent: (reagentId: string) => void;
  readonly onNamed: (namedReactionId: string) => void;
  readonly onMechanism: (mechanismId: string) => void;
}) {
  const { inspector } = useApp();
  const editors = useEditors();
  const { model } = useNavigator();
  const stars = useStarsPort();
  const { navigatorShown, explorerShown, openPane, closePane, onReactions, onPrecursors, onChapter, onReagent, onNamed, onMechanism } = props;
  const host = useMemo<InspectorHost>(
    () => ({
      openPane,
      closePane,
      report: { address: REPORT_ADDRESS, version: __ORN_VERSION__ },
      ...(stars === undefined ? {} : { stars }),
      navigatorShown,
      explorerShown,
      showReactions: (ref) => {
        const filter = filterFor(ref);
        if (filter !== undefined) onReactions(filter);
      },
      showPrecursors: onPrecursors,
      showReagent: (ref) => onReagent(ref.id),
      showNamed: (ref) => onNamed(ref.id),
      showMechanism: (ref) => onMechanism(ref.id),
      openChapter: onChapter,
      showArrowReactions: (ends) => onReactions({ fromFamilyIds: [ends.from], toFamilyIds: [ends.to] }),
      ...(editors === null ? {} : { editNames: { unavailable: editors.editReason, open: editors.editNames, ...(editors.requestDelete === undefined ? {} : { remove: editors.requestDelete }), ...(editors.startFrom === undefined ? {} : { startFrom: editors.startFrom }), ...(editors.fullEditorKinds === undefined ? {} : { fullEditorKinds: editors.fullEditorKinds }), ...(editors.namesKinds === undefined ? {} : { namesKinds: editors.namesKinds }) } }),
      edgeEnds: (edgeId) => {
        const edge = model.getState().scene?.edges.find((e) => e.id === edgeId);
        return edge === undefined ? undefined : { from: edge.from, to: edge.to };
      },
    }),
    [stars, model, navigatorShown, explorerShown, openPane, closePane, editors, onReactions, onPrecursors, onChapter, onReagent, onNamed, onMechanism],
  );
  return <Inspector ports={inspector} host={host} />;
}
