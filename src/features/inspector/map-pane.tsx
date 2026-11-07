/**
 * The arrow and bucket views wired to the inspector's ports (step 8.2b-fix, S2, S3). A lazy chunk: nothing here loads until an arrow or the
 * "Not in a family yet" box is first selected. A tap on a family or on the bucket (an end card, a chip) is a pick on the map: it selects
 * the node, focuses it and the bridge shows it; a tap on a row opens the real record.
 */
import { useMemo, type ReactNode } from 'react';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { InspectorEntry } from '@/ui/state';
import { SHEET_TITLE_ID } from '@/ui/shell';
import { HistoryButtons } from './history-buttons';
import { ArrowReactions } from './arrow-reactions';
import { ArrowPane, BucketPane, type MapViewActions } from './map-views';
import { mapInspectorView } from './model/map-inspector-view';
import type { InspectorPorts } from './contracts';

export function MapPane(props: {
  readonly entry: InspectorEntry;
  readonly state: CanonicalState;
  readonly edition: 'study' | 'studio';
  readonly ports: InspectorPorts;
  readonly open: (ref: RecordRef) => void;
  /** What shows when the selection names nothing that exists (an arrow that is gone). */
  readonly empty: ReactNode;
}) {
  const { entry, state, edition, ports, open } = props;
  const view = useMemo(() => mapInspectorView(entry, { state, indexes: ports.indexes.current() }, edition), [entry, state, ports, edition]);
  const base = useMemo(
    () => ({
      focusEnd: (id: string): void => {
        ports.ui.selection.getState().select({ kind: 'node', id });
        ports.ui.map?.getState().setFocus(id);
      },
      open,
      openArrow: (from: string, to: string): void => ports.ui.inspector.getState().select({ kind: 'arrow', from, to }),
      titleId: SHEET_TITLE_ID,
      history: <HistoryButtons inspector={ports.ui.inspector} />,
    }),
    [ports, open],
  );
  if (view.kind === 'empty' || view.kind === 'record') return <>{props.empty}</>;
  if (view.kind === 'bucket') return <BucketPane view={view} actions={base} />;
  const words = new Map(view.reactions.map((row) => [row.id, row.parts]));
  const actions: MapViewActions = { ...base, reactionsList: <ArrowReactions ends={{ from: view.from.id, to: view.to.id }} words={words} /> };
  return <ArrowPane view={view} actions={actions} />;
}
