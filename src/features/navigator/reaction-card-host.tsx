/**
 * The card of a WHOLE reaction outside a family page (step 7.1b D3, ADR-042 E5): the Reactions list asks the app for a card host and the app
 * hands it this one (the explorer imports no other feature). It builds the same `FamilyEnv` the family page builds, from the same app-level
 * ports, asks core `reactionCard` for the card and draws `FamilyCardView`. A reaction with no card draws `fallback(reason)` instead.
 * No chemistry here: the card is the core's value.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { reactionCard } from '@/core/graph';
import { useStructureMode } from '@/render/svg';
import { useLayoutMode } from '@/ui/hooks';
import { depictionBindingOf, equationBindingOf } from './depictions';
import { FamilyCardView } from './family-card';
import { FamilyEnvContext, type FamilyEnv } from './family-env';
import { useNavigator } from './navigator-context';
import { touchOf } from './reads';
import { createScenePorts } from './scene-ports';
import { unscoped } from './scope-lens';

export interface ReactionCardHostProps {
  readonly reactionId: string;
  readonly selected: boolean;
  readonly onSelect: (reactionId: string) => void;
  /** Set when the reaction is outside the chosen exam scope: the words ("outside JEE Main"). */
  readonly outside?: string;
  /** Drawn when the reaction has no card, with the reason in words. */
  readonly fallback: (reason: string) => ReactNode;
  /** 7.3a C1: the ids of this GENERAL reaction's examples that fold under its card; their cards are drawn in the closed "Examples (n)" disclosure. */
  readonly examples?: readonly string[];
  /** 7.3a C2: the general reaction this card is an example of (its card is not in the list): "Example of <name>". */
  readonly exampleOf?: { readonly id: string; readonly name: string };
  /** The selected reaction (an example shows it) and the outside words of an example (7.3a C5). */
  readonly selectedId?: string | null;
  readonly outsideOf?: (reactionId: string) => string | undefined;
}

const NO_JUMP = (): void => undefined;

export function ReactionCardHost(props: ReactionCardHostProps) {
  const { ports } = useNavigator();
  const layout = useLayoutMode();
  const structureMode = useStructureMode(ports.depictions);
  const [version, setVersion] = useState(0);
  useEffect(() => ports.store.subscribe((changes) => touchOf(changes) !== 'none' && setVersion((v) => v + 1)), [ports]);
  const card = useMemo(
    () => reactionCard({ state: ports.store.getState(), indexes: ports.indexes.current(), scopeOf: unscoped }, props.reactionId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` re-makes the card when the data moved
    [ports, props.reactionId, version],
  );
  const exampleKey = (props.examples ?? []).join(' ');
  const exampleCards = useMemo(
    () =>
      (props.examples ?? []).flatMap((id) => {
        const one = reactionCard({ state: ports.store.getState(), indexes: ports.indexes.current(), scopeOf: unscoped }, id);
        return 'missing' in one ? [] : [one];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `exampleKey` is the examples' ids; `version` re-makes them when the data moved
    [ports, exampleKey, version],
  );
  const binding = depictionBindingOf(ports);
  const env = useMemo<FamilyEnv>(() => {
    const scene = createScenePorts(ports.store.getState(), binding?.keyOf);
    return { describe: scene.describe, keyOf: scene.depictionKeyOf, manager: binding?.manager, timers: ports.timers, layout, equation: { binding: equationBindingOf(ports), facts: ports.facts, structures: ports.structures } };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `structureMode` is read through the binding; it only has to make a new env; `version` re-makes it when the data moved
  }, [ports, binding, layout, structureMode, version]);
  if ('missing' in card) return <>{props.fallback(card.reason)}</>;
  return (
    <FamilyEnvContext.Provider value={env}>
      <FamilyCardView
        card={{ ...card, ...(exampleCards.length === 0 ? {} : { examples: exampleCards }), ...(props.exampleOf === undefined ? {} : { exampleOf: { reactionId: props.exampleOf.id, name: props.exampleOf.name } }) }}
        selected={props.selected}
        onSelect={props.onSelect}
        onGoToGroup={NO_JUMP}
        {...(props.outside === undefined ? {} : { outside: props.outside })}
        {...(props.outsideOf === undefined ? {} : { outsideOf: props.outsideOf })}
        {...(props.selectedId === undefined ? {} : { selectedId: props.selectedId })}
      />
    </FamilyEnvContext.Provider>
  );
}
