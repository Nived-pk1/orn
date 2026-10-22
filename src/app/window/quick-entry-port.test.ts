/**
 * The quick-entry port (step 6.7b). Found by the e2e: the search service lets a newer query on a CHANNEL replace an older one, so every
 * term of a line (they are asked at the same time) needs its own channel, or all but the last come back "replaced". Also: an exact match
 * is a folded name, common name, alias or formula; the chem worker not answering is said.
 */
import { describe, expect, it } from 'vitest';
import type { CanonicalState } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { createQuickEntryPort } from './quick-entry-port';

const state = demoState();

/** A search that behaves like the service: a newer query on the same channel answers the older one with an error. */
function supersedingSearch(records: CanonicalState) {
  const latest = new Map<string, number>();
  const channels: string[] = [];
  let tick = 0;
  const search = (async (channel: string, request: { text: string; kinds: readonly string[] }) => {
    channels.push(channel);
    const mine = (tick += 1);
    latest.set(channel, mine);
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (latest.get(channel) !== mine) return { ok: false, code: 'SUPERSEDED', message: 'a newer query on this channel replaced this one' };
    return {
      ok: true,
      value: request.kinds.flatMap((kind) =>
        Object.values((records.records as unknown as Record<string, Record<string, { id: string; names?: { canonical: string; common?: string[]; aliases?: string[] } }>>)[kind] ?? {})
          .filter((r) => [r.names?.canonical ?? '', ...(r.names?.common ?? []), ...(r.names?.aliases ?? [])].some((n) => n.toLowerCase().includes(request.text.toLowerCase())))
          .map((r) => ({ ref: { kind, id: r.id } })),
      ),
    };
  }) as never;
  return { search, channels };
}

function portFor(search: never, extra: Partial<Parameters<typeof createQuickEntryPort>[0]> = {}) {
  return createQuickEntryPort({
    search,
    state: () => state,
    indexes: () => ({}) as never,
    activeExam: () => null,
    preview: undefined,
    createNew: () => undefined,
    openRecord: () => undefined,
    open: () => undefined,
    newId: (prefix) => `${prefix}_x`,
    ...extra,
  });
}

describe('find', () => {
  it('terms asked at the same time each use their own channel, so none is replaced', async () => {
    const { search, channels } = supersedingSearch(state);
    const port = portFor(search);
    const [a, b, c] = await Promise.all([port.find('ethanol'), port.find('ethanal'), port.find('PCC')]);
    expect(new Set(channels).size).toBe(3);
    expect(a.exact.map((x) => x.name)).toEqual(['Ethanol']);
    expect(b.exact.map((x) => x.name)).toEqual(['Ethanal']);
    expect(c.exact.map((x) => x.name).sort()).toEqual(['PCC', 'Pyridinium chlorochromate']);
  });
  it('an exact match is a folded name, common name or alias; others are suggestions (at most five)', async () => {
    const { search } = supersedingSearch(state);
    const port = portFor(search);
    expect((await port.find('ETHYL ALCOHOL')).exact.map((x) => x.name)).toEqual(['Ethanol']); // a common name, any case
    const partial = await port.find('ethan');
    expect(partial.exact).toEqual([]);
    expect(partial.suggestions.length).toBeGreaterThan(0);
    expect(partial.suggestions.length).toBeLessThanOrEqual(5);
  });
  it('a search that is not ready is an error the resolver says in words', async () => {
    const port = portFor((async () => ({ ok: false, code: 'NOT_READY', message: 'the search index is not loaded' })) as never);
    await expect(port.find('ethanol')).rejects.toThrow('the search index is not loaded');
  });
});

describe('structure', () => {
  const smiles = (value: string) => ({ format: 'smiles', value });
  it('no chem worker: said, not read as "not a structure"', async () => {
    const port = portFor(supersedingSearch(state).search);
    expect(await port.structure('CCO')).toMatchObject({ state: 'unanswered' });
  });
  it('invalid is not a structure; a worker that fails is unanswered; a readable structure is matched through the duplicate check or offered as new', async () => {
    const calls: unknown[] = [];
    const chem = {
      parse: async (structure: { value: string }) => {
        calls.push(structure);
        if (structure.value === 'CCO' || structure.value === 'C1CCCCC1') return { ok: true, facts: {} };
        if (structure.value === 'down') return { ok: false, reason: 'unavailable', error: 'the toolkit did not answer' };
        return { ok: false, reason: 'invalid', problem: 'unreadable', error: 'bad' };
      },
    };
    const duplicateCheck = { check: async (_kind: string, draft: { structure: { value: string } }) => ({ matches: draft.structure.value === 'CCO' ? [{ ref: { kind: 'species', id: 'spc_ethanol' }, name: 'Ethanol', reasons: ['structure'] }] : [], more: 0, structureChecked: true }) };
    const port = portFor(supersedingSearch(state).search, { chem: chem as never, duplicateCheck: duplicateCheck as never });
    expect(await port.structure('hello')).toEqual({ state: 'not_structure' });
    expect(await port.structure('down')).toEqual({ state: 'unanswered', message: 'the toolkit did not answer' });
    expect(await port.structure('CCO')).toMatchObject({ state: 'matched', matches: [{ id: 'spc_ethanol', name: 'Ethanol' }] });
    expect(await port.structure('C1CCCCC1')).toEqual({ state: 'new' });
    expect(calls[0]).toEqual(smiles('hello'));
  });
  it('a duplicate check that could not compare is said', async () => {
    const chem = { parse: async () => ({ ok: true, facts: {} }) };
    const duplicateCheck = { check: async () => ({ matches: [], more: 0, structureChecked: false, message: 'Structure duplicates could not be checked' }) };
    const port = portFor(supersedingSearch(state).search, { chem: chem as never, duplicateCheck: duplicateCheck as never });
    expect(await port.structure('CCO')).toEqual({ state: 'unanswered', message: 'Structure duplicates could not be checked' });
  });
});
