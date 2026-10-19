/** The words of the participant rows: the role's default flags in a sentence, and the flag choices beside them (step 6.3a decision D2). */
import { ROLE_FLAG_DEFAULTS } from '@/core/editing';
import type { ParticipantRole } from '@/core/schema';
import type { FlagName } from './participant-model';

export const FLAG_LABELS: Readonly<Record<FlagName, string>> = {
  contributesAtoms: 'Contributes atoms to the products',
  consumed: 'Is consumed',
  catalytic: 'Is catalytic',
};
export const FLAG_NAMES: readonly FlagName[] = ['contributesAtoms', 'consumed', 'catalytic'];

const isRole = (role: string): role is ParticipantRole => Object.hasOwn(ROLE_FLAG_DEFAULTS, role);

/** The default of one flag for a role, "yes" or "no" ("no" for an unknown role: nothing is claimed). */
export function defaultOf(role: string, flag: FlagName): 'yes' | 'no' {
  return isRole(role) && ROLE_FLAG_DEFAULTS[role][flag] ? 'yes' : 'no';
}

/** "By default a catalyst contributes no atoms, is not consumed and is catalytic." */
export function roleDefaultsWords(role: string): string {
  if (!isRole(role)) return 'Choose a role to see what it means by default.';
  const d = ROLE_FLAG_DEFAULTS[role];
  const name = role.replace(/_/g, ' ');
  const parts = [d.contributesAtoms ? 'contributes atoms' : 'contributes no atoms', d.consumed ? 'is consumed' : 'is not consumed', d.catalytic ? 'is catalytic' : 'is not catalytic'];
  return `By default a ${name} ${parts[0]}, ${parts[1]} and ${parts[2]}${role === 'spectator' ? ' (a spectator never contributes atoms)' : ''}.`;
}
