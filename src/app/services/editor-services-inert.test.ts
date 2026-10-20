/**
 * The Study edition's stand-ins for the editor services (studio step E1): the same shapes as the real ones (so `AppServices` keeps its type),
 * nothing behind them. No draft is listed, none can be opened or committed, nothing is read from or written to storage.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInertEditorServices } from './editor-services-inert';

describe('createInertEditorServices', () => {
  it('lists no draft, ever: an empty view that is the same object every time, and a listener that is never called', () => {
    const { drafts } = createInertEditorServices();
    const view = drafts.view();
    expect(view).toEqual({ items: [], count: 0, keeping: 'stored' });
    expect(drafts.view()).toBe(view);
    const listener = vi.fn();
    drafts.subscribe(listener)();
    expect(listener).not.toHaveBeenCalled();
    expect(drafts.entry('any')).toBeUndefined();
  });

  it('refuses to open or reopen a draft, in words', () => {
    const { drafts } = createInertEditorServices();
    const opened = drafts.open({ kind: 'new', recordKind: 'species' } as never);
    expect(opened).toMatchObject({ ok: false, reason: 'read_only' });
    expect(opened.ok ? '' : opened.message).toBe('Editing is not available in this edition.');
    expect(drafts.openStored('ses_x')).toMatchObject({ ok: false, reason: 'not_found' });
  });

  it('commits nothing, discards nothing, saves nothing, and ends cleanly', async () => {
    const { drafts } = createInertEditorServices();
    expect(await drafts.commit('ses_x')).toEqual({ ok: false, reason: 'gone' });
    await expect(drafts.discard('ses_x')).resolves.toBeUndefined();
    await expect(drafts.discardUnreadable('ses_x')).resolves.toBeUndefined();
    await expect(drafts.flush()).resolves.toBeUndefined();
    await expect(drafts.refresh()).resolves.toBeUndefined();
    expect(() => drafts.dispose()).not.toThrow();
    expect(() => drafts.edit('ses_x', {} as never)).not.toThrow();
    expect(() => drafts.release('ses_x')).not.toThrow();
  });

  it('a new ID is a programmer error here (nothing creates records in this edition)', () => {
    expect(() => createInertEditorServices().drafts.newId('spc')).toThrow('Editing is not available in this edition.');
  });

  it('the two editor checks refuse, as a failed ask does', async () => {
    const { draftChecks, duplicateCheck } = createInertEditorServices();
    await expect(draftChecks.dryRun('species', {}, 1)).rejects.toThrow('Editing is not available in this edition.');
    await expect(draftChecks.structure('species', {}, 1)).rejects.toThrow('Editing is not available in this edition.');
    await expect(duplicateCheck.check('species', {})).rejects.toThrow('Editing is not available in this edition.');
  });
});
