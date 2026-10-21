/** Editor sessions (ADR-040): open, edit with coalescing, bounded local history, exact undo and redo. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clockContext } from '@/test-support/editing-kit';
import { makeStore, recordIn } from '@/test-support/command-kit';
import type { EditorSession } from '../commands';
import { MAX_DRAFT_STEPS, canRedoDraft, canUndoDraft, editDraft, openSession, redoDraft, undoDraft, type DraftRecipe } from '.';

const SPECIES = 'spc_max-propanone';
type Names = { canonical: string; display?: string; aliases: string[]; common: string[] };
const namesOf = (s: EditorSession): Names => (s.draft as { names: Names }).names;
const rename = (name: string): DraftRecipe => (d) => {
  (d.names as Names).canonical = name;
};
const addAlias = (alias: string): DraftRecipe => (d) => {
  (d.names as Names).aliases.push(alias);
};

function open() {
  const ctx = clockContext();
  const store = makeStore();
  const opened = openSession(ctx, store.getState(), store.getRevision(), { kind: 'species', id: SPECIES });
  if (!opened.ok) throw new Error('no session');
  return { ctx, store, session: opened.session };
}

describe('openSession', () => {
  it('copies the record into baseRecord and draft, with an eds_ ID and the revision', () => {
    const { store, session } = open();
    const record = recordIn(store.getState(), 'species', SPECIES);
    expect(session.id).toMatch(/^eds_/);
    expect(session.kind).toBe('species');
    expect(session.target).toEqual({ kind: 'species', id: SPECIES });
    expect(session.baseRevision).toBe(store.getRevision());
    expect(session.baseRecord).toEqual(record);
    expect(session.draft).toEqual(record);
    expect(session.baseRecord).not.toBe(record);
    expect(session.draft).not.toBe(session.baseRecord);
    expect(session.past).toEqual([]);
    expect(session.future).toEqual([]);
  });

  it('a new record starts as an empty draft of that kind with a fresh ID and no target', () => {
    const ctx = clockContext();
    const result = openSession(ctx, makeStore().getState(), 0, { kind: 'species' });
    if (!result.ok) throw new Error('no session');
    expect(result.session.target).toBeNull();
    expect(result.session.baseRecord).toBeNull();
    expect(result.session.draft).toMatchObject({ kind: 'species', id: expect.stringMatching(/^spc_/) });
  });

  it('a target that does not exist is a value, not an exception', () => {
    const result = openSession(clockContext(), makeStore().getState(), 0, { kind: 'species', id: 'spc_nothing' });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('editDraft', () => {
  it('puts the inverse patches on past, clears future and sets updatedAt', () => {
    const { ctx, session } = open();
    ctx.advance(5000);
    const edited = editDraft(session, rename('Acetone-2'), ctx);
    expect(namesOf(edited).canonical).toBe('Acetone-2');
    expect(edited.past).toHaveLength(1);
    expect(edited.updatedAt).toBe(ctx.now());
    expect(edited.updatedAt).not.toBe(session.updatedAt);
    expect(session.draft).not.toBe(edited.draft);
    const undone = undoDraft(edited, ctx);
    expect(undone.future).toHaveLength(1);
    expect(editDraft(undone, rename('Other'), ctx).future).toEqual([]);
  });

  it('an edit that changes nothing adds no step and returns the same session', () => {
    const { ctx, session } = open();
    expect(editDraft(session, () => undefined, ctx)).toBe(session);
  });

  it('coalesces edits to the same path within 1,000 ms into one undo step (typing a word)', () => {
    const { ctx, session } = open();
    const original = namesOf(session).canonical;
    let s = session;
    for (const word of ['A', 'Ac', 'Ace', 'Acet']) {
      s = editDraft(s, rename(word), ctx, { path: 'names.canonical' });
      ctx.advance(400); // each within 1,000 ms of the one before, though the whole run is longer than 1,000 ms
    }
    expect(s.past).toHaveLength(1);
    expect(namesOf(undoDraft(s, ctx)).canonical).toBe(original);
    expect(namesOf(redoDraft(undoDraft(s, ctx), ctx)).canonical).toBe('Acet');
  });

  it('starts a new step after more than 1,000 ms, for another path, or with no path', () => {
    const { ctx, session } = open();
    const meta = { path: 'names.canonical' };
    let s = editDraft(session, rename('A'), ctx, meta);
    ctx.advance(1000);
    s = editDraft(s, rename('B'), ctx, meta); // exactly 1,000 ms: still joins
    expect(s.past).toHaveLength(1);
    ctx.advance(1001);
    s = editDraft(s, rename('C'), ctx, meta);
    expect(s.past).toHaveLength(2);
    s = editDraft(s, addAlias('x'), ctx, { path: 'names.aliases' });
    expect(s.past).toHaveLength(3);
    s = editDraft(s, rename('D'), ctx);
    s = editDraft(s, rename('E'), ctx);
    expect(s.past).toHaveLength(5);
  });

  it('what coalescing needs is memory only: a session rebuilt from storage starts a new step', () => {
    const { ctx, session } = open();
    const edited = editDraft(session, rename('A'), ctx, { path: 'names.canonical' });
    const reloaded = JSON.parse(JSON.stringify(edited)) as EditorSession;
    expect(Object.keys(reloaded).sort()).toEqual(Object.keys(edited).sort()); // nothing extra is stored
    const again = editDraft(reloaded, rename('AB'), ctx, { path: 'names.canonical' });
    expect(again.past).toHaveLength(2);
  });

  it('local history is bounded to 200 steps, oldest dropped first', () => {
    const { ctx, session } = open();
    let s = session;
    for (let i = 0; i < MAX_DRAFT_STEPS + 25; i += 1) s = editDraft(s, rename(`n${i}`), ctx);
    expect(s.past).toHaveLength(MAX_DRAFT_STEPS);
    let back = s;
    while (canUndoDraft(back)) back = undoDraft(back, ctx);
    expect(namesOf(back).canonical).toBe('n24'); // steps 0..24 are gone: the oldest reachable draft is the state after step 24
    expect(back.future).toHaveLength(MAX_DRAFT_STEPS);
  });
});

describe('undoDraft and redoDraft', () => {
  it('do nothing when there is nothing to do', () => {
    const { ctx, session } = open();
    expect(canUndoDraft(session)).toBe(false);
    expect(canRedoDraft(session)).toBe(false);
    expect(undoDraft(session, ctx)).toBe(session);
    expect(redoDraft(session, ctx)).toBe(session);
  });

  it('property: undoing every step returns each earlier draft in turn and redoing them all returns the final draft', () => {
    const word = fc.stringMatching(/^[A-Za-z]{1,8}$/);
    const edit = fc.oneof(
      word.map(rename),
      word.map(addAlias),
      fc.constant<DraftRecipe>((d) => void (d.names as Names).aliases.pop()),
      word.map((w): DraftRecipe => (d) => void ((d.names as Names).display = w)),
      fc.constant<DraftRecipe>((d) => void delete (d.names as { display?: string }).display),
    );
    fc.assert(
      fc.property(fc.array(edit, { minLength: 1, maxLength: 30 }), (recipes) => {
        const { ctx, session } = open();
        const drafts: unknown[] = [session.draft];
        let s = session;
        for (const recipe of recipes) {
          const next = editDraft(s, recipe, ctx);
          if (next !== s) drafts.push(next.draft);
          s = next;
          ctx.advance(2000);
        }
        let back = s;
        const seen: unknown[] = [back.draft];
        while (canUndoDraft(back)) {
          back = undoDraft(back, ctx);
          seen.push(back.draft);
        }
        expect(seen).toEqual([...drafts].reverse());
        expect(back.draft).toEqual(session.draft);
        let forward = back;
        while (canRedoDraft(forward)) forward = redoDraft(forward, ctx);
        expect(forward.draft).toEqual(s.draft);
        expect(forward.past).toHaveLength(s.past.length);
      }),
      { numRuns: 100 },
    );
  });
});

describe('a blank reagent draft (step 6.2b, decision D5)', () => {
  it('has every required field at its empty value; L1 refuses only the empty name', async () => {
    const { parseRecord } = await import('../validation');
    const result = openSession(clockContext(), makeStore().getState(), 0, { kind: 'reagent', blank: true });
    if (!result.ok) throw new Error('no session');
    const draft = result.session.draft as Record<string, unknown> & { id: string };
    expect(draft).toMatchObject({ kind: 'reagent', components: [], families: [], classIds: [], profiles: [], tags: [], citations: [], names: { canonical: '', common: [], aliases: [] }, provenance: { origin: 'user' }, review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] } });
    expect(draft.id).toMatch(/^rgt_/);
    expect(Object.hasOwn(draft, 'speciesId')).toBe(false);
    const parsed = parseRecord('reagent', draft);
    expect(!parsed.ok && parsed.findings.map((f) => f.path)).toEqual(['names.canonical']);
    expect(parseRecord('reagent', { ...draft, names: { canonical: "Tollens' reagent", common: [], aliases: [] } }).ok).toBe(true);
  });
});

describe('a blank reaction draft (step 6.3a, decisions D4 and 3)', () => {
  it('has every required field at its empty value; L1 refuses only the empty name and the missing scope; no stage', async () => {
    const { parseRecord } = await import('../validation');
    const result = openSession(clockContext(), makeStore().getState(), 0, { kind: 'reaction', blank: true });
    if (!result.ok) throw new Error('no session');
    const draft = result.session.draft as Record<string, unknown> & { id: string };
    expect(draft).toMatchObject({ kind: 'reaction', name: '', aliases: [], purposes: [], participants: [], stages: [], conditionVariants: [], outcomes: [], intermediates: [], reversibility: { kind: 'unknown' }, tags: [], citations: [], provenance: { origin: 'user' }, review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] } });
    expect(draft.id).toMatch(/^rxn_/);
    expect(Object.hasOwn(draft, 'scope')).toBe(false);
    const parsed = parseRecord('reaction', draft);
    expect(!parsed.ok && parsed.findings.map((f) => f.path).sort()).toEqual(['name', 'scope']);
    expect(parseRecord('reaction', { ...draft, name: 'Propan-1-ol + PCC', scope: 'specific' }).ok).toBe(true);
  });
});

describe('a blank mechanism draft (step 6.5a, decision D6)', () => {
  it('has every required field at its empty value; L1 refuses only the empty name; a summary alone is valid', async () => {
    const { parseRecord } = await import('../validation');
    const result = openSession(clockContext(), makeStore().getState(), 0, { kind: 'mechanism', blank: true });
    if (!result.ok) throw new Error('no session');
    const draft = result.session.draft as Record<string, unknown> & { id: string };
    expect(draft).toMatchObject({ kind: 'mechanism', name: '', aliases: [], mechanismClasses: [], variants: [], conceptIds: [], tags: [], citations: [], provenance: { origin: 'user' }, review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] } });
    expect(draft.id).toMatch(/^mec_/);
    const parsed = parseRecord('mechanism', draft);
    expect(!parsed.ok && parsed.findings.map((f) => f.path)).toEqual(['name']);
    expect(parseRecord('mechanism', { ...draft, name: 'Oxidation by PCC', summary: 'Only a summary.' }).ok).toBe(true);
  });
});

describe('a blank class draft (step 6.2b, decision D5)', () => {
  it('has every required field at its empty value except classKind, which is ABSENT; L1 refuses it until a name and a kind are given', async () => {
    const { parseRecord } = await import('../validation');
    const result = openSession(clockContext(), makeStore().getState(), 0, { kind: 'class', blank: true });
    if (!result.ok) throw new Error('no session');
    const draft = result.session.draft as Record<string, unknown> & { id: string };
    expect(draft).toMatchObject({ kind: 'class', parentIds: [], exampleSpeciesIds: [], tags: [], citations: [], names: { canonical: '', common: [], aliases: [] }, provenance: { origin: 'user' }, review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] } });
    expect(draft.id).toMatch(/^cls_/);
    expect(Object.hasOwn(draft, 'classKind')).toBe(false);
    const parsed = parseRecord('class', draft);
    expect(!parsed.ok && parsed.findings.map((f) => f.path).sort()).toEqual(['classKind', 'names.canonical']);
    expect(parseRecord('class', { ...draft, classKind: 'compound_class', names: { canonical: 'Diols', common: [], aliases: [] } }).ok).toBe(true);
  });
});

describe('a blank species draft (ADR-040 addendum, decision D3)', () => {
  it('has every required field at its empty value, the ID and times from the context, and fails L1 only for the empty name', async () => {
    const { parseRecord } = await import('../validation');
    const ctx = clockContext();
    const result = openSession(ctx, makeStore().getState(), 0, { kind: 'species', blank: true });
    if (!result.ok) throw new Error('no session');
    const draft = result.session.draft as { id: string; provenance: { createdAt: string; updatedAt: string } };
    expect(draft).toMatchObject({ kind: 'species', speciesKind: 'unspecified', classIds: [], properties: [], tags: [], citations: [], names: { canonical: '', common: [], aliases: [] }, provenance: { origin: 'user' }, review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] } });
    expect(draft.id).toMatch(/^spc_/);
    expect(draft.provenance.createdAt).toBe(draft.provenance.updatedAt);
    const parsed = parseRecord('species', draft);
    expect(!parsed.ok && parsed.findings.map((f) => f.path)).toEqual(['names.canonical']);
    const named = openSession(ctx, makeStore().getState(), 0, { kind: 'species', blank: true });
    if (!named.ok) throw new Error('no session');
    expect(parseRecord('species', { ...(named.session.draft as object), names: { canonical: 'Propan-1-ol', common: [], aliases: [] } }).ok).toBe(true);
  });
  it('another kind falls back to the smallest draft', () => {
    const result = openSession(clockContext(), makeStore().getState(), 0, { kind: 'topic', blank: true });
    if (!result.ok) throw new Error('no session');
    expect(Object.keys(result.session.draft as object).sort()).toEqual(['id', 'kind']);
  });
});
