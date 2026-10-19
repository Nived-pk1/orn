/**
 * What each participant role means for the three flags when `flags` does not say (DOMAIN_MODEL §6.2). Data for the reaction editor's
 * words ("by default a catalyst is catalytic, is not consumed, contributes no atoms"); the validation and the balance checks keep their
 * own reading of the same table. A spectator never contributes atoms (RXN-004).
 */
import type { ParticipantRole } from '../schema';

export interface RoleFlagDefaults {
  readonly contributesAtoms: boolean;
  readonly consumed: boolean;
  readonly catalytic: boolean;
}

export const ROLE_FLAG_DEFAULTS: Readonly<Record<ParticipantRole, RoleFlagDefaults>> = {
  reactant: { contributesAtoms: true, consumed: true, catalytic: false },
  reagent: { contributesAtoms: true, consumed: true, catalytic: false },
  catalyst: { contributesAtoms: false, consumed: false, catalytic: true },
  solvent: { contributesAtoms: false, consumed: false, catalytic: false },
  initiator: { contributesAtoms: false, consumed: true, catalytic: false },
  promoter: { contributesAtoms: false, consumed: false, catalytic: false },
  additive: { contributesAtoms: false, consumed: false, catalytic: false },
  workup_reagent: { contributesAtoms: true, consumed: true, catalytic: false },
  spectator: { contributesAtoms: false, consumed: false, catalytic: false },
};
