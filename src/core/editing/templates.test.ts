/**
 * Duplicate a reaction and start a specific reaction from a generic one (step 6.7a, decisions C2 and C3): pure seeds for a NEW draft.
 * Every nested id is new and the copy's own links follow the new ids; references to other records stay; nothing that points AT the
 * original is copied (it is not part of the record); a class participant or class product becomes an empty slot, nothing is guessed.
 */
import { describe, expect, it } from 'vitest';
import type { Reaction } from '../schema';
import { demoState } from '@/test-support/app-boot-kit';
import { duplicateSeed, SLOT_KEY, specificSeed } from './templates';

const ctx = (() => {
  let n = 0;
  return { now: () => '2026-10-22T00:00:00.000Z', newId: (prefix: string) => `${prefix}_t${(n += 1)}` } as never;
})();
const state = demoState();
const reactions = Object.values(state.records.reaction) as Reaction[];
const generic = reactions.find((r) => r.scope === 'generic') as Reaction;
const specific = reactions.find((r) => r.scope === 'specific' && r.outcomes.length > 0 && r.stages.length > 0) as Reaction;

const nestedIds = (r: Reaction): string[] => [
  ...r.participants.map((p) => p.id),
  ...r.stages.map((s) => s.id),
  ...r.conditionVariants.map((v) => v.id),
  ...r.outcomes.flatMap((o) => [o.id, ...o.products.map((p) => p.id)]),
  ...r.intermediates.map((i) => i.id),
];

describe('duplicateSeed (C2)', () => {
  const seed = duplicateSeed(state, { kind: 'reaction', id: specific.id }, ctx) as Record<string, unknown>;
  const copy = seed as unknown as Reaction;
  it('is a seed for a new draft: no id, kind, provenance or review; the name says copy', () => {
    for (const field of ['id', 'kind', 'provenance', 'review']) expect(seed).not.toHaveProperty(field);
    expect(copy.name).toBe(`${specific.name} (copy)`);
  });
  it('copies the record\'s own content: participants, stages, variants, outcomes, classification, links, notes, tags, citations', () => {
    expect(copy.participants.map((p) => p.ref)).toEqual(specific.participants.map((p) => p.ref));
    expect(copy.participants.map((p) => p.role)).toEqual(specific.participants.map((p) => p.role));
    expect(copy.outcomes.map((o) => o.selectivity)).toEqual(specific.outcomes.map((o) => o.selectivity));
    expect(copy.outcomes.map((o) => o.products.map((p) => [p.ref, p.role]))).toEqual(specific.outcomes.map((o) => o.products.map((p) => [p.ref, p.role])));
    expect(copy.stages.map((s) => s.kind)).toEqual(specific.stages.map((s) => s.kind));
    expect(copy.reactionTypes).toEqual(specific.reactionTypes);
    expect(copy.namedReactionIds).toEqual(specific.namedReactionIds);
    expect(copy.mechanismIds).toEqual(specific.mechanismIds);
    expect(copy.tags).toEqual(specific.tags);
    expect(copy.citations).toEqual(specific.citations);
    expect(copy.instanceOfId).toBe(specific.instanceOfId);
  });
  it('gives EVERY nested id a new value and the copy\'s own links follow them', () => {
    const old = new Set(nestedIds(specific));
    const fresh = nestedIds(copy);
    expect(fresh).toHaveLength(old.size);
    for (const id of fresh) expect(old.has(id)).toBe(false);
    expect(new Set(fresh).size).toBe(fresh.length);
    const participants = new Set(copy.participants.map((p) => p.id));
    const variants = new Set(copy.conditionVariants.map((v) => v.id));
    for (const stage of copy.stages) for (const id of stage.participantIds) expect(participants.has(id)).toBe(true);
    for (const outcome of copy.outcomes) for (const id of outcome.conditionVariantIds) expect(variants.has(id)).toBe(true);
  });
  it('the source is not changed; a missing or non-reaction ref gives nothing', () => {
    expect(nestedIds(specific)).toEqual(nestedIds(state.records.reaction[specific.id] as Reaction));
    expect(duplicateSeed(state, { kind: 'reaction', id: 'rxn_nope' } as never, ctx)).toBeUndefined();
    expect(duplicateSeed(state, { kind: 'species', id: Object.keys(state.records.species)[0] } as never, ctx)).toBeUndefined();
  });
});

describe('specificSeed (C3)', () => {
  const seed = specificSeed(state, { kind: 'reaction', id: generic.id }, ctx) as Record<string, unknown>;
  const made = seed as unknown as Reaction & Record<string, unknown>;
  it('only a generic reaction can start one', () => {
    expect(specificSeed(state, { kind: 'reaction', id: specific.id }, ctx)).toBeUndefined();
    expect(specificSeed(state, { kind: 'reaction', id: 'rxn_nope' } as never, ctx)).toBeUndefined();
  });
  it('is specific, an instance of the generic reaction, with an empty name', () => {
    expect(made.scope).toBe('specific');
    expect(made.instanceOfId).toBe(generic.id);
    expect(made.name).toBe('');
    expect(made.aliases).toEqual([]);
    for (const field of ['id', 'kind', 'provenance', 'review']) expect(seed).not.toHaveProperty(field);
  });
  it('every class participant and class product is an empty slot that remembers its class; species and reagents are kept', () => {
    generic.participants.forEach((p, i) => {
      const copy = made.participants[i] as unknown as Record<string, unknown>;
      if (p.ref.kind === 'class') expect(copy[SLOT_KEY]).toBe(p.ref.id);
      else expect(copy).not.toHaveProperty(SLOT_KEY);
      expect(copy.ref).toEqual(p.ref);
      expect(copy.role).toBe(p.role);
    });
    expect(made.participants.some((p) => (p as unknown as Record<string, unknown>)[SLOT_KEY] !== undefined)).toBe(true);
    generic.outcomes.forEach((o, i) => {
      o.products.forEach((p, j) => {
        const copy = made.outcomes[i]?.products[j] as unknown as Record<string, unknown>;
        if (p.ref.kind === 'class') expect(copy[SLOT_KEY]).toBe(p.ref.id);
        expect(copy.role).toBe(p.role);
      });
      expect(made.outcomes[i]?.selectivity).toBe(o.selectivity); // copied as it is
    });
  });
  it('stages and variants are copied with new ids; nothing else is guessed (no classification, links or intermediates)', () => {
    const old = new Set(nestedIds(generic));
    for (const id of nestedIds(made)) expect(old.has(id)).toBe(false);
    expect(made.stages).toHaveLength(generic.stages.length);
    expect(made.conditionVariants).toHaveLength(generic.conditionVariants.length);
    expect(made.intermediates).toEqual([]);
    expect(made.mechanismIds).toEqual([]);
    expect(made.reactionTypes).toEqual([]);
    expect(made.namedReactionIds).toEqual([]);
    const participants = new Set(made.participants.map((p) => p.id));
    for (const stage of made.stages) for (const id of stage.participantIds) expect(participants.has(id)).toBe(true);
  });
});
