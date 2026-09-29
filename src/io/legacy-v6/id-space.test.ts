/**
 * Step 3.9: deterministic legacy IDs (docs/MIGRATION.md §4.2): one test per row of the table, sanitising and the hash suffix,
 * collisions within one document, determinism and order independence, and the schema's ID pattern for every kind of ID built.
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hash64 } from '@/core/hash';
import {
  AssetIdSchema,
  CaveatIdSchema,
  ClassIdSchema,
  ConceptIdSchema,
  EntityDisplayIdSchema,
  ExamRelevanceIdSchema,
  NamedReactionIdSchema,
  NavigatorAnchorIdSchema,
  OutcomeIdSchema,
  ParticipantIdSchema,
  ProductIdSchema,
  ReactionIdSchema,
  ReagentIdSchema,
  RelationshipIdSchema,
  SpeciesIdSchema,
  StageIdSchema,
  TopicIdSchema,
} from '@/core/schema';
import { legacyAssetId, createLegacyIdSpace } from './id-space';
import { legacyPart, resolveParts, sanitizeLegacyId, MAX_PART_LENGTH } from './id-parts';

const h6 = (original: string): string => hash64(original).slice(0, 6);

describe('sanitising (§4.2 first paragraph)', () => {
  it.each([
    ['c15', 'c15', 'c15'],
    ['r5', 'r5', 'r5'],
    ['c-missing-1', 'c-missing-1', 'c-missing-1'],
    ['C15', 'c15', `c15-${h6('C15')}`],
    ['a b', 'a-b', `a-b-${h6('a b')}`],
    ['r_5', 'r-5', `r-5-${h6('r_5')}`],
    ['c.15', 'c-15', `c-15-${h6('c.15')}`],
    ['é', '-', `--${h6('é')}`],
    ['😀', '-', `--${h6('😀')}`],
    ['', '', `-${h6('')}`],
  ])('%j sanitises to %j and its part is %j', (original, sanitized, part) => {
    expect(sanitizeLegacyId(original)).toBe(sanitized);
    expect(legacyPart(original, 0)).toBe(part);
  });

  it('appends the hash of the ORIGINAL, so values that sanitise alike stay apart', () => {
    expect(legacyPart('C15', 0)).not.toBe(legacyPart('c 15', 0));
    expect(sanitizeLegacyId('C15')).toBe('c15');
    expect(legacyPart('C15', 0)).not.toBe('c15');
  });

  it('uses the core hash64 (step 2.2), first 6 hex characters', () => {
    expect(legacyPart('X!', 0)).toBe(`x--${hash64('X!').slice(0, 6)}`);
  });

  it('caps a part at MAX_PART_LENGTH; a longer original is truncated and carries the hash of the whole', () => {
    const long = 'c'.repeat(40);
    const part = legacyPart(long, 0);
    expect(part.length).toBeLessThanOrEqual(MAX_PART_LENGTH);
    expect(part.endsWith(`-${h6(long)}`)).toBe(true);
    expect(legacyPart('c'.repeat(MAX_PART_LENGTH), 0)).toBe('c'.repeat(MAX_PART_LENGTH));
    expect(legacyPart('c'.repeat(MAX_PART_LENGTH + 1), 0)).not.toBe('c'.repeat(MAX_PART_LENGTH));
  });
});

const space = createLegacyIdSpace({
  compoundIds: ['c15', 'c6', 'c14'],
  reactionIds: ['r5', 'r16', 'r3', 'r12'],
  labels: ['KOH', 'Lindlar catalyst'],
  concepts: ['Nucleophilic substitution'],
  namedReactions: ['Cannizzaro reaction'],
  topics: ['Haloalkanes and Haloarenes'],
  relatedPairs: [
    ['r3', 'r12'],
    ['r12', 'r3'],
  ],
});

describe('every row of the §4.2 table', () => {
  it('species / class from compound c15', () => {
    expect(space.speciesId('c15')).toBe('spc_v6-c15');
    expect(space.classId('c15')).toBe('cls_v6-c15');
  });

  it('reaction r5 and its nested records', () => {
    expect(space.reactionId('r5')).toBe('rxn_v6-r5');
    expect(space.participantId('r5', 2)).toBe('prt_v6-r5-2');
    expect(space.stageId('r5', 1)).toBe('stg_v6-r5-1');
    expect(space.outcomeId('r5')).toBe('out_v6-r5-1');
    expect(space.productId('r5', 3)).toBe('pdt_v6-r5-3');
  });

  it('records created from a free-text label: reagent and species, deduplicated by folded label', () => {
    expect(space.reagentFromLabelId('KOH')).toBe(`rgt_v6-l-koh-${h6('koh')}`);
    expect(space.speciesFromLabelId('KOH')).toBe(`spc_v6-l-koh-${h6('koh')}`);
    expect(space.reagentFromLabelId('  koh ')).toBe(space.reagentFromLabelId('KOH'));
    expect(space.reagentFromLabelId('Lindlar catalyst')).toMatch(/^rgt_v6-l-lindlar-catalyst-[0-9a-f]{6}$/);
  });

  it('concept, named reaction and topic from text', () => {
    expect(space.conceptId('Nucleophilic substitution')).toBe(`cpt_v6-nucleophilic-substitution-${h6('nucleophilic substitution')}`);
    expect(space.namedReactionId('Cannizzaro reaction')).toBe(`nrx_v6-cannizzaro-reaction-${h6('cannizzaro reaction')}`);
    expect(space.topicId('Haloalkanes and Haloarenes')).toBe(`top_v6-haloalkanes-and-haloarenes-${h6('haloalkanes and haloarenes')}`);
  });

  it('trap -> caveat, relevance', () => {
    expect(space.caveatId('r16', 1)).toBe('cav_v6-r16-1');
    expect(space.relevanceId('r16', 'main')).toBe('erl_v6-r16-main');
    expect(space.relevanceId('r16', 'advanced')).toBe('erl_v6-r16-advanced');
  });

  it('related reactions: symmetric, lower legacy ID (code-unit order) first, one per pair', () => {
    expect(space.relatedReactionId('r3', 'r12')).toBe('rel_v6-r12-r3');
    expect(space.relatedReactionId('r12', 'r3')).toBe('rel_v6-r12-r3');
    expect(space.relatedReactionId('r5', 'r5')).toBeUndefined();
  });

  it('image: the first 16 hex of the sha256', () => {
    const digest = 'ab'.repeat(32);
    expect(legacyAssetId(digest)).toBe('ast_v6-abababababababab');
    expect(() => legacyAssetId('short')).toThrow(TypeError);
    expect(() => legacyAssetId('AB'.repeat(32))).toThrow(TypeError);
  });

  it('hub anchor and display', () => {
    expect(space.anchorId('c6')).toBe('anc_v6-c6');
    expect(space.displayId('c14')).toBe('edp_v6-c14');
  });

  it('a value that was not registered is a programmer error (it could not have been checked for collisions)', () => {
    expect(() => space.speciesId('c999')).toThrow();
    expect(() => space.reagentFromLabelId('never registered')).toThrow();
    expect(() => space.participantId('r5', 0)).toThrow(RangeError);
  });
});

describe('the schema ID pattern for every kind', () => {
  const originals = ['c15', 'C15', 'a b', '', 'é', '😀', 'x'.repeat(200), 'y'.repeat(100), 'a'.repeat(27), 'a'.repeat(28), 'c-missing-1', '__proto__'];
  const all = createLegacyIdSpace({
    compoundIds: originals,
    reactionIds: originals,
    labels: originals.concat(['Δ compound', '   ', 'A very long label '.repeat(20)]),
    concepts: originals,
    namedReactions: originals,
    topics: originals,
    relatedPairs: originals.flatMap((a) => originals.map((b) => [a, b] as const)),
  });
  const cases: [string, { parse(value: unknown): unknown }, (original: string) => string][] = [
    ['species', SpeciesIdSchema, (o) => all.speciesId(o)],
    ['class', ClassIdSchema, (o) => all.classId(o)],
    ['anchor', NavigatorAnchorIdSchema, (o) => all.anchorId(o)],
    ['display', EntityDisplayIdSchema, (o) => all.displayId(o)],
    ['reaction', ReactionIdSchema, (o) => all.reactionId(o)],
    ['participant', ParticipantIdSchema, (o) => all.participantId(o, 64)],
    ['stage', StageIdSchema, (o) => all.stageId(o, 16)],
    ['outcome', OutcomeIdSchema, (o) => all.outcomeId(o, 32)],
    ['product', ProductIdSchema, (o) => all.productId(o, 32)],
    ['caveat', CaveatIdSchema, (o) => all.caveatId(o, 64)],
    ['relevance', ExamRelevanceIdSchema, (o) => all.relevanceId(o, 'advanced')],
    ['reagent from label', ReagentIdSchema, (o) => all.reagentFromLabelId(o)],
    ['species from label', SpeciesIdSchema, (o) => all.speciesFromLabelId(o)],
    ['concept', ConceptIdSchema, (o) => all.conceptId(o)],
    ['named reaction', NamedReactionIdSchema, (o) => all.namedReactionId(o)],
    ['topic', TopicIdSchema, (o) => all.topicId(o)],
  ];
  it.each(cases)('%s IDs pass their schema', (_kind, schema, build) => {
    for (const original of originals) expect(() => schema.parse(build(original))).not.toThrow();
  });

  it('related-reaction IDs pass the relationship schema for every pair', () => {
    for (const a of originals) for (const b of originals) {
      const id = all.relatedReactionId(a, b);
      if (a === b) expect(id).toBeUndefined();
      else expect(() => RelationshipIdSchema.parse(id)).not.toThrow();
    }
  });

  it('asset IDs pass the asset schema', () => {
    expect(() => AssetIdSchema.parse(legacyAssetId('0123456789abcdef'.repeat(4)))).not.toThrow();
  });

  it('holds for arbitrary strings (property)', () => {
    const unit = fc.oneof(fc.char16bits(), fc.fullUnicode(), fc.constantFrom('-', ' ', '.', '_', 'A', 'Z', '\u0000', '‮', '/'));
    fc.assert(
      fc.property(fc.array(fc.string({ unit, maxLength: 80 }), { maxLength: 12 }), (values) => {
        const s = createLegacyIdSpace({ compoundIds: values, reactionIds: values, labels: values, relatedPairs: values.flatMap((a) => values.map((b) => [a, b] as const)) });
        for (const v of values) {
          SpeciesIdSchema.parse(s.speciesId(v));
          ReactionIdSchema.parse(s.reactionId(v));
          ParticipantIdSchema.parse(s.participantId(v, 1234567));
          ReagentIdSchema.parse(s.reagentFromLabelId(v));
          for (const w of values) {
            const id = s.relatedReactionId(v, w);
            if (id !== undefined) RelationshipIdSchema.parse(id);
          }
        }
      }),
      { numRuns: 60, seed: 90210 },
    );
  });
});

describe('determinism', () => {
  const values = ['c1', 'C1', 'c 1', 'c1!', 'x'.repeat(50), 'é'];
  it('the same input gives the same IDs on every call', () => {
    const a = createLegacyIdSpace({ compoundIds: values });
    const b = createLegacyIdSpace({ compoundIds: values });
    expect(values.map((v) => a.speciesId(v))).toEqual(values.map((v) => b.speciesId(v)));
  });

  it('the order (and repeats) of the registered values do not matter', () => {
    const a = createLegacyIdSpace({ compoundIds: values, reactionIds: values });
    const b = createLegacyIdSpace({ compoundIds: [...values].reverse().concat(values), reactionIds: [...values].sort() });
    for (const v of values) {
      expect(b.speciesId(v)).toBe(a.speciesId(v));
      expect(b.reactionId(v)).toBe(a.reactionId(v));
    }
  });

  it('different originals never share an ID (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ maxLength: 40 }), { maxLength: 40 }), (values) => {
        const s = createLegacyIdSpace({ compoundIds: values });
        const seen = new Map<string, string>();
        for (const v of new Set(values)) {
          const id = s.speciesId(v);
          expect(seen.get(id)).toBeUndefined();
          seen.set(id, v);
        }
      }),
      { numRuns: 100, seed: 42 },
    );
  });
});

describe('collisions within one document (never merged silently)', () => {
  // 'c15!' sanitises to 'c15-', so its part is 'c15--<h6>'; that text is itself a valid, unchanged legacy ID.
  const changed = 'c15!';
  const lookalike = `c15--${h6(changed)}`;

  it('two different originals with the same part are both moved to a longer hash and reported', () => {
    expect(legacyPart(changed, 0)).toBe(legacyPart(lookalike, 0));
    const s = createLegacyIdSpace({ compoundIds: [changed, lookalike, 'c15'] });
    expect(s.speciesId(changed)).not.toBe(s.speciesId(lookalike));
    expect(s.speciesId(changed)).toBe(`spc_v6-${legacyPart(changed, 1)}`);
    expect(s.speciesId(lookalike)).toBe(`spc_v6-${legacyPart(lookalike, 1)}`);
    expect(s.speciesId('c15')).toBe('spc_v6-c15'); // not involved, keeps its short ID
    expect(s.collisions).toEqual([
      {
        namespace: 'compound',
        sharedPart: legacyPart(changed, 0),
        originals: [changed, lookalike].sort(),
        resolved: [changed, lookalike].sort().map((original) => ({ original, part: legacyPart(original, 1) })),
      },
    ]);
    SpeciesIdSchema.parse(s.speciesId(changed));
    SpeciesIdSchema.parse(s.speciesId(lookalike));
  });

  it('is deterministic and independent of order', () => {
    const a = createLegacyIdSpace({ compoundIds: [changed, lookalike] });
    const b = createLegacyIdSpace({ compoundIds: [lookalike, changed] });
    expect(b.speciesId(changed)).toBe(a.speciesId(changed));
    expect(b.collisions).toEqual(a.collisions);
  });

  it('an ordinary document reports no collision', () => {
    expect(space.collisions).toEqual([]);
  });

  it('a collision in one namespace does not touch another (a compound and a reaction may share a legacy ID)', () => {
    const s = createLegacyIdSpace({ compoundIds: ['x1'], reactionIds: ['x1'] });
    expect(s.speciesId('x1')).toBe('spc_v6-x1');
    expect(s.reactionId('x1')).toBe('rxn_v6-x1');
    expect(s.collisions).toEqual([]);
  });

  it('text-derived IDs collide the same way: distinct folded labels never share an ID', () => {
    const s = createLegacyIdSpace({ labels: ['KOH', 'NaOH', 'koh', 'K O H'] });
    expect(s.reagentFromLabelId('KOH')).toBe(s.reagentFromLabelId('koh'));
    expect(new Set(['KOH', 'NaOH', 'K O H'].map((l) => s.reagentFromLabelId(l))).size).toBe(3);
  });

  it('pairs whose reactions join to the same text are told apart', () => {
    // "a-b" + "c" and "a" + "b-c" both read a-b-c.
    const s = createLegacyIdSpace({ reactionIds: ['a-b', 'c', 'a', 'b-c'], relatedPairs: [['a-b', 'c'], ['a', 'b-c']] });
    const first = s.relatedReactionId('a-b', 'c');
    const second = s.relatedReactionId('a', 'b-c');
    expect(first).not.toBe(second);
    RelationshipIdSchema.parse(first);
    RelationshipIdSchema.parse(second);
    expect(s.collisions.map((c) => c.namespace)).toEqual(['relationship']);
  });
});

describe('resolveParts: deeper tiers', () => {
  it('a ladder that always collides ends in unique tier-3 parts (hash16 and an ordinal), all reported', () => {
    const result = resolveParts('t', ['a', 'b', 'c'], () => 'x');
    const parts = [...result.parts.values()];
    expect(new Set(parts).size).toBe(3);
    for (const part of parts) expect(part).toMatch(/^[0-9a-f]{16}-\d+$/);
    expect(result.collisions.length).toBeGreaterThan(0);
    expect(result.collisions.every((c) => c.originals.length >= 2)).toBe(true);
  });

  it('a tier-3 ordinal skips a part another key already holds', () => {
    const taken = `${hash64('b').slice(0, 16)}-1`;
    const result = resolveParts('t', ['a', 'b', 'c'], (key) => (key === 'a' ? taken : 'x'));
    expect(new Set(result.parts.values()).size).toBe(3);
    expect(result.parts.get('a')).toBe(taken);
    expect([result.parts.get('b'), result.parts.get('c')].sort()).toEqual([`${hash64('b').slice(0, 16)}-2`, `${hash64('c').slice(0, 16)}-1`].sort());
  });

  it('is total for any set of keys and any ladder that ignores its tier (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ maxLength: 6 }), { maxLength: 30 }), fc.integer({ min: 1, max: 4 }), (keys, modulus) => {
        const result = resolveParts('t', keys, (key) => `p${key.length % modulus}`);
        const unique = new Set(keys);
        expect(new Set(result.parts.values()).size).toBe(unique.size);
        expect(result.parts.size).toBe(unique.size);
      }),
      { numRuns: 100, seed: 7 },
    );
  });
});
