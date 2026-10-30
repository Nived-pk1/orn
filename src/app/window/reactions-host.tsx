/**
 * The Reactions view on the canvas (step 7.1b, ADR-042 E9): the app composes the explorer feature with the navigator's card host, so the
 * two features never import each other. Its own lazy chunk in BOTH editions; the ports come from the app-level ports the navigator and the
 * search already use. Nothing here edits a record: selecting a reaction is the same UI event a family-page card sends.
 */
import { useMemo } from 'react';
import { ReactionsView, type ExplorerPorts } from '@/features/reaction-explorer';
import { ReactionCardHost, useNavigator } from '@/features/navigator';
import type { RecordRef } from '@/core/schema';
import { useApp } from './context';

/** The substance search asks for these kinds only (species, classes and reagents), as the picker says. */
const SUBSTANCE_KINDS = ['species', 'class', 'reagent'] as const;
const SUBSTANCE_LIMIT = 20;
const CHANNEL = 'explorer';

export function ReactionsHost() {
  const { services } = useApp();
  const { ports } = useNavigator();
  const explorer = useMemo<ExplorerPorts>(
    () => ({
      store: ports.store,
      indexes: ports.indexes,
      ui: { explorer: ports.ui.explorer, exam: ports.ui.exam, family: ports.ui.family },
      async searchSubstances(text) {
        const answer = await services.search.search(CHANNEL, { text, kinds: [...SUBSTANCE_KINDS], limit: SUBSTANCE_LIMIT });
        return answer.ok ? { ok: true, hits: answer.value.map((hit) => ({ ref: hit.ref as RecordRef, title: hit.title })) } : { ok: false, message: answer.message };
      },
      select: (reactionId) => ports.ui.family.getState().selectReaction(reactionId),
      renderCard: (args) => <ReactionCardHost reactionId={args.reactionId} selected={args.selected} onSelect={args.onSelect} fallback={args.fallback} {...(args.outside === undefined ? {} : { outside: args.outside })} {...(args.examples === undefined ? {} : { examples: args.examples })} {...(args.exampleOf === undefined ? {} : { exampleOf: args.exampleOf })} {...(args.selectedId === undefined ? {} : { selectedId: args.selectedId })} {...(args.outsideOf === undefined ? {} : { outsideOf: args.outsideOf })} />,
      timers: ports.timers,
      log: ports.log,
    }),
    [ports, services],
  );
  return <ReactionsView ports={explorer} />;
}
