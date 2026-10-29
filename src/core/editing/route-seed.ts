/**
 * The draft of a route made from a FOUND route (7.2b C2): a seed for `openSession`, nothing saved. The engine's route is a chain, first step
 * first, so each step takes its input from the one before (derived, not guessed). A step keeps its reaction and outcome; its condition
 * variant only when the engine names exactly one (the schema holds one; none or several are left unset rather than chosen). The name is
 * empty and required; the purpose is `user` (a route a person saved). Pure; no chemistry.
 */
export interface FoundStepLike {
  readonly reactionId: string;
  readonly outcomeId: string;
  readonly conditionVariantIds: readonly string[];
}

export function routeSeedOf(found: { readonly steps: readonly FoundStepLike[]; readonly target: { readonly kind: string; readonly id: string } }, newId: (prefix: string) => string): Readonly<Record<string, unknown>> {
  const ids = found.steps.map(() => newId('rst'));
  return {
    name: '',
    purpose: 'user',
    target: { kind: found.target.kind, id: found.target.id },
    steps: found.steps.map((step, index) => ({
      id: ids[index],
      reactionId: step.reactionId,
      outcomeId: step.outcomeId,
      ...(step.conditionVariantIds.length === 1 ? { conditionVariantId: step.conditionVariantIds[0] } : {}),
      inputFromStepIds: index === 0 ? [] : [ids[index - 1]],
    })),
  };
}
