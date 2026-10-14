/**
 * Step 5.11a, candidate A of the Gate E packet: boot reads the quarantine count while the validation port works
 * (docs/PERSISTENCE.md §4, dated amendment). Other boot tests: persistence-boot.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { precomputedFor } from '@/core/commands';
import { coreIndexEngine } from '@/core/indexes/engine';
import { validator } from '@/core/validation';
import type { OpenResult } from '@/persistence/contracts';
import { loadFixtureState, must } from '@/test-support/state-fixture';
import { reopen, savedDatabase, type TestAdapter } from '@/test-support/persistence-kit';

const base = loadFixtureState('maximal-valid');
const speciesId = Object.keys(base.records.species).sort()[0] as string;
const speciesRow = must(base.records.species[speciesId]);

async function boot(t: TestAdapter): Promise<{ result: Exclude<OpenResult, { mode: 'unavailable' }> }> {
  const result = await t.adapter.open();
  if (result.mode === 'unavailable') throw new Error(`unavailable: ${result.detail}`);
  return { result };
}

describe('boot: the quarantine count is read in parallel with validation (step 5.11a, candidate A)', () => {
  it('asks for the count while the validation port is still working, and still reports it', async () => {
    const t = await savedDatabase(base);
    for (const id of ['spc_bad-one', 'spc_bad-two']) await t.db.records.put({ ...speciesRow, id, unexpectedField: 1 } as never);
    let countAsked!: () => void;
    const asked = new Promise<void>((resolve) => (countAsked = resolve));
    const reopened = reopen(t, {
      // Waits for the count to be asked: a boot that reads the count only AFTER validation would never get here.
      validate: async (state, revision) => {
        await asked;
        return precomputedFor(state, revision, validator.validateAll(state, coreIndexEngine.build(state, revision)));
      },
    });
    const count = reopened.db.quarantine.count.bind(reopened.db.quarantine);
    reopened.db.quarantine.count = ((...args: Parameters<typeof count>) => {
      countAsked();
      return count(...args);
    }) as typeof count;
    const { result } = await boot(reopened);
    expect(result.quarantinedCount).toBe(2);
    expect(result.bootReport).toMatchObject({ newlyQuarantined: 2 });
    expect(result.state).toEqual(base);
  });
});
