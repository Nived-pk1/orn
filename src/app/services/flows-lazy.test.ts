/**
 * The import, restore and export services (and the io / compute-flow code under them) load on the first flow call, not with the first
 * paint (7.2b A1: room under the Studio line). The module that `create.ts` imports holds no service by value.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

describe('flows are lazy', () => {
  const source = readFileSync(new URL('./flows.ts', import.meta.url), 'utf8');

  it('imports no service module by value', () => {
    const values = [...source.matchAll(/^import\s+(?!type\b)[^;]*from\s+'([^']+)'/gm)].map((m) => m[1]);
    expect(values.filter((from) => /import-service|restore-service|export-service|@\/io|@\/workers\/compute/.test(from ?? ''))).toEqual([]);
  });

  it('loads the services with a dynamic import', () => {
    expect(source).toMatch(/import\('\.\/flows-core'\)/);
  });
});

describe('a chunk that cannot be loaded is a value (7.2b)', () => {
  const WORDS = 'This part of the app could not load. Check your connection and reload the page.';

  it('import, undo, restore and export answer { ok: false } with the words; cancel and lastImport answer nothing; the next call tries again', async () => {
    vi.resetModules();
    vi.doMock('./flows-core', () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    const { createFlows } = await import('./flows');
    const flows = createFlows({} as never);
    const blob = new Blob(['x']);
    for (const answer of [await flows.preview(blob, 'a.json'), await flows.revise('b', {} as never), await flows.apply('b', {} as never), await flows.undo(), await flows.restore('s'), await flows.export({} as never, 'orn-json' as never)]) {
      expect(answer).toMatchObject({ ok: false, message: WORDS });
    }
    expect(await flows.cancel('b')).toEqual({ cancelled: false });
    expect(await flows.lastImport()).toBeUndefined();
    // a failed load is not remembered: when the chunk is there, the next call works
    vi.doUnmock('./flows-core');
    vi.doMock('./flows-core', () => ({ createFlowsNow: () => ({ cancel: async () => ({ cancelled: true }) }) }));
    expect(await flows.cancel('b')).toEqual({ cancelled: true });
    vi.doUnmock('./flows-core');
  });
});
