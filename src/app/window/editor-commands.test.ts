/**
 * The palette's editing commands (studio step E1): in Studio the seven editing deps exist (with the reason when editing is unavailable);
 * in Study they are ABSENT, so the palette does not list five unavailable "New ..." commands.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

const KEYS = ['editNames', 'newSpecies', 'newClass', 'newReagent', 'newReaction', 'newMechanism', 'newSource'];

async function depsIn(edition: 'study' | 'studio') {
  vi.resetModules();
  vi.stubGlobal('__ORN_EDITION__', edition);
  const { editorCommandDeps } = await import('./editor-commands');
  const { createInspectorStore } = await import('@/ui/state');
  return editorCommandDeps(null, { records: {} } as never, createInspectorStore().getState());
}

describe('editorCommandDeps', () => {
  it('studio: all seven exist, unavailable with the reason when there is no editor', async () => {
    const deps = await depsIn('studio');
    expect(Object.keys(deps).sort()).toEqual([...KEYS].sort());
    expect(deps.newSpecies?.reason).toBe('editing is not available here');
  });

  it('study: none of them exists', async () => {
    expect(Object.keys(await depsIn('study'))).toEqual([]);
  });
});
