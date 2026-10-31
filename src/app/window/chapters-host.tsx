/**
 * The Chapters view on the canvas (step 7.3b, ADR-042): the app composes the feature with the other features' renderers (the navigator's
 * card and substance box, the inspector's rich text and pictures, the Precursors view's stored route), so the features never import each
 * other. Its own lazy chunk in BOTH editions; the ports come from the app-level ports the navigator and the inspector already use.
 * Nothing here edits a record: selecting a card is the same UI event a family-page card sends.
 */
import { useMemo } from 'react';
import { ChaptersView, type ChaptersPorts } from '@/features/chapters';
import { InspectorPictures, InspectorRichText, nameOfRecord } from '@/features/inspector';
import { ReactionCardHost, SubstanceHost, useNavigator } from '@/features/navigator';
import { SavedRouteCard } from '@/features/precursor-explorer';
import type { RecordRef } from '@/core/schema';
import { useApp } from './context';

export function ChaptersHost(props: { readonly openPane: () => void }) {
  const { openPane } = props;
  const { inspector } = useApp();
  const { ports } = useNavigator();
  const chapters = useMemo<ChaptersPorts>(() => {
    const nameOf = (ref: RecordRef): string => {
      const record = (ports.store.getState().records[ref.kind] as Readonly<Record<string, Parameters<typeof nameOfRecord>[0]>>)[ref.id];
      return record === undefined ? ref.id : nameOfRecord(record);
    };
    const select = (ref: RecordRef): void => {
      inspector.ui.inspector.getState().open(ref);
      openPane();
    };
    return {
      store: ports.store,
      indexes: ports.indexes,
      ui: { chapters: ports.ui.chapters, exam: ports.ui.exam, inspector: inspector.ui.inspector },
      nameOf,
      select,
      selectReaction: (reactionId) => ports.ui.family.getState().selectReaction(reactionId),
      renderCard: (args) => <ReactionCardHost reactionId={args.reactionId} selected={args.selected} onSelect={args.onSelect} fallback={args.fallback} {...(args.outside === undefined ? {} : { outside: args.outside })} {...(args.examples === undefined ? {} : { examples: args.examples })} {...(args.selectedId === undefined ? {} : { selectedId: args.selectedId })} {...(args.outsideOf === undefined ? {} : { outsideOf: args.outsideOf })} />,
      renderRichText: (source) => <InspectorRichText ports={inspector} openPane={openPane} source={source} />,
      renderPictures: (target) => <InspectorPictures ports={inspector} openPane={openPane} target={target} />,
      renderSubstance: (substance) => <SubstanceHost substance={substance} />,
      renderRoute: (routeId, selected, onSelect) => (
        <SavedRouteCard
          routeId={routeId}
          selected={selected}
          ports={{
            store: ports.store,
            indexes: ports.indexes,
            select: onSelect,
            renderCard: (args) => <ReactionCardHost reactionId={args.reactionId} selected={args.selected} onSelect={args.onSelect} fallback={args.fallback} {...(args.outside === undefined ? {} : { outside: args.outside })} />,
          }}
        />
      ),
      timers: ports.timers,
      log: ports.log,
    };
  }, [ports, inspector, openPane]);
  return <ChaptersView ports={chapters} />;
}
