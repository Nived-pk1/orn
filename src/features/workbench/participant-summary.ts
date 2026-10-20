/** The summary line of a collapsed participant row (step 6.3b decision D1): "2. Ethanol · Reactant · ×2 · aq · Concentrated". Text only. */
import { wordsOf } from './reagent-model';
import type { ParticipantView } from './participant-model';

/**
 * Number, name and then each part that is STATED (role, coefficient, phase, strength), joined by middle dots; a part that is not stated is
 * left out (never "Not stated"). `name` is undefined for a participant with no substance.
 */
export function summaryLineOf(n: number, name: string | undefined, p: ParticipantView): string {
  const parts = [
    `${n}. ${name === undefined ? 'No substance' : name}`,
    p.role === '' ? undefined : wordsOf(p.role),
    p.coefficient === undefined ? undefined : `×${p.coefficient}`,
    p.phase === '' ? undefined : p.phase,
    p.strength === '' ? undefined : wordsOf(p.strength),
  ];
  return parts.filter((part): part is string => part !== undefined).join(' · ');
}
