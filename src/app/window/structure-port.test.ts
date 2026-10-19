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
let chem: ReturnType<typeof createChemService>;
beforeAll(async () => {
  const module = await sharedRdkit();
  const toolkit = withChemCache(createRdkitToolkit({ load: async () => module }));
  const workers = createMemoryWorkers((worker) => void createRpcHost(worker.host, createChemHandlers(toolkit, () => performance.now())));
  const gate = createWarmUpGate<ChemWorkerApi>();
  const client = createRpcClient<ChemWorkerApi>({ factory: workers.factory, specs: CHEM_SPECS, options: { onRestart: gate.onRestart } });
  chem = createChemService(client, gate);
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

describe('the class editor\'s two chem needs (step 6.2b part 1: no new worker method)', () => {
  const generic = { format: 'cxsmiles', value: '[*]C(O)CO |$R;;;;$|' } as const;

  it('a generic R-labelled CXSMILES is read with no formula (a dummy atom is said, not hidden)', async () => {
    const outcome = await port.parse(generic);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.facts.formula).toBeUndefined();
    expect(outcome.facts.warnings.join(' ')).toMatch(/dummy/);
  });

  it('and it draws, with the R label (the drawing differs from the same SMILES without labels)', async () => {
    const options = { width: 256, height: 160, showAtomMaps: false };
    const labelled = await chem.depict(generic, options);
    const plain = await chem.depict({ format: 'smiles', value: '[*]C(O)CO' }, options);
    expect(labelled.ok && plain.ok).toBe(true);
    if (!labelled.ok || !plain.ok) return;
    expect(labelled.depiction.svg.startsWith('<svg')).toBe(true);
    expect(labelled.depiction.svg).not.toBe(plain.depiction.svg);
  });

  it('checks a SMARTS: readable, unreadable (the engine\'s words) and the limits', async () => {
    expect(await port.checkSmarts?.('[CX4][OX2H]')).toEqual({ state: 'ok' });
    const bad = await port.checkSmarts?.('[CX4][OX2H');
    expect(bad).toMatchObject({ state: 'invalid' });
    expect(bad?.state === 'invalid' && bad.message.length).toBeGreaterThan(0);
    expect(await port.checkSmarts?.('C'.repeat(20_001))).toMatchObject({ state: 'invalid', message: expect.stringMatching(/1 to 20000 characters/) });
  });
});
