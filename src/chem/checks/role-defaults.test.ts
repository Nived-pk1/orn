/** The editor's role table agrees with the balance check's own reading of the roles (a drift would tell a person one thing and check another). */
import { describe, expect, it } from 'vitest';
import { ROLE_FLAG_DEFAULTS } from '@/core/editing';
import { PARTICIPANT_ROLES, type Participant } from '@/core/schema';
import { contributesAtoms } from './plan-reaction';

describe('ROLE_FLAG_DEFAULTS and contributesAtoms', () => {
  it.each([...PARTICIPANT_ROLES])('%s', (role) => {
    const participant = { id: 'prt_x', ref: { kind: 'species', id: 'spc_x' }, role } as unknown as Participant;
    expect(contributesAtoms(participant)).toBe(ROLE_FLAG_DEFAULTS[role].contributesAtoms);
  });
});
