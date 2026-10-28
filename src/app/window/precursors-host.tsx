/**
 * The Precursors view on the canvas (step 7.2a, ADR-042 style): the app composes the feature with the navigator's card host and the app's
 * route service, so the features never import each other. Its own lazy chunk in BOTH editions; the ports come from the app-level ports the
 * navigator and the search already use. Nothing here edits a record: selecting a reaction is the same UI event a family-page card sends.
 */
import { useMemo } from 'react';
import { PrecursorsView, type PrecursorPorts } from '@/features/precursor-explorer';
import { ReactionCardHost, useNavigator } from '@/features/navigator';
import type { RecordRef } from '@/core/schema';
import { useApp } from './context';

/** A route ends at, and starts from, a species or a class (never a reagent). */
const SUBSTANCE_KINDS = ['species', 'class'] as const;
const SUBSTANCE_LIMIT = 20;
const CHANNEL = 'precursors';

export function PrecursorsHost() {
  const { services } = useApp();
  const { ports } = useNavigator();
  const precursors = useMemo<PrecursorPorts>(
    () => ({
      store: ports.store,
      indexes: ports.indexes,
      ui: { precursors: ports.ui.precursors, explorer: ports.ui.explorer, exam: ports.ui.exam, family: ports.ui.family },
      async searchSubstances(text) {
        const answer = await services.search.search(CHANNEL, { text, kinds: [...SUBSTANCE_KINDS], limit: SUBSTANCE_LIMIT });
        return answer.ok ? { ok: true, hits: answer.value.map((hit) => ({ ref: hit.ref as RecordRef, title: hit.title })) } : { ok: false, message: answer.message };
      },
      findRoutes: (query, signal) => services.routes(query, signal),
      select: (reactionId) => ports.ui.family.getState().selectReaction(reactionId),
      renderCard: (args) => <ReactionCardHost reactionId={args.reactionId} selected={args.selected} onSelect={args.onSelect} fallback={args.fallback} {...(args.outside === undefined ? {} : { outside: args.outside })} />,
      timers: ports.timers,
      log: ports.log,
    }),
    [ports, services],
  );
  return <PrecursorsView ports={precursors} />;
}
