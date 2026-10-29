/**
 * Pictures on ANY picture kind through the one generic port (step 7.1a, ADR-038 addendum Q1-Q6): the role follows the target's kind, a kind
 * outside PICTURE_KINDS is refused in words, a concept takes a picture as ONE change that leaves the concept alone (add, edit and detach
 * are one undo entry each), an unsaved record says so in its own kind's word, delete detaches, merge moves the picture to the record that stays.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { deleteEnvelope, deleteView, isPictureKind, mergeEnvelope, PICTURE_KINDS } from '@/core/editing';
import { coreIndexEngine } from '@/core/indexes/engine';
import type { Asset, CanonicalState, Concept, RecordRef } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import type { AssetHost } from '@/app/services/contracts';
import { createPicturesPort } from './pictures-port';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const NOW = '2026-10-24T10:00:00.000Z';
const file = { name: 'pic.png', size: PNG.length, arrayBuffer: async () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.length) as ArrayBuffer };

function host(): AssetHost {
  let n = 0;
  let clock = 0;
  return {
    stage: { stage: () => undefined, clear: () => undefined },
    newId: (prefix) => `${prefix}_rec${++n}`,
    now: () => new Date(Date.UTC(2026, 9, 24, 12, 0, ++clock)).toISOString(),
    held: () => undefined,
    saved: async () => undefined,
  };
}

/** The demo plus two concepts of our own, so no demo chemistry is touched or relied upon beyond one record of each picture kind. */
function stateWithConcepts(): CanonicalState {
  const base = demoState();
  const template = Object.values(base.records.concept)[0] as Concept;
  const make = (id: string, name: string): Concept => ({ ...template, id: id as Concept['id'], name, aliases: [], parentIds: [], tags: [], citations: [], summary: undefined, notes: undefined, studyNotes: undefined }) as Concept;
  const a = make('cpt_pic-a', 'Picture concept A');
  const b = make('cpt_pic-b', 'Picture concept B');
  return { ...base, records: { ...base.records, concept: { ...base.records.concept, [a.id]: a, [b.id]: b } } } as CanonicalState;
}

function rig(initial: CanonicalState = stateWithConcepts()) {
  const store = createCanonicalStore({ initial, revision: 1, validateInitial: false });
  const port = createPicturesPort({ store, assets: host(), getBlob: async () => undefined });
  return { store, port };
}
type Rig = ReturnType<typeof rig>;
const concept = (id: string): RecordRef => ({ kind: 'concept', id });
const A = concept('cpt_pic-a');
const B = concept('cpt_pic-b');
const assetOf = (r: Rig, id: string) => r.store.getState().records.asset[id as never] as Asset | undefined;
async function prepared(port: Rig['port']) {
  const result = await port.prepare(file);
  if (!result.ok) throw new Error(result.message);
  return result.picture;
}
const undoDepth = (r: Rig): number => r.store.historyLabels().undo.length;

describe('the asset role follows the kind of the record', () => {
  it('every PICTURE_KINDS kind takes a picture with its own role, attached to that record, and the record is not changed', async () => {
    const expected: Record<string, string> = { mechanism: 'mechanism_image', reaction: 'reaction_image', reagent: 'reagent_image', species: 'structure_image', class: 'structure_image', transformation: 'reference_image', named_reaction: 'reference_image', concept: 'reference_image', caveat: 'reference_image', route: 'reference_image' };
    for (const kind of PICTURE_KINDS) {
      const r = rig();
      const table = r.store.getState().records[kind] as Record<string, { id: string }>;
      const target = { kind, id: Object.keys(table)[0] as string } as RecordRef;
      const before = table[target.id];
      expect(await r.port.add(target, await prepared(r.port), { altText: 'alt', caption: '' })).toEqual({ ok: true });
      const asset = assetOf(r, 'ast_rec1');
      expect(asset, kind).toMatchObject({ assetRole: expected[kind], attachedTo: [{ ref: target }], sha256: createHash('sha256').update(PNG).digest('hex') });
      expect((r.store.getState().records[kind] as Record<string, unknown>)[target.id], kind).toBe(before);
      expect(r.port.list(target).map((p) => p.id), kind).toEqual(['ast_rec1']);
    }
  });
  it('a kind outside PICTURE_KINDS is refused in words and nothing is saved', async () => {
    const r = rig();
    const topic = Object.keys(r.store.getState().records.topic)[0] as string;
    const revision = r.store.getRevision();
    expect(isPictureKind('topic')).toBe(false);
    expect(await r.port.add({ kind: 'topic', id: topic } as RecordRef, await prepared(r.port), { altText: 'alt', caption: '' })).toEqual({ ok: false, message: 'Pictures cannot be added to a topic.' });
    expect(r.store.getRevision()).toBe(revision);
    expect(r.port.list({ kind: 'topic', id: topic } as RecordRef)).toEqual([]);
  });
});

