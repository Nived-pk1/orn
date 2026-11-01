/**
 * The Named reactions view on the canvas (step 7.4, ADR-042): the app composes the feature with the other features' renderers (the navigator's
 * reaction card, the inspector's rich text and pictures), so the features never import each other. Its own lazy chunk in BOTH editions; "Edit"
 * is given only in Studio (the editors' own entry point, which is Study-inert). Nothing here edits a record.
 */
import { useMemo } from 'react';
import { NamedView, type NamedPorts } from '@/features/named-explorer';
import { InspectorPictures, InspectorRichText } from '@/features/inspector';
import { ReactionCardHost, useNavigator } from '@/features/navigator';
import type { RecordRef } from '@/core/schema';
import { useApp } from './context';
import { useEditors } from './editors-access';

export function NamedHost(props: { readonly openPane: () => void; readonly onShowInReactions: (namedReactionId: string) => void; readonly onMechanism: (mechanismId: string) => void; readonly onChapter: (chapterId: string) => void }) {
  const { openPane, onShowInReactions, onMechanism, onChapter } = props;
  const { inspector } = useApp();
  const { ports } = useNavigator();
  const editors = useEditors();
  const editNames = editors === null ? undefined : editors.editNames;
  const named = useMemo<NamedPorts>(
    () => ({
      store: ports.store,
      indexes: ports.indexes,
      ui: { named: ports.ui.named, exam: ports.ui.exam, inspector: inspector.ui.inspector },
      renderRichText: (source) => <InspectorRichText ports={inspector} openPane={openPane} source={source} />,
      renderPictures: (target) => <InspectorPictures ports={inspector} openPane={openPane} target={target} />,
      select: (ref) => {
        inspector.ui.inspector.getState().open(ref);
        openPane();
      },
      selectReaction: (reactionId) => ports.ui.family.getState().selectReaction(reactionId),
      renderCard: (args) => <ReactionCardHost reactionId={args.reactionId} selected={args.selected} onSelect={args.onSelect} fallback={args.fallback} {...(args.outside === undefined ? {} : { outside: args.outside })} {...(args.examples === undefined ? {} : { examples: args.examples })} {...(args.selectedId === undefined ? {} : { selectedId: args.selectedId })} {...(args.outsideOf === undefined ? {} : { outsideOf: args.outsideOf })} {...(args.hideNamedId === undefined ? {} : { hideNamedId: args.hideNamedId })} />,
      showInReactions: onShowInReactions,
      openMechanism: onMechanism,
      openChapter: onChapter,
      ...(editNames === undefined ? {} : { edit: (namedReactionId: string) => editNames({ kind: 'named_reaction', id: namedReactionId } as RecordRef) }),
      timers: ports.timers,
      log: ports.log,
    }),
    [ports, inspector, openPane, onShowInReactions, onMechanism, onChapter, editNames],
  );
  return <NamedView ports={named} />;
}
