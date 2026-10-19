/** commitDraft (ADR-040): L1 first, then the conflict check, then ONE dispatch; a refusal leaves the store unchanged. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clockContext } from '@/test-support/editing-kit';
import { makeStore, mustCommit, recordIn, withFields } from '@/test-support/command-kit';
import type { EditorSession } from '../commands';
import type { Species } from '../schema';
import { commitDraft, editDraft, openSession, type DraftRecipe } from '.';

const SPECIES = 'spc_max-propanone';
type Names = { canonical: string; aliases: string[] };
const rename = (name: string): DraftRecipe => (d) => {
  (d.names as Names).canonical = name;
};
const setNotes = (notes: string): DraftRecipe => (d) => {
  d.notes = notes;
};

function open() {
  const ctx = clockContext();
  const store = makeStore();
  const opened = openSession(ctx, store.getState(), store.getRevision(), { kind: 'species', id: SPECIES });
  if (!opened.ok) throw new Error('no session');
  return { ctx, store, session: opened.session };
}
const edited = (session: EditorSession, ctx: ReturnType<typeof clockContext>, recipe: DraftRecipe) => editDraft(session, recipe, ctx);
const otherEdit = (store: ReturnType<typeof makeStore>, fields: Record<string, unknown>) =>
  mustCommit(store.dispatch({ label: 'Other edit', commands: [{ type: 'record.update', record: withFields(recordIn(store.getState(), 'species', SPECIES), fields) }] }));

describe('commitDraft: success', () => {
  it('one dispatch: one global history entry labelled "Edit <section> of <name>", the revision up by one, selection hint on the record', () => {
    const { ctx, store, session } = open();
    const oldName = (recordIn<Species>(store.getState(), 'species', SPECIES).names).canonical;
    const draft = edited(session, ctx, rename('Propan-2-one'));
    const revision = store.getRevision();
    const outcome = commitDraft(store, draft, ctx, undefined, { section: 'names' });
    expect(outcome.ok).toBe(true);
    expect(store.getRevision()).toBe(revision + 1);
    expect(store.historyLabels().undo).toEqual([`Edit names of ${oldName}`]);
    expect(recordIn<Species>(store.getState(), 'species', SPECIES).names.canonical).toBe('Propan-2-one');
    // the history entry's selection hint
    mustCommit(store.undo() ?? { ok: false, error: { code: 'INTERNAL', message: 'null' } });
    expect(recordIn<Species>(store.getState(), 'species', SPECIES).names.canonical).toBe(oldName);
  });

  it('many local edits are still ONE global entry', () => {
    const { ctx, store, session } = open();
    let s = session;
    for (const name of ['A', 'B', 'C', 'D']) s = edited(s, ctx, rename(name));
    expect(commitDraft(store, s, ctx).ok).toBe(true);
    expect(store.historyLabels().undo).toHaveLength(1);
  });

  it('the store\'s revision moving (another record changed) is not a conflict by itself', () => {
    const { ctx, store, session } = open();
    const draft = edited(session, ctx, rename('Mine'));
    const other = recordIn(store.getState(), 'species', 'spc_max-butanone' in store.getState().records.species ? 'spc_max-butanone' : Object.keys(store.getState().records.species).find((id) => id !== SPECIES) as string);
    mustCommit(store.dispatch({ label: 'Elsewhere', commands: [{ type: 'record.update', record: withFields(other, { notes: 'elsewhere' }) }] }));
    expect(commitDraft(store, draft, ctx).ok).toBe(true);
  });

  it('a new record (no target) is created', () => {
    const { ctx, store } = open();
    const source = recordIn<Species>(store.getState(), 'species', SPECIES);
    const result = openSession(ctx, store.getState(), store.getRevision(), { kind: 'species' });
    if (!result.ok) throw new Error('no session');
    const fresh = editDraft(result.session, (d) => void Object.assign(d, { ...source, id: 'spc_brand-new', names: { ...source.names, canonical: 'Brand new' } }), ctx);
    const outcome = commitDraft(store, fresh, ctx, undefined, { section: 'record' });
    expect(outcome.ok).toBe(true);
    expect(recordIn<Species>(store.getState(), 'species', 'spc_brand-new').names.canonical).toBe('Brand new');
    expect(store.historyLabels().undo).toEqual(['Create species Brand new']);
  });
});

describe('commitDraft: refusals leave the store unchanged', () => {
  it('L1: an empty canonical name is invalid with a finding at its field path', () => {
    const { ctx, store, session } = open();
    const before = store.getState();
    const draft = edited(session, ctx, rename(''));
    const outcome = commitDraft(store, draft, ctx);
    expect(outcome.ok).toBe(false);
    if (outcome.ok || outcome.reason !== 'invalid') throw new Error('expected invalid');
    expect(outcome.findings.some((f) => f.ruleId === 'SCHEMA' && (f.path ?? '').startsWith('names.canonical'))).toBe(true);
    expect(store.getState()).toBe(before);
    expect(store.getRevision()).toBe(0);
    expect(store.canUndo()).toBe(false);
  });

  it('L3 ERROR (a dangling reference passes L1): invalid with the store\'s findings, state and history untouched', () => {
    const { ctx, store, session } = open();
    const before = store.getState();
    const draft = edited(session, ctx, (d) => void (d.classIds = ['cls_does-not-exist']));
    const outcome = commitDraft(store, draft, ctx);
    if (outcome.ok || outcome.reason !== 'invalid') throw new Error('expected invalid');
    expect(outcome.findings.some((f) => f.ruleId === 'REF-001')).toBe(true);
    expect(store.getState()).toBe(before);
    expect(store.getRevision()).toBe(0);
    expect(store.canUndo()).toBe(false);
  });

  it('a read-only store refuses as a value and keeps everything', () => {
    const ctx = clockContext();
    const store = makeStore(undefined, { readOnly: () => true });
    const opened = openSession(ctx, store.getState(), 0, { kind: 'species', id: SPECIES });
    if (!opened.ok) throw new Error('no session');
    const outcome = commitDraft(store, edited(opened.session, ctx, rename('X')), ctx);
    expect(outcome).toMatchObject({ ok: false, reason: 'refused', error: { code: 'READ_ONLY' } });
  });
});

describe('commitDraft: conflicts', () => {
  it('a changed record is a conflict until choices are given; theirsOnly fields take theirs, mineOnly mine', () => {
    const { ctx, store, session } = open();
    const draft = edited(session, ctx, rename('Mine'));
    otherEdit(store, { notes: 'theirs notes' });
    const first = commitDraft(store, draft, ctx);
    expect(first).toMatchObject({ ok: false, reason: 'conflict' });
    if (first.ok || first.reason !== 'conflict') throw new Error('expected conflict');
    expect(first.current).toBe(recordIn(store.getState(), 'species', SPECIES));
    const revision = store.getRevision();
    const second = commitDraft(store, draft, ctx, {});
    expect(second.ok).toBe(true);
    const merged = recordIn<Species>(store.getState(), 'species', SPECIES);
    expect(merged.names.canonical).toBe('Mine');
    expect(merged.notes).toBe('theirs notes');
    expect(store.getRevision()).toBe(revision + 1);
  });

  it('a field both sides changed needs a choice; "mine" and "theirs" each give their value', () => {
    for (const choice of ['mine', 'theirs'] as const) {
      const { ctx, store, session } = open();
      const draft = edited(edited(session, ctx, setNotes('my notes')), ctx, rename('Mine'));
      otherEdit(store, { notes: 'their notes' });
      expect(commitDraft(store, draft, ctx, {})).toMatchObject({ ok: false, reason: 'conflict' });
      expect(commitDraft(store, draft, ctx, { notes: choice }).ok).toBe(true);
      expect(recordIn<Species>(store.getState(), 'species', SPECIES).notes).toBe(choice === 'mine' ? 'my notes' : 'their notes');
    }
  });

  it('a deleted target is a conflict with current null, whatever the choices', () => {
    const { ctx, store } = open();
    const source = recordIn<Species>(store.getState(), 'species', SPECIES);
    mustCommit(store.dispatch({ label: 'Add', commands: [{ type: 'record.create', record: withFields(source, { id: 'spc_short-lived', names: { ...source.names, canonical: 'Short lived' } }) }] }));
    const opened = openSession(ctx, store.getState(), store.getRevision(), { kind: 'species', id: 'spc_short-lived' });
    if (!opened.ok) throw new Error('no session');
    const draft = edited(opened.session, ctx, rename('Mine'));
    mustCommit(store.dispatch({ label: 'Delete', commands: [{ type: 'record.delete', ref: { kind: 'species', id: 'spc_short-lived' }, mode: 'restrict' }] }));
    expect(commitDraft(store, draft, ctx)).toEqual({ ok: false, reason: 'conflict', current: null });
    expect(commitDraft(store, draft, ctx, {})).toEqual({ ok: false, reason: 'conflict', current: null });
  });

  it('an invalid draft is invalid even when the record also changed (L1 comes first)', () => {
    const { ctx, store, session } = open();
    const draft = edited(session, ctx, rename(''));
    otherEdit(store, { notes: 'theirs' });
    expect(commitDraft(store, draft, ctx, {})).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('choosing "theirs" everywhere leaves nothing to save: refused as a value (EMPTY_COMMAND), the store unchanged', () => {
    const { ctx, store, session } = open();
    const draft = edited(session, ctx, setNotes('my notes'));
    otherEdit(store, { notes: 'their notes' });
    const revision = store.getRevision();
    expect(commitDraft(store, draft, ctx, { notes: 'theirs' })).toMatchObject({ ok: false, reason: 'refused', error: { code: 'EMPTY_COMMAND' } });
    expect(store.getRevision()).toBe(revision);
  });
});

describe('commitDraft: a commit after any edit sequence equals the final draft', () => {
  it('property', () => {
    const word = fc.stringMatching(/^[A-Za-z]{1,8}$/);
    const edit = fc.oneof(
      word.map(rename),
      word.map((w): DraftRecipe => (d) => void (d.names as Names).aliases.push(w)),
      fc.constant<DraftRecipe>((d) => void (d.names as Names).aliases.pop()),
      word.map(setNotes),
    );
    fc.assert(
      fc.property(fc.array(edit, { minLength: 1, maxLength: 20 }), (recipes) => {
        const { ctx, store, session } = open();
        let s = session;
        for (const recipe of recipes) s = editDraft(s, recipe, ctx, { path: 'any' });
        if (s.past.length === 0 || JSON.stringify(s.draft) === JSON.stringify(session.draft)) {
          // nothing changed overall: there is nothing to save, said as a value
          expect(commitDraft(store, s, ctx)).toMatchObject({ ok: false, reason: 'refused', error: { code: 'EMPTY_COMMAND' } });
          return;
        }
        expect(commitDraft(store, s, ctx).ok).toBe(true);
        expect(recordIn(store.getState(), 'species', SPECIES)).toEqual(s.draft);
        expect(store.historyLabels().undo).toHaveLength(1);
      }),
      { numRuns: 50 },
    );
  });
});
