/**
 * The mechanism editor's links port (step 6.5a): which outcomes of which reactions use a mechanism variant (the core's derivation over the
 * canonical state at the moment of asking) and whether a record a [[link]] names exists. Pure wiring; nothing is stored. No chemistry.
 */
import { outcomeUsesOfVariant } from '@/core/editing';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { MechanismLinksPort } from '@/features/workbench';

export function createMechanismLinks(state: () => CanonicalState): MechanismLinksPort {
  return {
    variantUses: (mechanismId, variantId) => outcomeUsesOfVariant(state(), mechanismId, variantId),
    exists: (ref: RecordRef) => (state().records[ref.kind] as Readonly<Record<string, unknown>>)[ref.id] !== undefined,
  };
}
