/**
 * Merge A INTO B (step 6.8a, D3): every reference to A and every [[A]] link is rewritten to B, A's name and aliases join B's aliases, tags
 * and citations are joined without repeats, list fields are joined, each SCALAR field where A and B differ is a choice (B's value first,
 * nothing changes without the user's pick), and the whole merge is ONE envelope - A is deleted in it - so one Undo restores everything.
 */
import { describe, expect, it } from 'vitest';
import { makeStore, mustCommit, recordIn, ref } from '../../test-support/command-kit';
import { loadFixtureState } from '../../test-support/state-fixture';
import { coreIndexEngine } from '../indexes/engine';
import type { AnyRecord, CanonicalState, ChemicalClass, RecordRef, Species } from '../schema';
import { isMergeable, mergeEnvelope, mergePreview, MERGE_KINDS } from './merge';

const NOW = '2026-10-23T10:00:00.000Z';
const B = ref('species', 'spc_max-diethyl-ether');
const A = ref('species', 'spc_twin-ether');

/** The maximal fixture plus a twin A of B (other alias, other note), a class listing both, and a rich-text link to A. */
function withTwin(overrides: Partial<Species> = {}): { state: CanonicalState; twin: Species } {
  const state = loadFixtureState('maximal-valid');
  const original = { ...recordIn<Species>(state, 'species', B.id), notes: 'Original note.' } as Species; // both sides hold a real note: a choice
  const twin: Species = {
    ...original,
    id: A.id as Species['id'],
    names: { ...original.names, canonical: 'Ethoxyethane (twin)', common: [], aliases: ['Ether', 'Diethyl oxide'] },
    notes: 'The twin note.',
    tags: [...original.tags, 'twin-only'],
    ...overrides,
  };
  const klass = Object.values(state.records.class)[0] as ChemicalClass;
  const records = {
    ...state.records,
    species: { ...state.records.species, [original.id]: original, [A.id]: twin },
    class: { ...state.records.class, [klass.id]: { ...klass, exampleSpeciesIds: [twin.id, original.id], notes: `Compare [[${A.id}]] and [[${A.id}|the twin]].` } },
  };
  return { state: { ...state, records } as unknown as CanonicalState, twin };
}
const indexesOf = (state: CanonicalState) => coreIndexEngine.build(state);

describe('which kinds merge', () => {
  it('the nine kinds of the decision, and others are refused in words', () => {
    expect([...MERGE_KINDS].sort()).toEqual(['class', 'concept', 'exam', 'named_reaction', 'reagent', 'reference', 'species', 'topic', 'transformation']);
    for (const kind of MERGE_KINDS) expect(isMergeable(kind)).toEqual({ ok: true });
    expect(isMergeable('reaction')).toEqual({ ok: false, message: 'Merging reaction is not offered; delete the copy instead.' });
    expect(isMergeable('navigator_anchor')).toEqual({ ok: false, message: 'Merging map family is not offered; delete the copy instead.' });
  });
});

describe('mergePreview', () => {
  it('lists the scalar fields that differ with both values, B first, and every record that will change', () => {
    const { state, twin } = withTwin();
    const preview = mergePreview(state, indexesOf(state), twin, B);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const notes = preview.scalars.find((one) => one.path === 'notes');
    expect(notes).toMatchObject({ path: 'notes', into: recordIn<Species>(state, 'species', B.id).notes, from: 'The twin note.' });
    expect(preview.scalars.map((one) => one.path)).not.toContain('tags');
    expect(preview.scalars.map((one) => one.path)).not.toContain('names.canonical'); // A's name becomes an alias of B, not a choice
    const changed = preview.changes.map((one) => `${one.ref.kind}:${one.ref.id}`);
    expect(changed).toContain(`species:${B.id}`);
    expect(changed).toContain('class:' + (Object.values(state.records.class)[0] as ChemicalClass).id);
    expect(preview.deleted).toEqual({ ref: A, name: 'Ethoxyethane (twin)' });
  });

  it('refuses two records of different kinds, the same record, and a kind that is not offered', () => {
    const { state, twin } = withTwin();
    const indexes = indexesOf(state);
    expect(mergePreview(state, indexes, twin, ref('class', (Object.values(state.records.class)[0] as ChemicalClass).id))).toMatchObject({ ok: false });
    expect(mergePreview(state, indexes, recordIn<Species>(state, 'species', B.id), B)).toMatchObject({ ok: false });
    const reaction = Object.values(state.records.reaction)[0] as AnyRecord;
    expect(mergePreview(state, indexes, reaction, { kind: 'reaction', id: reaction.id } as RecordRef)).toMatchObject({ ok: false, message: 'Merging reaction is not offered; delete the copy instead.' });
  });
});

