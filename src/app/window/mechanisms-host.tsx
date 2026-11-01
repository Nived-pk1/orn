/**
 * The Mechanisms view on the canvas (step 7.4, ADR-042): the app composes the feature with the other features' renderers (the navigator's
 * reaction card, the inspector's rich text, pictures and small structure drawing), so the features never import each other. Its own lazy chunk in
 * BOTH editions; "Edit" is given only in Studio. Nothing here edits a record.
 */
import { useMemo } from 'react';
import { MechanismsView, type MechanismPorts } from '@/features/mechanism-explorer';
import { InspectorPictures, InspectorRichText, InspectorStructure } from '@/features/inspector';
import { ReactionCardHost, useNavigator } from '@/features/navigator';
import type { RecordRef } from '@/core/schema';
import { useApp } from './context';
import { useEditors } from './editors-access';

export function MechanismsHost(props: { readonly openPane: () => void; readonly onChapter: (chapterId: string) => void }) {
  const { openPane, onChapter } = props;
  const { inspector } = useApp();
  const { ports } = useNavigator();
  const editors = useEditors();
  const editNames = editors === null ? undefined : editors.editNames;
  const mechanisms = useMemo<MechanismPorts>(
    () => ({
      store: ports.store,
      indexes: ports.indexes,
      ui: { mechanisms: ports.ui.mechanisms, exam: ports.ui.exam, inspector: inspector.ui.inspector },
      renderRichText: (source) => <InspectorRichText ports={inspector} openPane={openPane} source={source} />,
      renderPictures: (target) => <InspectorPictures ports={inspector} openPane={openPane} target={target} />,
      ...(ports.facts === undefined ? {} : { facts: ports.facts }),
      renderStructure: (structure, name) => <InspectorStructure ports={inspector} openPane={openPane} structure={structure} name={name} />,
      select: (ref) => {
        inspector.ui.inspector.getState().open(ref);
        openPane();
      },
      selectReaction: (reactionId) => ports.ui.family.getState().selectReaction(reactionId),
      renderCard: (args) => <ReactionCardHost reactionId={args.reactionId} selected={args.selected} onSelect={args.onSelect} fallback={args.fallback} {...(args.outside === undefined ? {} : { outside: args.outside })} {...(args.examples === undefined ? {} : { examples: args.examples })} {...(args.selectedId === undefined ? {} : { selectedId: args.selectedId })} {...(args.outsideOf === undefined ? {} : { outsideOf: args.outsideOf })} />,
      openChapter: onChapter,
      ...(editNames === undefined ? {} : { edit: (mechanismId: string) => editNames({ kind: 'mechanism', id: mechanismId } as RecordRef) }),
      timers: ports.timers,
      log: ports.log,
    }),
    [ports, inspector, openPane, onChapter, editNames],
  );
  return <MechanismsView ports={mechanisms} />;
}