describe('a concept takes pictures', () => {
  it('add, edit and detach are ONE undo entry each; the concept record is never changed; Undo undoes each', async () => {
    const r = rig();
    const before = r.store.getState().records.concept['cpt_pic-a' as never];
    const start = undoDepth(r);
    expect(await r.port.add(A, await prepared(r.port), { altText: 'a drawing', caption: 'cap' })).toEqual({ ok: true });
    expect(undoDepth(r)).toBe(start + 1);
    expect(r.store.historyLabels().undo[0]).toBe('Add picture to Picture concept A');
    expect(await r.port.edit('ast_rec1', { altText: 'new alt', caption: '' })).toEqual({ ok: true });
    expect(undoDepth(r)).toBe(start + 2);
    expect(r.port.detach(A, 'ast_rec1')).toEqual({ ok: true });
    expect(undoDepth(r)).toBe(start + 3);
    expect(r.store.historyLabels().undo[0]).toBe('Remove picture from Picture concept A');
    expect(assetOf(r, 'ast_rec1')).toMatchObject({ altText: 'new alt', attachedTo: [] });
    expect(r.store.getState().records.concept['cpt_pic-a' as never]).toBe(before);
    r.store.undo();
    expect(r.port.list(A).map((p) => p.id)).toEqual(['ast_rec1']);
    r.store.undo();
    expect(assetOf(r, 'ast_rec1')?.altText).toBe('a drawing');
    r.store.undo();
    expect(assetOf(r, 'ast_rec1')).toBeUndefined();
  });
  it('a concept that is not saved yet says so with its own kind word', async () => {
    const r = rig();
    expect(await r.port.add(concept('cpt_never-saved'), await prepared(r.port), { altText: 'x', caption: '' })).toEqual({ ok: false, message: 'Save the concept once before adding pictures.' });
    expect(await r.port.add({ kind: 'named_reaction', id: 'nrx_never-saved' }, await prepared(r.port), { altText: 'x', caption: '' })).toEqual({ ok: false, message: 'Save the named reaction once before adding pictures.' });
  });
});

describe('delete and merge', () => {
  it('delete lists the picture under "Removed from", keeps the asset (detached), and Undo restores the attachment', async () => {
    const r = rig();
    await r.port.add(A, await prepared(r.port), { altText: 'a drawing', caption: '' });
    const state = r.store.getState();
    const view = deleteView(state, coreIndexEngine.build(state), [A]);
    expect(view.canDelete).toBe(true);
    expect(view.removedFrom.map((row) => row.ref)).toEqual([{ kind: 'asset', id: 'ast_rec1' }]);
    expect(view.removedFrom[0]?.fields.length).toBeGreaterThan(0);
    const result = r.store.dispatch(deleteEnvelope(state, [A]));
    expect(result.ok).toBe(true);
    expect(r.store.getState().records.concept['cpt_pic-a' as never]).toBeUndefined();
    expect(assetOf(r, 'ast_rec1')?.attachedTo).toEqual([]);
    r.store.undo();
    expect(r.store.getState().records.concept['cpt_pic-a' as never]).toBeDefined();
    expect(assetOf(r, 'ast_rec1')?.attachedTo).toEqual([{ ref: A }]);
  });
  it('merging concept A into B moves the picture to B; Undo gives it back to A', async () => {
    const r = rig();
    await r.port.add(A, await prepared(r.port), { altText: 'a drawing', caption: '' });
    const state = r.store.getState();
    const from = state.records.concept['cpt_pic-a' as never] as Concept;
    const built = mergeEnvelope(state, coreIndexEngine.build(state), from, B, {}, NOW);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(r.store.dispatch(built.envelope).ok).toBe(true);
    expect(r.port.list(B).map((p) => p.id)).toEqual(['ast_rec1']);
    expect(assetOf(r, 'ast_rec1')?.attachedTo).toEqual([{ ref: B }]);
    r.store.undo();
    expect(r.port.list(A).map((p) => p.id)).toEqual(['ast_rec1']);
    expect(r.port.list(B)).toEqual([]);
  });
});
