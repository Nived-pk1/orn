/**
 * The ten v6 participant roles and what each becomes (docs/MIGRATION.md §4.5): the ORN role, the group that decides where the
 * participant goes (stage 1, the workup stage, the one outcome, the intermediates), and what kind of record a label-only participant
 * of that role needs. A plain lookup by OWN keys: `toString` is not a role here, although v6's own table would count it as one.
 */
import type { ParticipantRole } from '@/core/schema';
import type { SubstanceNeed } from './reaction-substances';

export type RoleGroup = 'reactant_like' | 'workup' | 'product' | 'byproduct' | 'intermediate';

export interface RoleInfo {
  readonly role?: ParticipantRole;
  readonly group: RoleGroup;
  readonly need: SubstanceNeed;
  readonly primary?: boolean;
}

export const ROLES: ReadonlyMap<string, RoleInfo> = new Map<string, RoleInfo>([
  ['substrate', { role: 'reactant', group: 'reactant_like', need: 'substance', primary: true }],
  ['reactant', { role: 'reactant', group: 'reactant_like', need: 'substance' }],
  ['reagent', { role: 'reagent', group: 'reactant_like', need: 'reagent_like' }],
  ['catalyst', { role: 'catalyst', group: 'reactant_like', need: 'reagent_like' }],
  ['solvent', { role: 'solvent', group: 'reactant_like', need: 'reagent_like' }],
  ['spectator', { role: 'spectator', group: 'reactant_like', need: 'reagent_like' }],
  ['workup', { role: 'workup_reagent', group: 'workup', need: 'reagent_like' }],
  ['product', { group: 'product', need: 'product' }],
  ['byproduct', { group: 'byproduct', need: 'product' }],
  ['intermediate', { group: 'intermediate', need: 'product' }],
]);
/** What an unrecognised role becomes: v6's own default. */
export const UNKNOWN_ROLE: RoleInfo = { role: 'reagent', group: 'reactant_like', need: 'reagent_like' };

