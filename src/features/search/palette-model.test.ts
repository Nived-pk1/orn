/**
 * The palette model (step 5.8): the grammar parser is wired, the debounce is 100 ms, a newer input supersedes an older one (its answer
 * is never shown even when it arrives later and succeeded), NOT_READY is "Search is starting" (never an empty list), failures are
 * words, commands are listed with their reasons. Fake timers; the search port is a hand-driven deferred.
 */
import { describe, expect, it, vi } from 'vitest';
import type { RecordRef } from '@/core/schema';
import type { SearchHit, SearchQuery } from '@/search/contracts';
import { manualTimers } from '@/test-support/navigator-kit';
import { createRecentStore } from '@/ui/state';
import { PALETTE_DEBOUNCE_MS, PALETTE_LIMIT, STARTING_RETRY_MAX, STARTING_RETRY_MS, type IndexState, type PaletteCommand, type PaletteSearchAnswer, type SearchPorts } from './contracts';
import { createPaletteModel } from './palette-model';

const hit = (id: string, title = id, kind = 'species'): SearchHit => ({ ref: { kind, id } as RecordRef, score: 1, title, matchedField: 'name' });

interface Call {
  readonly query: SearchQuery;
  resolve(answer: PaletteSearchAnswer): void;
}

function rig(options: { commands?: readonly PaletteCommand[]; exam?: string } = {}) {
  const index: { state: IndexState } = { state: { state: 'current' } };
  const timers = manualTimers();
  const calls: Call[] = [];
  const opened: [RecordRef, string][] = [];
  const logs: string[] = [];
  const recent = createRecentStore();
  const ports: SearchPorts = {
    search: (_channel, query) =>
      new Promise<PaletteSearchAnswer>((resolve) => {
        calls.push({ query, resolve });
      }),
    timers,
    recent,
    examVersionId: () => options.exam,
    indexState: () => index.state,
    factsOf: () => ({}),
    open: (ref, title) => void opened.push([ref, title]),
    commands: () => options.commands ?? [],
    log: (type) => void logs.push(type),
  };
  const model = createPaletteModel(ports);
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };
  return { model, timers, calls, opened, logs, recent, flush, index, state: () => model.store.getState() };
}

describe('the grammar parser is wired', () => {
  it('plain text, a kind prefix, the exam version and the limit reach the query', async () => {
    const r = rig({ exam: 'exv_x' });
    r.model.setInput('  S :  Ethanol ');
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]?.query).toEqual({ text: 'Ethanol', kinds: ['species'], examVersionId: 'exv_x', limit: PALETTE_LIMIT });
  });

  it('no exam version means none in the query', () => {
    const r = rig();
    r.model.setInput('ethanol');
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    expect(r.calls[0]?.query).toEqual({ text: 'ethanol', limit: PALETTE_LIMIT });
  });

  it('empty text asks nothing and lists nothing; a kind prefix alone lists that kind', () => {
    const r = rig();
    r.model.setInput('   ');
    r.timers.advance(1_000);
    expect(r.calls).toHaveLength(0);
    expect(r.state().status).toBe('idle');
    r.model.setInput('r:');
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    expect(r.calls[0]?.query).toMatchObject({ text: '', kinds: ['reaction'] });
  });

  it('a text cut by the parser says so', async () => {
    const r = rig();
    r.model.setInput(Array.from({ length: 20 }, (_, i) => `w${i}`).join(' '));
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    r.calls[0]?.resolve({ ok: true, value: [hit('spc_a')] });
    await r.flush();
    expect(r.state().message).toContain('Only the first 16 words');
  });
});

