/** The role flag defaults of DOMAIN_MODEL §6.2, as data for the reaction editor (step 6.3a decision D2). */
import { describe, expect, it } from 'vitest';
import { PARTICIPANT_ROLES } from '../schema';
import { ROLE_FLAG_DEFAULTS } from './role-defaults';

describe('ROLE_FLAG_DEFAULTS', () => {
  it('has every role of the schema, and nothing else', () => {
    expect(Object.keys(ROLE_FLAG_DEFAULTS).sort()).toEqual([...PARTICIPANT_ROLES].sort());
  });

  it('is the table of DOMAIN_MODEL §6.2 (contributesAtoms / consumed / catalytic)', () => {
    const row = (r: keyof typeof ROLE_FLAG_DEFAULTS) => {
      const d = ROLE_FLAG_DEFAULTS[r];
      return [d.contributesAtoms, d.consumed, d.catalytic];
    };
    expect(row('reactant')).toEqual([true, true, false]);
    expect(row('reagent')).toEqual([true, true, false]);
    expect(row('catalyst')).toEqual([false, false, true]);
    expect(row('solvent')).toEqual([false, false, false]);
    expect(row('initiator')).toEqual([false, true, false]);
    expect(row('promoter')).toEqual([false, false, false]);
    expect(row('additive')).toEqual([false, false, false]);
    expect(row('workup_reagent')).toEqual([true, true, false]);
    expect(row('spectator')).toEqual([false, false, false]);
  });
});
