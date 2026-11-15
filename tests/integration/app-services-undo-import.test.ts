/**
 * Step 8.4s, S1 (audit DA-02): "Undo import" never throws away later work without asking. It compares the store revision with the
 * revision the import produced (`revisionAfter` of the batch report): the same revision undoes as before; a different one answers a
 * value with how many saved changes came after, and only an explicit "discard" goes on. The snapshot must be THIS batch's (the newest
 * `pre_import` one). An undone batch cannot be undone again (it is marked in its report). Taken from fable-audit/tests/audit/
 * da-02-undo-import-discards-edits.test.ts; the assertion is kept as the first test.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createBooter, renameDataset, smallState } from '@/test-support/app-boot-kit';
import { worldHolding } from '@/test-support/app-env-kit';
import { demoFile, importFile } from '@/test-support/app-flow-kit';

const booter = createBooter();
afterEach(() => booter.disposeAll());

const TITLE = 'Edited by hand after the import';

async function importedThenEdited(edits = 1) {
  const world = await worldHolding(smallState(), 1);
  const { services } = await booter.boot({ world });
  const original = services.store.getState().meta.title;
  const applied = await importFile(services, await demoFile());
  for (let i = 0; i < edits; i += 1) renameDataset(services, `${TITLE} ${i}`);
  await services.persistence?.flush?.();
  return { services, applied, original };
}

describe('Undo import after later edits (DA-02)', () => {
  it('does not silently discard an edit made after the import', async () => {
    const { services, applied } = await importedThenEdited();
    expect(services.store.getRevision()).toBeGreaterThan(applied.revision);
    const undone = await services.flows.undo();
    const warned = !undone.ok || 'discardedRevisions' in undone;
    expect(warned ? 'warned' : `silently restored; title is now "${services.store.getState().meta.title}"`).toBe('warned');
  });

  it('answers a value with the number of saved changes since, and changes nothing', async () => {
    const { services } = await importedThenEdited(3);
    const before = services.store.getState();
    expect(await services.flows.undo()).toMatchObject({ ok: false, code: 'CHANGED_SINCE', discardedRevisions: 3 });
    expect(services.store.getState()).toBe(before);
  });

  it('with the explicit choice it undoes, and the earlier data is back', async () => {
    const { services, original } = await importedThenEdited();
    const undone = await services.flows.undo({ discardLaterChanges: true });
    expect(undone).toMatchObject({ ok: true });
    expect(services.store.getState().meta.title).toBe(original);
  });

  it('with no later change it undoes as before (no question)', async () => {
    const world = await worldHolding(smallState(), 1);
    const { services } = await booter.boot({ world });
    const original = services.store.getState().meta.title;
    await importFile(services, await demoFile());
    expect(await services.flows.undo()).toMatchObject({ ok: true });
    expect(services.store.getState().meta.title).toBe(original);
  });

  it('after an undo the batch is marked undone: it cannot be undone again until the next import', async () => {
    const world = await worldHolding(smallState(), 1);
    const { services } = await booter.boot({ world });
    await importFile(services, await demoFile());
    expect((await services.flows.lastImport())?.undone).toBe(false);
    expect(await services.flows.undo()).toMatchObject({ ok: true });
    expect((await services.flows.lastImport())?.undone).toBe(true);
    expect(await services.flows.undo()).toMatchObject({ ok: false, code: 'ALREADY_UNDONE' });
    await importFile(services, await demoFile(), 'again.orn.json');
    expect((await services.flows.lastImport())?.undone).toBe(false);
  });

  it('refuses with words when the newest pre_import snapshot is not this batch\'s (never an older import)', async () => {
    const world = await worldHolding(smallState(), 1);
    const { services } = await booter.boot({ world });
    await importFile(services, await demoFile(), 'first.orn.json');
    const second = await importFile(services, await demoFile(), 'second.orn.json');
    await services.persistence?.flush?.();
    const adapter = services.persistence as unknown as { deleteSnapshot(id: string): Promise<void> };
    await adapter.deleteSnapshot(second.snapshotId);
    const before = services.store.getState();
    const answer = await services.flows.undo();
    expect(answer).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
    expect(answer.ok ? '' : answer.message).toMatch(/snapshot|safety copy/i);
    expect(services.store.getState()).toBe(before);
  });
});