describe('the debounce and supersession', () => {
  it('sends one query 100 ms after the last key, not before', () => {
    const r = rig();
    r.model.setInput('e');
    r.timers.advance(60);
    r.model.setInput('et');
    r.timers.advance(60);
    expect(r.calls).toHaveLength(0);
    r.timers.advance(40);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]?.query.text).toBe('et');
    expect(PALETTE_DEBOUNCE_MS).toBeGreaterThanOrEqual(80);
    expect(PALETTE_DEBOUNCE_MS).toBeLessThanOrEqual(120);
  });

  it('an older answer that arrives after a newer input is never shown, even when it succeeded', async () => {
    const r = rig();
    r.model.setInput('eth');
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    r.model.setInput('ethanol');
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    expect(r.calls).toHaveLength(2);
    r.calls[1]?.resolve({ ok: true, value: [hit('spc_ethanol', 'Ethanol')] });
    await r.flush();
    r.calls[0]?.resolve({ ok: true, value: [hit('spc_ether', 'Ether'), hit('spc_ethane', 'Ethane')] });
    await r.flush();
    const titles = r.state().rows.flatMap((row) => (row.type === 'hit' ? [row.hit.title] : []));
    expect(titles).toEqual(['Ethanol']);
  });

  it('an answer for text that was cleared is dropped', async () => {
    const r = rig();
    r.model.setInput('eth');
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    r.model.setInput('');
    r.calls[0]?.resolve({ ok: true, value: [hit('spc_a')] });
    await r.flush();
    expect(r.state().rows).toEqual([]);
    expect(r.state().status).toBe('idle');
  });

  it('a CANCELLED answer changes nothing', async () => {
    const r = rig();
    r.model.setInput('eth');
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    r.calls[0]?.resolve({ ok: false, code: 'CANCELLED', message: 'replaced' });
    await r.flush();
    expect(r.state().message).toBe('');
    expect(r.state().rows).toEqual([]);
  });
});

describe('what the answer says', () => {
  it('groups hits by kind and keeps the engine order inside a group', async () => {
    const r = rig();
    r.model.setInput('eth');
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    r.calls[0]?.resolve({ ok: true, value: [hit('rxn_1', 'A', 'reaction'), hit('spc_1', 'B'), hit('rxn_2', 'C', 'reaction')] });
    await r.flush();
    expect(r.state().rows.map((row) => (row.type === 'header' ? `# ${row.kind} ${row.count}` : row.hit.title))).toEqual(['# reaction 2', 'A', 'C', '# species 1', 'B']);
  });

  it('NOT_READY is "Search is starting", never an empty list; it asks again and then shows the results', async () => {
    const r = rig();
    r.model.setInput('eth');
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    r.calls[0]?.resolve({ ok: false, code: 'NOT_READY', message: 'no index' });
    await r.flush();
    expect(r.state().status).toBe('starting');
    expect(r.state().message).toBe('Search is starting');
    expect(r.state().message).not.toMatch(/no results/i);
    r.timers.advance(STARTING_RETRY_MS);
    expect(r.calls).toHaveLength(2);
    r.calls[1]?.resolve({ ok: true, value: [hit('spc_a', 'Ethanol')] });
    await r.flush();
    expect(r.state().status).toBe('results');
    expect(r.state().rows).toHaveLength(2);
  });

  it('an answer from an index that has not followed the store yet is not final: "catching up", asked again, then shown', async () => {
    const r = rig();
    r.index.state = { state: 'catching_up' };
    r.model.setInput('renamed');
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    r.calls[0]?.resolve({ ok: true, value: [] });
    await r.flush();
    expect(r.state().status).toBe('starting');
    expect(r.state().message).toBe('Search is catching up with your latest change');
    expect(r.state().message).not.toMatch(/no results/i);
    r.index.state = { state: 'current' };
    r.timers.advance(STARTING_RETRY_MS);
    expect(r.calls).toHaveLength(2);
    r.calls[1]?.resolve({ ok: true, value: [hit('spc_a', 'Ethanol renamed')] });
    await r.flush();
    expect(r.state().status).toBe('results');
    expect(r.state().rows).toHaveLength(2);
  });

  it('an index that never catches up is asked a bounded number of times, then the answer is shown with a warning', async () => {
    const r = rig();
    r.index.state = { state: 'catching_up' };
    r.model.setInput('renamed');
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    for (let i = 0; i <= STARTING_RETRY_MAX; i += 1) {
      r.calls[i]?.resolve({ ok: true, value: [] });
      await r.flush();
      r.timers.advance(STARTING_RETRY_MS);
    }
    expect(r.calls).toHaveLength(STARTING_RETRY_MAX + 1);
    expect(r.state().status).toBe('results');
    expect(r.state().message).toBe('No results for “renamed”. The results may not include your latest change.');
    expect(r.logs).toContain('search_index_behind');
  });

  it('a failed index sync is said in words next to the answer (no retry loop)', async () => {
    const r = rig();
    r.index.state = { state: 'failed', reason: 'update failed: TIMEOUT' };
    r.model.setInput('renamed');
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    r.calls[0]?.resolve({ ok: true, value: [hit('spc_a', 'Ethanol')] });
    await r.flush();
    expect(r.calls).toHaveLength(1);
    expect(r.state().status).toBe('results');
    expect(r.state().message).toBe('Search could not follow your latest change (update failed: TIMEOUT); the results may be out of date.');
  });

  it('gives up after a bounded number of asks and says search did not start', async () => {
    const r = rig();
    r.model.setInput('eth');
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    for (let i = 0; i <= STARTING_RETRY_MAX; i += 1) {
      r.calls[i]?.resolve({ ok: false, code: 'NOT_READY', message: 'no index' });
      await r.flush();
      r.timers.advance(STARTING_RETRY_MS);
    }
    expect(r.calls).toHaveLength(STARTING_RETRY_MAX + 1);
    expect(r.state().status).toBe('failed');
    expect(r.state().message).toMatch(/did not start/);
    expect(r.logs).toContain('search_not_started');
  });

  it('another failure is said with its code and logged; an empty answer says no results', async () => {
    const r = rig();
    r.model.setInput('eth');
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    r.calls[0]?.resolve({ ok: false, code: 'TIMEOUT', message: 'took too long' });
    await r.flush();
    expect(r.state().message).toBe('Search could not answer (TIMEOUT): took too long');
    expect(r.logs).toContain('search_failed');
    r.model.setInput('zzz');
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    r.calls[1]?.resolve({ ok: true, value: [] });
    await r.flush();
    expect(r.state().message).toBe('No results for “zzz”.');
  });
});

