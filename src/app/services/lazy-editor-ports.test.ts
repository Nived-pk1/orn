/** The draft and duplicate checks load their module on the first ask (step 6.5a: the entry chunk carries only the thin wrappers). */
import { describe, expect, it } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { loadFixtureState } from '@/test-support/state-fixture';
import { lazyDraftChecks, lazyDuplicateCheck } from './lazy-editor-ports';

const MAX = loadFixtureState('maximal-valid');
const store = createCanonicalStore({ initial: MAX, revision: 0, validateInitial: false });

describe('lazyDraftChecks', () => {
  it('answers like the real checks: no compute replica is "unavailable", in words, for the version asked', async () => {
    const checks = lazyDraftChecks({ store, sync: () => undefined, chem: { checkSpecies: async () => { throw new Error('unused'); }, matches: async () => { throw new Error('unused'); } } as never });
    const answer = await checks.dryRun('species', {}, 7);
    expect(answer.version).toBe(7);
    expect(answer.state).toBe('unavailable');
  });

  it('a draft that is not a species has no structure checks', async () => {
    const checks = lazyDraftChecks({ store, sync: () => undefined, chem: {} as never });
    expect(await checks.structure('class', {}, 3)).toEqual({ version: 3, state: 'none' });
  });
});

describe('lazyDuplicateCheck', () => {
  it('a kind with no duplicate rule has no matches', async () => {
    const check = lazyDuplicateCheck({ state: store.getState, indexes: () => ({}) as never, chem: {} as never, l4: {} as never });
    expect(await check.check('reaction', {})).toEqual({ matches: [], more: 0, structureChecked: true });
  });
});