describe('mergeEnvelope', () => {
  it('is ONE envelope "merge <A> into <B>"; every reference and link points at B, A is gone, aliases and tags are joined without repeats', () => {
    const { state, twin } = withTwin();
    const store = makeStore(state);
    const klass = Object.values(state.records.class)[0] as ChemicalClass;
    const built = mergeEnvelope(store.getState(), indexesOf(store.getState()), twin, B, {}, NOW);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.envelope.label).toBe('merge Ethoxyethane (twin) into ' + recordIn<Species>(state, 'species', B.id).names.canonical);
    mustCommit(store.dispatch(built.envelope));
    const after = store.getState();
    expect(Object.hasOwn(after.records.species, A.id)).toBe(false);
    const merged = recordIn<Species>(after, 'species', B.id);
    expect(merged.names.aliases).toEqual(expect.arrayContaining(['Ethoxyethane (twin)', 'Ether', 'Diethyl oxide']));
    expect(new Set(merged.names.aliases).size).toBe(merged.names.aliases.length);
    expect(merged.names.aliases).not.toContain(merged.names.canonical);
    expect(merged.tags.filter((tag) => tag === 'twin-only')).toHaveLength(1);
    expect(new Set(merged.tags).size).toBe(merged.tags.length);
    expect(merged.notes).toBe(recordIn<Species>(state, 'species', B.id).notes); // nothing changed without a pick
    const linked = recordIn<ChemicalClass>(after, 'class', klass.id);
    expect(linked.exampleSpeciesIds).toEqual([B.id]); // A and B both listed: one B
    expect(linked.notes).toBe(`Compare [[${B.id}]] and [[${B.id}|the twin]].`);
  });

  it('a pick "take" uses A\'s value for that field; "keep" keeps B\'s', () => {
    const { state, twin } = withTwin();
    const store = makeStore(state);
    const built = mergeEnvelope(store.getState(), indexesOf(store.getState()), twin, B, { notes: 'take' }, NOW);
    if (!built.ok) throw new Error('refused');
    mustCommit(store.dispatch(built.envelope));
    expect(recordIn<Species>(store.getState(), 'species', B.id).notes).toBe('The twin note.');
  });

  it('ONE Undo restores every changed record exactly', () => {
    const { state, twin } = withTwin();
    const store = makeStore(state);
    const before = store.getState();
    const built = mergeEnvelope(before, indexesOf(before), twin, B, {}, NOW);
    if (!built.ok) throw new Error('refused');
    mustCommit(store.dispatch(built.envelope));
    expect(store.historyLabels().undo[0]).toBe(built.envelope.label);
    mustCommit(store.undo() ?? { ok: false, error: { code: 'INTERNAL', message: 'nothing to undo' } });
    expect(store.getState().records).toEqual(before.records);
  });

  it('A that is only a draft (not stored) changes B alone: its names join B and nothing is deleted', () => {
    const state = loadFixtureState('maximal-valid');
    const store = makeStore(state);
    const original = { ...recordIn<Species>(state, 'species', B.id), notes: 'Original note.' } as Species; // both sides hold a real note: a choice
    const draft = { ...original, id: 'spc_draft-twin', names: { ...original.names, canonical: 'Drafted twin', aliases: [] } } as unknown as Species;
    const built = mergeEnvelope(state, indexesOf(state), draft, B, {}, NOW);
    if (!built.ok) throw new Error('refused');
    expect(built.envelope.commands.map((command) => command.type)).toEqual(['record.update']);
    mustCommit(store.dispatch(built.envelope));
    expect(recordIn<Species>(store.getState(), 'species', B.id).names.aliases).toContain('Drafted twin');
  });

  it('a list of B that names A is not left pointing at B itself', () => {
    const state = loadFixtureState('maximal-valid');
    const [first, second] = Object.values(state.records.class) as ChemicalClass[];
    if (first === undefined || second === undefined) throw new Error('fixture has fewer than two classes');
    const tangled = { ...state, records: { ...state.records, class: { ...state.records.class, [second.id]: { ...second, parentIds: [first.id] } } } } as unknown as CanonicalState;
    const store = makeStore(tangled);
    const built = mergeEnvelope(tangled, indexesOf(tangled), second, ref('class', first.id), {}, NOW);
    if (!built.ok) throw new Error('refused');
    mustCommit(store.dispatch(built.envelope));
    expect((recordIn<ChemicalClass>(store.getState(), 'class', first.id)).parentIds).not.toContain(first.id);
  });
});