describe('opening, recent searches and commands', () => {
  it('opening a hit asks the port to open it and keeps the typed text as a recent search', async () => {
    const r = rig();
    r.model.setInput(' ethanol ');
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    r.calls[0]?.resolve({ ok: true, value: [hit('spc_e', 'Ethanol')] });
    await r.flush();
    r.model.openHit(1);
    expect(r.opened).toEqual([[{ kind: 'species', id: 'spc_e' }, 'Ethanol']]);
    expect(r.recent.getState().items).toEqual(['ethanol']);
    r.model.openHit(0); // a header opens nothing
    expect(r.opened).toHaveLength(1);
  });

  it('"> text" lists matching commands at once, unavailable ones with their reason, and runs only the available', () => {
    const run = vi.fn();
    const commands: PaletteCommand[] = [
      { id: 'fit', title: 'Fit', run },
      { id: 'zoom', title: 'Zoom in', keywords: ['map'], run, unavailable: 'the map is not shown' },
    ];
    const r = rig({ commands });
    r.model.setInput('>zoom');
    expect(r.calls).toHaveLength(0);
    expect(r.state().commands.map((c) => c.id)).toEqual(['zoom']);
    expect(r.model.runCommand(commands[1] as PaletteCommand)).toEqual({ ran: false, reason: 'the map is not shown' });
    expect(run).not.toHaveBeenCalled();
    expect(r.model.runCommand(commands[0] as PaletteCommand)).toEqual({ ran: true });
    expect(run).toHaveBeenCalledTimes(1);
    r.model.setInput('> nothing like it');
    expect(r.state().message).toBe('No command matches “nothing like it”.');
  });

  it('typing after a command search returns to a normal search', () => {
    const r = rig({ commands: [{ id: 'fit', title: 'Fit', run: () => undefined }] });
    r.model.setInput('>');
    expect(r.state().commands).toHaveLength(1);
    r.model.setInput('eth');
    expect(r.state().commands).toEqual([]);
    r.timers.advance(PALETTE_DEBOUNCE_MS);
    expect(r.calls).toHaveLength(1);
  });

  it('dispose drops a waiting query and a late answer', async () => {
    const r = rig();
    r.model.setInput('eth');
    r.model.dispose();
    r.timers.advance(1_000);
    expect(r.calls).toHaveLength(0);
  });
});
