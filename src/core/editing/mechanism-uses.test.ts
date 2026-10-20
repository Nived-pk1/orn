/** Which outcomes link a mechanism, and its variants (step 6.5a, D3 and D5): derived from the canonical state, nothing stored. */
import { describe, expect, it } from 'vitest';
import { documentToState } from '@/core/dataset';
import { buildDemoDocument } from '@/test-support/demo';
import { outcomeUsesOfMechanism, outcomeUsesOfVariant } from './mechanism-uses';

const parsed = documentToState(buildDemoDocument());
if (!parsed.ok) throw new Error('demo dataset has duplicate IDs');
const state = parsed.state;

describe('outcomeUsesOfMechanism', () => {
  it('lists every outcome that links the mechanism, with its reaction, its number and its variant', () => {
    const uses = outcomeUsesOfMechanism(state, 'mec_aldol-ethanal');
    expect(uses.map((u) => [u.reactionId, u.outcomeNumber, u.variantId])).toEqual([
      ['rxn_ethanal-aldol', 1, 'mvr_aldol-base'],
      ['rxn_ethanal-aldol', 2, 'mvr_aldol-acid'],
    ]);
    expect(uses[0]?.reactionName).toBe(state.records.reaction['rxn_ethanal-aldol' as never]?.name);
  });

  it('a mechanism no outcome links has no uses', () => {
    expect(outcomeUsesOfMechanism(state, 'mec_does-not-exist')).toEqual([]);
  });
});

describe('outcomeUsesOfVariant', () => {
  it('lists the outcomes that link that variant only', () => {
    expect(outcomeUsesOfVariant(state, 'mec_aldol-ethanal', 'mvr_aldol-acid').map((u) => u.outcomeNumber)).toEqual([2]);
    expect(outcomeUsesOfVariant(state, 'mec_aldol-ethanal', 'mvr_none')).toEqual([]);
  });
});
