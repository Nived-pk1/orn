/**
 * The palette's editing commands (studio step E1): in Studio the seven editing deps exist (with the reason when editing is unavailable);
 * in Study they are ABSENT, so the palette does not list five unavailable "New ..." commands.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

const KEYS = ['editNames', 'newKinds'];

async function depsIn(edition: 'study' | 'studio') {
  vi.resetModules();
  vi.stubGlobal('__ORN_EDITION__', edition);
  const { editorCommandDeps } = await import('./editor-commands');
  const { createInspectorStore } = await import('@/ui/state');
  return editorCommandDeps(null, { records: {} } as never, createInspectorStore().getState());
}

describe('editorCommandDeps', () => {
  it('studio: all of them exist, unavailable with the reason when there is no editor', async () => {
    const deps = await depsIn('studio');
    expect(Object.keys(deps).sort()).toEqual([...KEYS].sort());
    expect(deps.newKinds).toEqual([]);
  });

  it('studio: one command per entry of the table, with the reason, running the kind of the entry', async () => {
    vi.resetModules();
    vi.stubGlobal('__ORN_EDITION__', 'studio');
    const { editorCommandDeps } = await import('./editor-commands');
    const { EDITOR_ENTRIES } = await import('./editor-entries');
    const { createInspectorStore } = await import('@/ui/state');
    const startNew = vi.fn();
    const editors = { entries: EDITOR_ENTRIES.entries, startNew, editReason: 'This tab is read-only: edit in the tab that is saving' } as never;
    const deps = editorCommandDeps(editors, { records: {} } as never, createInspectorStore().getState());
    expect(deps.newKinds?.map((c) => c.id)).toEqual(EDITOR_ENTRIES.entries.map((e) => e.paletteId));
    expect(deps.newKinds?.every((c) => c.reason === 'This tab is read-only: edit in the tab that is saving')).toBe(true);
    deps.newKinds?.find((c) => c.id === 'new-topic')?.run();
    expect(startNew).toHaveBeenCalledWith('topic', {});
  });

  it('study: none of them exists', async () => {
    expect(Object.keys(await depsIn('study'))).toEqual([]);
  });
});
