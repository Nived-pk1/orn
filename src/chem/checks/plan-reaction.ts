/**
 * The CHEM-005 requests of a reaction (main side, pure). The rule's own condition: "only when every participant and product is a
 * species with structure and coefficient". Participants that contribute atoms are the ones DOMAIN_MODEL §6.2 says do (reactant,
 * reagent, workup reagent; a spectator never; `flags.contributesAtoms` overrides the role). An outcome that does not meet the
 * condition is not sent and is listed as "not compared" with the first reason. An outcome that holds under several condition
 * variants which add different participants has no single set of reactants and is not compared either.
 */
import type { CanonicalState, Participant, ParticipantRole, Reaction } from '@/core/schema';
import type { BalanceRequest, BalanceSide, NotCompared } from './contracts';

const CONTRIBUTES: Readonly<Record<ParticipantRole, boolean>> = {
  reactant: true,
  reagent: true,
  workup_reagent: true,
  catalyst: false,
  solvent: false,
  initiator: false,
  promoter: false,
  additive: false,
  spectator: false,
};

export const contributesAtoms = (participant: Participant): boolean =>
  participant.role === 'spectator' ? false : (participant.flags?.contributesAtoms ?? CONTRIBUTES[participant.role]);

export interface BalancePlan {
  readonly requests: readonly BalanceRequest[];
  readonly notCompared: readonly NotCompared[];
}

function side(state: CanonicalState, label: string, ref: { readonly kind: string; readonly id: string }, coefficient: number | undefined): BalanceSide | string {
  if (ref.kind !== 'species') return `${label} is a ${ref.kind}, not a species`;
  const species = Object.hasOwn(state.records.species, ref.id) ? state.records.species[ref.id] : undefined;
  if (species?.structure === undefined) return `${label} (${ref.id}) has no structure`;
  if (coefficient === undefined) return `${label} has no coefficient`;
  return { label, structure: species.structure, coefficient };
}

export function balancePlan(state: CanonicalState, reaction: Reaction): BalancePlan {
  const requests: BalanceRequest[] = [];
  const notCompared: NotCompared[] = [];
  const inVariants = new Set(reaction.conditionVariants.flatMap((variant) => variant.participantIds));
  for (const [i, outcome] of reaction.outcomes.entries()) {
    const path = `outcomes[${i}]`;
    const skip = (why: string): void => void notCompared.push({ ruleId: 'CHEM-005', reason: `${path} was not compared: ${why}` });
    const applicable = reaction.conditionVariants.filter((variant) => outcome.conditionVariantIds.length === 0 || outcome.conditionVariantIds.includes(variant.id));
    const adding = applicable.filter((variant) => variant.participantIds.length > 0);
    if (adding.length > 1) {
      skip('it holds under several condition variants that add different participants');
      continue;
    }
    const extra = new Set(adding[0]?.participantIds ?? []);
    const counted = reaction.participants.filter((p) => (!inVariants.has(p.id) || extra.has(p.id)) && contributesAtoms(p));
    if (counted.length === 0 || outcome.products.length === 0) {
      skip(counted.length === 0 ? 'no participant contributes atoms' : 'it has no products');
      continue;
    }
    const reactants = counted.map((p) => side(state, p.id, p.ref, p.coefficient));
    const products = outcome.products.map((p) => side(state, p.id, p.ref, p.coefficient));
    const problem = [...reactants, ...products].find((s): s is string => typeof s === 'string');
    if (problem !== undefined) {
      skip(problem);
      continue;
    }
    requests.push({ path, reactants: reactants as BalanceSide[], products: products as BalanceSide[] });
  }
  return { requests, notCompared };
}
