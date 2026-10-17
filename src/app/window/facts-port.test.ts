import { describe, expect, it } from 'vitest';
import type { ParseOutcome } from '@/chem';
import type { StructureRep } from '@/core/schema';
import { createFactsPort, FACTS_CACHE_SIZE } from './facts-port';

const smiles = (value: string): StructureRep => ({ format: 'smiles', value });
const good = (heavyAtomCount: number, carbonCount: number): ParseOutcome => ({ ok: true, facts: { heavyAtomCount, carbonCount, atomMaps: [], warnings: [] } });

function rig(answer: (value: string) => ParseOutcome) {
  const calls: string[] = [];
  const port = createFactsPort({ parse: (s) => (calls.push(s.value), Promise.resolve(answer(s.value))) });
  return { port, calls };
}

describe('the facts port of the textbook equation', () => {
  it('answers the two counts the formula-or-drawing rule needs (heavy atoms, carbons), and nothing else', async () => {
    const { port } = rig(() => good(3, 3));
    expect(await port.factsOf(smiles('C1CC1'))).toEqual({ ok: true, heavyAtomCount: 3, carbonCount: 3 });
  });

  it('leaves out a count the toolkit did not give (never a guess)', async () => {
    const { port } = rig(() => ({ ok: true, facts: { heavyAtomCount: 2, atomMaps: [], warnings: ['carbonCount: x'] } }));
    expect(await port.factsOf(smiles('CC'))).toEqual({ ok: true, heavyAtomCount: 2 });
  });

  it('asks the worker once per structure: the answer is kept (a repeat is a memory hit; a different structure is another call)', async () => {
    const { port, calls } = rig(() => good(1, 0));
    await port.factsOf(smiles('O'));
    await port.factsOf(smiles('O'));
    await port.factsOf(smiles('N'));
    expect(calls).toEqual(['O', 'N']);
  });

  it('two asks while one is in flight share it', async () => {
    const { port, calls } = rig(() => good(1, 0));
    await Promise.all([port.factsOf(smiles('O')), port.factsOf(smiles('O'))]);
    expect(calls).toEqual(['O']);
  });

  it('a structure the toolkit rejects, and an engine that could not answer, are `ok: false`; neither is kept, so the next ask tries again', async () => {
    let down = true;
    const { port, calls } = rig(() => (down ? { ok: false, reason: 'unavailable', error: 'not loaded' } : good(1, 0)));
    expect(await port.factsOf(smiles('O'))).toEqual({ ok: false });
    down = false;
    expect(await port.factsOf(smiles('O'))).toEqual({ ok: true, heavyAtomCount: 1, carbonCount: 0 });
    expect(calls).toEqual(['O', 'O']);
    const invalid = rig(() => ({ ok: false, reason: 'invalid', problem: 'unreadable', error: 'bad' }));
    expect(await invalid.port.factsOf(smiles('C1CC('))).toEqual({ ok: false });
  });

  it('a call that throws is `ok: false`, never an exception', async () => {
    const port = createFactsPort({ parse: () => Promise.reject(new Error('boom')) });
    expect(await port.factsOf(smiles('O'))).toEqual({ ok: false });
  });

  it('holds at most FACTS_CACHE_SIZE answers', async () => {
    const { port, calls } = rig(() => good(1, 0));
    for (let i = 0; i <= FACTS_CACHE_SIZE; i += 1) await port.factsOf(smiles(`C${'C'.repeat(i)}`));
    calls.length = 0;
    await port.factsOf(smiles('C')); // the oldest was evicted: asked again
    expect(calls).toEqual(['C']);
  });
});
