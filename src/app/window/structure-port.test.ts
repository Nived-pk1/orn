/**
 * The structure panel's port over a REAL chem worker (in-memory port, real RDKit; step 6.2a part 3): the facts the panel shows beside the
 * entered values, the words of an unreadable structure (ADV-036: the draft still saves, with CHEM-001) and the limits at the wire.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createRdkitToolkit, withChemCache } from '@/chem';
import type { createDraftManager } from '@/app/services/drafts';
import { sharedRdkit } from '@/test-support/l4-real-kit';
import { createMemoryWorkers } from '@/test-support/rpc-memory-port';
import { createChemService } from '@/workers/chem';
import { createChemHandlers } from '@/workers/chem/handlers';
import { CHEM_SPECS } from '@/workers/chem/specs';
import { createRpcClient, createRpcHost, createWarmUpGate } from '@/workers/rpc';
import type { ChemWorkerApi } from '@/workers/rpc/contracts';
import { makeEditorPort } from './editor-port';

let port: NonNullable<ReturnType<typeof makeEditorPort>['structure']>;
beforeAll(async () => {
  const module = await sharedRdkit();
  const toolkit = withChemCache(createRdkitToolkit({ load: async () => module }));
  const workers = createMemoryWorkers((worker) => void createRpcHost(worker.host, createChemHandlers(toolkit, () => performance.now())));
  const gate = createWarmUpGate<ChemWorkerApi>();
  const client = createRpcClient<ChemWorkerApi>({ factory: workers.factory, specs: CHEM_SPECS, options: { onRestart: gate.onRestart } });
  const chem = createChemService(client, gate);
  const made = makeEditorPort({ drafts: {} as ReturnType<typeof createDraftManager>, store: {} as never, chem }, { after: () => () => undefined });
  if (made.structure === undefined) throw new Error('the port has no structure part');
  port = made.structure;
});

describe('the structure port', () => {
  it('derives formula, charge and stereo facts of a valid SMILES', async () => {
    const outcome = await port.parse({ format: 'smiles', value: 'C[C@H](O)CC' });
    expect(outcome).toMatchObject({ ok: true, facts: { formula: 'C4H10O', charge: 0, specifiedStereocentres: 1, unspecifiedStereocentres: 0 } });
  });

  it('an unreadable SMILES is an invalid value with the engine words (CHEM-001 comes from the checks)', async () => {
    const outcome = await port.parse({ format: 'smiles', value: 'C1CC' });
    expect(outcome).toMatchObject({ ok: false, reason: 'invalid', problem: 'unreadable' });
    expect(!outcome.ok && outcome.error.length).toBeGreaterThan(0);
  });

  it('a molfile is read by its content; text over the limit is refused with the limit, never cut', async () => {
    const molfile = '\n  test\n\n  2  1  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    1.5000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0\nM  END\n';
    expect(await port.parse({ format: 'molfile', value: molfile })).toMatchObject({ ok: true, facts: { formula: 'CH4O' } });
    const refused = await port.parse({ format: 'smiles', value: 'C'.repeat(20_001) });
    expect(refused).toMatchObject({ ok: false, reason: 'invalid' });
    expect(!refused.ok && refused.error).toMatch(/20000/);
  });
});
