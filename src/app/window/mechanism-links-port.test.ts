/** The mechanism links port over the demo state (step 6.5a): the outcomes using a variant, and whether a linked record exists. */
import { describe, expect, it } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { createMechanismLinks } from './mechanism-links-port';

const links = createMechanismLinks(() => demoState());

describe('createMechanismLinks', () => {
  it('names the outcome that uses a variant', () => {
    const uses = links.variantUses('mec_e2-haloalkane', 'mvr_e2-hofmann');
    expect(uses.map((u) => [u.reactionId, u.outcomeNumber])).toEqual([['rxn_r-2-bromobutane-alc-koh', 2]]);
    expect(links.variantUses('mec_e2-haloalkane', 'mvr_new')).toEqual([]);
  });
  it('knows which records exist', () => {
    expect(links.exists({ kind: 'reaction', id: 'rxn_ethanal-aldol' })).toBe(true);
    expect(links.exists({ kind: 'reaction', id: 'rxn_nope' })).toBe(false);
  });
});
