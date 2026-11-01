/**
 * The Reagents view on the canvas (step 7.3c, ADR-042): the app composes the feature with the other features' renderers (the navigator's
 * reaction card, the inspector's rich text and condition words), so the features never import each other. Its own lazy chunk in BOTH
 * editions; "Edit" is given only in Studio (the editors' own entry point, which is Study-inert). Nothing here edits a record.
 */
import { useMemo } from 'react';
import { ReagentsView, type ReagentsPorts } from '@/features/reagent-explorer';
import { InspectorRichText, nameOfRecord } from '@/features/inspector';
import { parameterPhrases } from '@/features/inspector/model/conditions';
import { ReactionCardHost, useNavigator } from '@/features/navigator';
import type { RecordRef } from '@/core/schema';
import { useApp } from './context';
import { useEditors } from './editors-access';

export function ReagentsHost(props: { readonly openPane: () => void; readonly onShowInReactions: (reagentId: string) => void }) {
  const { openPane, onShowInReactions } = props;
  const { inspector } = useApp();
  const { ports } = useNavigator();
  const editors = useEditors();
  const editNames = editors === null ? undefined : editors.editNames;
  const reagents = useMemo<ReagentsPorts>(
    () => ({
      store: ports.store,
      indexes: ports.indexes,
      ui: { reagents: ports.ui.reagents, exam: ports.ui.exam, inspector: inspector.ui.inspector },
      nameOf: (ref: RecordRef): string => {
        const record = (ports.store.getState().records[ref.kind] as Readonly<Record<string, Parameters<typeof nameOfRecord>[0]>>)[ref.id];
        return record === undefined ? ref.id : nameOfRecord(record);
      },
      conditionPhrases: parameterPhrases,
      renderRichText: (source) => <InspectorRichText ports={inspector} openPane={openPane} source={source} />,
      select: (ref) => {
        inspector.ui.inspector.getState().open(ref);
        openPane();
      },
      selectReaction: (reactionId) => ports.ui.family.getState().selectReaction(reactionId),
      renderCard: (args) => <ReactionCardHost reactionId={args.reactionId} selected={args.selected} onSelect={args.onSelect} fallback={args.fallback} {...(args.outside === undefined ? {} : { outside: args.outside })} {...(args.examples === undefined ? {} : { examples: args.examples })} {...(args.selectedId === undefined ? {} : { selectedId: args.selectedId })} {...(args.outsideOf === undefined ? {} : { outsideOf: args.outsideOf })} />,
      showInReactions: onShowInReactions,
      ...(editNames === undefined ? {} : { edit: (reagentId: string) => editNames({ kind: 'reagent', id: reagentId } as RecordRef) }),
      timers: ports.timers,
      log: ports.log,
    }),
    [ports, inspector, openPane, onShowInReactions, editNames],
  );
  return <ReagentsView ports={reagents} />;
}
