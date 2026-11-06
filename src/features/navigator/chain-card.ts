/**
 * The cards of "From A to B" (step 8.3b, B2.1): each chain is one card. Not chosen, it holds its title and one summary line; chosen (one at a
 * time), it also holds its step rows. Pure: the panel draws what this says.
 */
export interface ChainCardInput {
  readonly families: readonly string[];
  readonly steps: readonly { readonly from: string; readonly to: string }[];
}

export interface ChainCardStep {
  readonly from: string;
  readonly to: string;
  readonly title: string;
  readonly reactions: number;
}

export interface ChainCard {
  readonly key: string;
  readonly title: string;
  readonly summary: string;
  readonly chosen: boolean;
  /** Only on the chosen card. */
  readonly steps: readonly ChainCardStep[] | undefined;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function chainCardsOf(
  chains: readonly ChainCardInput[],
  picked: number,
  words: { readonly nameOf: (id: string) => string; readonly reactionsOf: (from: string, to: string) => number },
): readonly ChainCard[] {
  const at = picked >= 0 && picked < chains.length ? picked : 0;
  return chains.map((chain, index) => {
    const steps = chain.steps.map((step) => ({ from: step.from, to: step.to, title: `${words.nameOf(step.from)} → ${words.nameOf(step.to)}`, reactions: words.reactionsOf(step.from, step.to) }));
    const total = steps.reduce((sum, step) => sum + step.reactions, 0);
    const chosen = index === at;
    return {
      key: chain.families.join('>'),
      title: chain.families.map(words.nameOf).join(' → '),
      summary: `${plural(steps.length, 'step', 'steps')} · ${plural(total, 'reaction', 'reactions')}`,
      chosen,
      steps: chosen ? steps : undefined,
    };
  });
}
