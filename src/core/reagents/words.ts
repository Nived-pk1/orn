/**
 * "How it is used here" in words (7.3c C3): one tested function for what a participant says about its reagent. Role first (with the stage when
 * the reaction has two or more), then the modifiers after a dot: "reagent · alcoholic", "catalyst · aqueous, dilute", "work-up reagent, stage 2".
 * The words are the stored values, nothing is judged.
 */
import type { ParticipantRole } from '../schema';

export interface UsedFacts {
  readonly role: ParticipantRole;
  readonly phase?: string;
  readonly strength?: string;
  readonly dry?: boolean;
  /** The quantity as written (its text, else equivalents and qualifier). */
  readonly quantity?: string;
  /** Only when the reaction has two or more stages: this participant's stage (1-based) of how many. */
  readonly stage?: { readonly position: number; readonly of: number };
}

const ROLE_WORDS: Readonly<Record<ParticipantRole, string>> = {
  reactant: 'reactant',
  reagent: 'reagent',
  catalyst: 'catalyst',
  solvent: 'solvent',
  initiator: 'initiator',
  promoter: 'promoter',
  additive: 'additive',
  workup_reagent: 'work-up reagent',
  spectator: 'spectator',
};

const PHASE_WORDS: Readonly<Record<string, string>> = { s: 'solid', l: 'liquid', g: 'gas', aq: 'aqueous', alc: 'alcoholic', soln: 'in solution', melt: 'molten' };

export function howUsedWords(facts: UsedFacts): string {
  const head = `${ROLE_WORDS[facts.role]}${facts.stage === undefined ? '' : `, stage ${facts.stage.position}`}`;
  const mods = [
    facts.phase === undefined ? undefined : (PHASE_WORDS[facts.phase] ?? facts.phase),
    facts.strength,
    facts.dry === true ? 'dry' : undefined,
    facts.quantity,
  ].filter((word): word is string => word !== undefined && word !== '');
  return mods.length === 0 ? head : `${head} · ${mods.join(', ')}`;
}