describe('W1/W2 - field words and fields that are only filled in', () => {
  it('every scalar choice carries the editors words, never the schema key', () => {
    const { state, twin } = withTwin({ formula: 'C4H10O', speciesKind: 'ion' } as Partial<Species>);
    const preview = mergePreview(state, indexesOf(state), twin, B);
    if (!preview.ok) throw new Error('refused');
    const words = Object.fromEntries(preview.scalars.map((one) => [one.path, one.words]));
    expect(words['notes']).toBe('Notes');
    for (const one of preview.scalars) expect(one.words).not.toMatch(/^[a-z]+[A-Z]/);
    if (words['formula'] !== undefined) expect(words['formula']).toBe('Formula');
    if (words['speciesKind'] !== undefined) expect(words['speciesKind']).toBe('Kind of species');
  });
  it('an empty or "unspecified" side is not a choice: the real value is kept and listed as filled in from A', () => {
    const { state, twin } = withTwin({ formula: 'C4H10O', notes: undefined, speciesKind: 'unspecified' } as unknown as Partial<Species>);
    const bare = { ...state.records.species[B.id], formula: undefined, speciesKind: 'molecule', notes: 'Kept note.' };
    const withBare = { ...state, records: { ...state.records, species: { ...state.records.species, [B.id]: bare } } } as unknown as CanonicalState;
    const preview = mergePreview(withBare, indexesOf(withBare), twin, B);
    if (!preview.ok) throw new Error('refused');
    const paths = preview.scalars.map((one) => one.path);
    expect(paths).not.toContain('formula'); // B empty, A real: filled in
    expect(paths).not.toContain('speciesKind'); // A unspecified: B's value stays
    expect(paths).not.toContain('notes'); // A empty
    expect(preview.filled).toEqual([{ path: 'formula', words: 'Formula', value: 'C4H10O' }]);
    expect(preview.fromName).toBe('Ethoxyethane (twin)');
    const store = makeStore(withBare);
    const built = mergeEnvelope(store.getState(), indexesOf(store.getState()), twin, B, {}, NOW);
    if (!built.ok) throw new Error('refused');
    mustCommit(store.dispatch(built.envelope));
    const merged = recordIn<Species>(store.getState(), 'species', B.id);
    expect((merged as unknown as { formula?: string }).formula).toBe('C4H10O');
    expect(merged.speciesKind).toBe('molecule');
    expect(merged.notes).toBe('Kept note.');
  });
  it('two different real values stay a choice', () => {
    const { state, twin } = withTwin({ notes: 'A note.' });
    const preview = mergePreview(state, indexesOf(state), twin, B);
    if (!preview.ok) throw new Error('refused');
    expect(preview.scalars.map((one) => one.path)).toContain('notes');
    expect(preview.filled.map((one) => one.path)).not.toContain('notes');
  });
});
