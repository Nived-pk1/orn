/**
 * Step 3.11b: the §4.5 rows of the classification and curriculum fields (all but the transformation rows, which are in classify-transformation.test.ts), one by one. Small v5 documents run through the real port,
 * ID space, compound mapper, reaction mapper and classification step (empty match context unless a test says otherwise); every
 * expected value is written by hand.
 */
import { describe, expect, it } from 'vitest';
import { ConceptIdSchema, MechanismIdSchema, NamedReactionIdSchema, RelationshipIdSchema, TopicIdSchema, TopicMappingIdSchema, CaveatIdSchema, type Reaction } from '@/core/schema';
import { coreIndexEngine } from '@/core/indexes/engine';
import { validator } from '@/core/validation';
import { mapClassified, type ClassifiedAll } from '@/test-support/legacy-classify-kit';
import { stateOfRecords } from '@/test-support/legacy-map-kit';

const COMPOUNDS = [
  { id: 'c1', name: 'Alkenes', nodeType: 'major', fgId: 'alkene' },
  { id: 'c2', name: 'Alcohols', nodeType: 'major', fgId: 'alcohol' },
  { id: 'c3', name: 'Ethene', functionalGroups: ['alkene'] },
  { id: 'c4', name: 'Ethanol', functionalGroups: ['alcohol'] },
];
const part = (role: string, ref: string, extra: Record<string, unknown> = {}) => ({ ref, label: '', role, major: false, note: '', image: '', ...extra });
const BASE = [part('substrate', 'c3'), part('product', 'c4', { major: true })];
const rx = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `Reaction ${id}`, participants: BASE, ...extra });
const run = (reactions: unknown[], options: Parameters<typeof mapClassified>[1] = {}, compounds: unknown[] = COMPOUNDS) => mapClassified({ schemaVersion: 5, compounds, reactions }, options);
const reactionOf = (all: ClassifiedAll, n = 0): Reaction => all.classification.records.reaction[n] as Reaction;
const unmappedOf = (record: { provenance: { legacy?: { unmapped?: unknown } } }): Record<string, unknown> => (record.provenance.legacy?.unmapped ?? {}) as Record<string, unknown>;
const reasonsOf = (r: Reaction): string[] => [...r.review.reasons];


describe('mechanism.type / summary', () => {
  it('type → a mechanism_class concept, created (published, review_required) → mechanismClasses with certainty probable', async () => {
    const all = await run([rx('r1', { mechanism: { type: 'SN2', summary: '' } })]);
    const reaction = reactionOf(all);
    const concept = all.classification.records.concept[0];
    expect(concept).toMatchObject({ kind: 'concept', name: 'SN2', conceptKind: 'mechanism_class', aliases: [], parentIds: [], review: { lifecycle: 'published', status: 'review_required' } });
    expect(ConceptIdSchema.safeParse(concept?.id).success).toBe(true);
    expect(reaction.mechanismClasses).toEqual([{ conceptId: concept?.id, certainty: 'probable' }]);
    expect(reaction.mechanismIds).toEqual([]);
    expect(all.classification.records.mechanism).toEqual([]);
  });

  it('summary → a mechanism record with the summary and NO variants; the validator says MEC-001 (info) and nothing worse', async () => {
    const all = await run([rx('r1', { mechanism: { type: 'SN2', summary: 'Hydroxide attacks the electrophilic carbon.' } })]);
    const [mechanism, ...others] = all.classification.records.mechanism;
    expect(others).toEqual([]);
    expect(MechanismIdSchema.safeParse(mechanism?.id).success).toBe(true);
    expect(mechanism).toMatchObject({ id: 'mec_v6-r1', name: 'Mechanism of Reaction r1', summary: 'Hydroxide attacks the electrophilic carbon.', variants: [], conceptIds: [], review: { lifecycle: 'published', status: 'unreviewed', reasons: [] } });
    expect(mechanism?.mechanismClasses).toEqual(reactionOf(all).mechanismClasses);
    expect(reactionOf(all).mechanismIds).toEqual(['mec_v6-r1']);
    const state = stateOfRecords(all.all);
    const findings = validator.validateAll(state, coreIndexEngine.build(state, 1));
    expect(findings.filter((f) => f.ruleId === 'MEC-001').map((f) => [f.severity, f.subject.id])).toEqual([['info', 'mec_v6-r1']]);
    expect(findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('a summary without a type makes a mechanism with no classes; a type without a summary makes no mechanism', async () => {
    const only = await run([rx('r1', { mechanism: { type: '', summary: 'text' } }), rx('r2', { mechanism: { type: 'E2', summary: '' } })]);
    expect(only.classification.records.mechanism.map((m) => [m.id, m.mechanismClasses])).toEqual([['mec_v6-r1', []]]);
    expect(only.classification.records.reaction.map((r) => r.mechanismClasses.length)).toEqual([0, 1]);
  });

  it('a whitespace-only summary and a type the schema cannot name are kept, with reasons', async () => {
    const all = await run([rx('r1', { mechanism: { type: 'bad\u0001', summary: '   ', foo: 'bar' } })]);
    const reaction = reactionOf(all);
    expect(all.classification.records.mechanism).toEqual([]);
    expect(all.classification.records.concept).toEqual([]);
    expect(unmappedOf(reaction).mechanism).toEqual({ type: 'bad\u0001', summary: '   ', foo: 'bar' });
    expect(reasonsOf(reaction).filter((r) => r.startsWith('mechanism.') || r.includes('under mechanism')).length).toBe(3);
  });
});

describe('reactionType, reactionFamily', () => {
  it('reactionType → a reaction_type concept → reactionTypes; reactionFamily → a reaction_family concept → conceptIds', async () => {
    const all = await run([rx('r1', { reactionType: 'substitution', reactionFamily: 'nucleophilic substitution' })]);
    const reaction = reactionOf(all);
    const [type, family] = all.classification.records.concept;
    expect([type?.conceptKind, type?.name, family?.conceptKind, family?.name]).toEqual(['reaction_type', 'substitution', 'reaction_family', 'nucleophilic substitution']);
    expect(reaction.reactionTypes).toEqual([{ conceptId: type?.id, certainty: 'definite' }]);
    expect(reaction.conceptIds).toEqual([family?.id]);
  });

  it('one record per folded text across reactions; a repeat adds nothing', async () => {
    const all = await run([rx('r1', { reactionType: 'Addition' }), rx('r2', { reactionType: '  addition' }), rx('r3', { reactionType: 'ADDITION' })]);
    expect(all.classification.records.concept).toHaveLength(1);
    expect(all.classification.records.concept[0]?.name).toBe('Addition'); // the first spelling, stored verbatim
    expect(all.classification.records.reaction.map((r) => r.reactionTypes[0]?.conceptId)).toEqual([all.classification.records.concept[0]?.id, all.classification.records.concept[0]?.id, all.classification.records.concept[0]?.id]);
  });

  it('the same text under two roles is ONE record, and the record says so', async () => {
    const all = await run([rx('r1', { reactionType: 'oxidation', reactionFamily: 'Oxidation' })]);
    expect(all.classification.records.concept).toHaveLength(1);
    const concept = all.classification.records.concept[0];
    expect(concept?.conceptKind).toBe('reaction_type');
    expect(concept?.review.reasons.some((r) => r.includes('also used as a reaction_family concept'))).toBe(true);
    expect(reactionOf(all).conceptIds).toEqual([concept?.id]);
  });

  it('a value the schema cannot name is kept with a reason; whitespace-only is kept too', async () => {
    const all = await run([rx('r1', { reactionType: 'x'.repeat(400), reactionFamily: '  ' })]);
    expect(all.classification.records.concept).toEqual([]);
    expect(unmappedOf(reactionOf(all))).toMatchObject({ reactionType: 'x'.repeat(400), reactionFamily: '  ' });
  });
});

describe('reagentFamily', () => {
  it('is kept in legacy.unmapped (no reason), and the DISTINCT values are returned with counts, sorted', async () => {
    const all = await run([rx('r1', { reagentFamily: 'aq. KOH' }), rx('r2', { reagentFamily: 'Cumene process' }), rx('r3', { reagentFamily: 'aq. KOH' }), rx('r4', { reagentFamily: '' }), rx('r5', { reagentFamily: 'aq. koh' })]);
    expect(all.classification.reagentFamilies).toEqual([
      { value: 'Cumene process', count: 1 },
      { value: 'aq. KOH', count: 2 },
      { value: 'aq. koh', count: 1 },
    ]);
    const [r1, , , r4] = all.classification.records.reaction;
    expect(unmappedOf(r1 as Reaction).reagentFamily).toBe('aq. KOH');
    expect(unmappedOf(r4 as Reaction).reagentFamily).toBeUndefined();
    expect(reasonsOf(r1 as Reaction)).toEqual([]);
    expect(all.classification.report.preservedUnmappedFields['reaction.reagentFamily']).toBe(4);
  });
});

describe('namedReaction', () => {
  it('created once per folded name (published, review_required) → namedReactionIds', async () => {
    const all = await run([rx('r1', { namedReaction: 'Grignard reaction' }), rx('r2', { namedReaction: 'grignard  reaction' })]);
    const [record, ...others] = all.classification.records.named_reaction;
    expect(others).toEqual([]);
    expect(NamedReactionIdSchema.safeParse(record?.id).success).toBe(true);
    expect(record).toMatchObject({ name: 'Grignard reaction', aliases: [], parentIds: [], conceptIds: [], prerequisiteConceptIds: [], review: { lifecycle: 'published', status: 'review_required' } });
    expect(all.classification.records.reaction.map((r) => r.namedReactionIds)).toEqual([[record?.id], [record?.id]]);
  });
});

describe('chapter → topic and topic mapping', () => {
  it('a chapter is created at the root (published, review_required) and mapped as core', async () => {
    const all = await run([rx('r1', { chapter: 'Hydrocarbons' }), rx('r2', { chapter: 'Amines' }), rx('r3', { chapter: 'hydrocarbons' })]);
    const [a, b, ...others] = all.classification.records.topic;
    expect(others).toEqual([]);
    expect(a).toMatchObject({ kind: 'topic', name: 'Hydrocarbons', topicKind: 'chapter', order: 1, aliases: [], review: { lifecycle: 'published', status: 'review_required' } });
    expect(a?.parentId).toBeUndefined();
    expect(b).toMatchObject({ name: 'Amines', order: 2 });
    expect(TopicIdSchema.safeParse(a?.id).success).toBe(true);
    const mappings = all.classification.records.topic_mapping;
    expect(mappings.map((m) => [m.id, m.topicId, m.role, m.target])).toEqual([
      ['tmp_v6-r1', a?.id, 'core', { kind: 'reaction', id: 'rxn_v6-r1' }],
      ['tmp_v6-r2', b?.id, 'core', { kind: 'reaction', id: 'rxn_v6-r2' }],
      ['tmp_v6-r3', a?.id, 'core', { kind: 'reaction', id: 'rxn_v6-r3' }],
    ]);
    for (const m of mappings) expect(TopicMappingIdSchema.safeParse(m.id).success).toBe(true);
  });

  it('"Uncategorised" (quirk r22): no topic, no mapping, nothing kept, no reason', async () => {
    const all = await run([rx('r1', { chapter: 'Uncategorised' })]);
    expect(all.classification.records.topic).toEqual([]);
    expect(all.classification.records.topic_mapping).toEqual([]);
    expect(unmappedOf(reactionOf(all)).chapter).toBeUndefined();
    expect(all.classification.consumed.has('reactions[0].chapter')).toBe(true);
  });

  it('a chapter written like "Uncategorised" but not exactly is a chapter (v6 compares the literal)', async () => {
    const all = await run([rx('r1', { chapter: 'uncategorised' })]);
    expect(all.classification.records.topic.map((t) => t.name)).toEqual(['uncategorised']);
  });
});

describe('jee', () => {
  const jee = (extra: Record<string, unknown> = {}) => ({ relevance: '', difficulty: 0, traps: [], prerequisites: [], concepts: [], ...extra });

  it.each([1, 2, 3, 4, 5])('difficulty %i → difficulty', async (n) => {
    const all = await run([rx('r1', { jee: jee({ difficulty: n }) })]);
    expect(reactionOf(all).difficulty).toBe(n);
  });

  it('difficulty 0 → absent (consumed, traced); a value outside 1-5 or not whole is kept with a reason, never clamped', async () => {
    const zero = await run([rx('r1', { jee: jee({ difficulty: 0 }) })]);
    expect(reactionOf(zero).difficulty).toBeUndefined();
    expect(zero.classification.consumed.has('reactions[0].jee.difficulty')).toBe(true);
    for (const value of [6, 2.5, -1]) {
      const all = await run([rx('r1', { jee: jee({ difficulty: value }) })]);
      expect(reactionOf(all).difficulty).toBeUndefined();
      expect(unmappedOf(reactionOf(all)).jee).toEqual({ difficulty: value });
      expect(reasonsOf(reactionOf(all)).some((r) => r.includes('is not a whole number from 1 to 5'))).toBe(true);
    }
  });

  it('traps → one caveat (trap) per entry, cav_v6-<r>-<n> by position, targeting the reaction', async () => {
    const all = await run([rx('r1', { jee: jee({ traps: ['first trap', 'second trap'] }) })]);
    const caveats = all.classification.records.caveat;
    expect(caveats.map((c) => [c.id, c.caveatKind, c.title, c.statement, c.targets])).toEqual([
      ['cav_v6-r1-1', 'trap', 'first trap', 'first trap', [{ ref: { kind: 'reaction', id: 'rxn_v6-r1' }, as: 'affected_reaction' }]],
      ['cav_v6-r1-2', 'trap', 'second trap', 'second trap', [{ ref: { kind: 'reaction', id: 'rxn_v6-r1' }, as: 'affected_reaction' }]],
    ]);
    for (const c of caveats) expect(CaveatIdSchema.safeParse(c.id).success).toBe(true);
    expect(all.classification.report.createdCounts.caveat).toBe(2);
  });

  it('a trap too long for a title gets a numbered title; the statement is the whole text', async () => {
    const long = `${'word '.repeat(60)}end`;
    const all = await run([rx('r1', { jee: jee({ traps: [long] }) })]);
    expect(all.classification.records.caveat[0]).toMatchObject({ title: 'Trap 1 of reaction #1', statement: long });
  });

  it('prerequisites → concepts (general) → prerequisiteConceptIds; concepts → conceptIds; a repeat is one entry, counted as a note', async () => {
    const all = await run([rx('r1', { reactionFamily: 'family one', jee: jee({ prerequisites: ['carbocation stability', 'Carbocation Stability'], concepts: ['family one', 'other concept'] }) })]);
    const reaction = reactionOf(all);
    const byName = new Map(all.classification.records.concept.map((c) => [c.name, c] as const));
    expect(byName.get('carbocation stability')).toMatchObject({ conceptKind: 'general' });
    expect(reaction.prerequisiteConceptIds).toEqual([byName.get('carbocation stability')?.id]);
    expect(reaction.conceptIds).toEqual([byName.get('family one')?.id, byName.get('other concept')?.id]);
    expect(byName.get('family one')?.conceptKind).toBe('reaction_family');
    expect(all.classification.report.notes.CONCEPT_REPEATED_IN_LIST).toBe(2);
  });

  it('more concepts than the schema holds (256): the first 256 are stored, the rest are kept in unmapped with a reason, none is cut silently', async () => {
    const many = Array.from({ length: 300 }, (_, i) => `concept ${i}`);
    const all = await run([rx('r1', { jee: jee({ concepts: many }) })]);
    const reaction = reactionOf(all);
    expect(reaction.conceptIds).toHaveLength(256);
    expect((unmappedOf(reaction).jee as { concepts: string[] }).concepts).toEqual(many.slice(256));
    expect(reasonsOf(reaction).some((r) => r.startsWith('44 entries of jee.concepts cannot be stored'))).toBe(true);
    expect(all.classification.consumed.has('reactions[0].jee.concepts[255]')).toBe(true);
    expect(all.classification.consumed.has('reactions[0].jee.concepts[256]')).toBe(false);
  });

  it('relevance both / main / advanced with no exam in the context: kept in unmapped with a reason, no exam is created', async () => {
    const all = await run([rx('r1', { jee: jee({ relevance: 'both' }) }), rx('r2', { jee: jee({ relevance: 'main' }) })]);
    expect(all.classification.records.exam_relevance).toEqual([]);
    for (const r of all.classification.records.reaction) {
      expect(unmappedOf(r).jee).toEqual({ relevance: r.name.endsWith('r1') ? 'both' : 'main' });
      expect(reasonsOf(r).some((x) => x.startsWith('no ') && x.includes('exam in this dataset'))).toBe(true);
    }
  });

  it('an unknown relevance word is kept with a reason; an empty one is consumed', async () => {
    const all = await run([rx('r1', { jee: jee({ relevance: 'Main' }) }), rx('r2', { jee: jee({ relevance: '' }) })]);
    expect(unmappedOf(reactionOf(all)).jee).toEqual({ relevance: 'Main' });
    expect(reasonsOf(reactionOf(all)).some((r) => r.includes('is not one of both / main / advanced'))).toBe(true);
    expect(unmappedOf(reactionOf(all, 1)).jee).toBeUndefined();
    expect(reasonsOf(reactionOf(all, 1))).toEqual([]);
  });

  it('unknown keys under jee and a jee that is not an object are kept', async () => {
    const all = await run([rx('r1', { jee: jee({ level: 'x', extra: { a: [1] } }) })]);
    expect(unmappedOf(reactionOf(all)).jee).toEqual({ level: 'x', extra: { a: [1] } });
  });
});

describe('relatedReactions → related_to relationships', () => {
  it('one relationship per unordered pair, rel_v6-<lower>-<higher>, whichever reaction lists the other (or both do)', async () => {
    const all = await run([rx('r2', { relatedReactions: ['r10', 'r1'] }), rx('r10', { relatedReactions: ['r2'] }), rx('r1', { relatedReactions: [] })]);
    const rels = all.classification.records.relationship;
    expect(rels.map((r) => [r.id, r.type, r.from, r.to])).toEqual([
      ['rel_v6-r10-r2', 'related_to', { kind: 'reaction', id: 'rxn_v6-r10' }, { kind: 'reaction', id: 'rxn_v6-r2' }],
      ['rel_v6-r1-r2', 'related_to', { kind: 'reaction', id: 'rxn_v6-r1' }, { kind: 'reaction', id: 'rxn_v6-r2' }],
    ]);
    for (const r of rels) expect(RelationshipIdSchema.safeParse(r.id).success).toBe(true);
    for (const leaf of ['reactions[0].relatedReactions[0]', 'reactions[0].relatedReactions[1]', 'reactions[1].relatedReactions[0]']) expect(all.classification.consumed.has(leaf)).toBe(true);
  });

  it('an ID that names no reaction is kept in unmapped with a review reason; no reaction is made for it', async () => {
    const all = await run([rx('r1', { relatedReactions: ['r99', 'r2', 7] }), rx('r2')]);
    const reaction = reactionOf(all);
    expect(unmappedOf(reaction).relatedReactions).toEqual(['r99', 7]);
    expect(reasonsOf(reaction).some((r) => r.includes('"r99"') && r.includes('no reaction of this file'))).toBe(true);
    expect(all.classification.records.reaction).toHaveLength(2);
    expect(all.classification.records.relationship.map((r) => r.id)).toEqual(['rel_v6-r1-r2']);
  });

  it('a reaction that lists itself makes no relationship; the entry is kept with a reason', async () => {
    const all = await run([rx('r1', { relatedReactions: ['r1'] })]);
    expect(all.classification.records.relationship).toEqual([]);
    expect(unmappedOf(reactionOf(all)).relatedReactions).toEqual(['r1']);
    expect(reasonsOf(reactionOf(all)).some((r) => r.includes('lists itself'))).toBe(true);
  });

  it('a repeated legacy ID: the reference resolves to the FIRST reaction with it, as v6 does', async () => {
    const all = await run([rx('r1'), rx('r1', { relatedReactions: ['r1'] })]);
    const rels = all.classification.records.relationship;
    expect(rels).toHaveLength(1);
    expect(new Set([rels[0]?.from.id, rels[0]?.to.id])).toEqual(new Set(['rxn_v6-r1', all.classification.records.reaction[1]?.id]));
  });
});

describe('dropped leaves of the v4 → v5 port (§4.8) and fields of the document', () => {
  it('an empty dropped leaf is counted by default, one with content is kept under unmapped.dropped with ONE reason per reaction', async () => {
    const all = await mapClassified({
      schemaVersion: 5,
      compounds: COMPOUNDS,
      reactions: [{ id: 'r1', name: 'R', participants: BASE, jee: { difficulty: '3', traps: 'a\nb', prerequisites: [' p ', ''] } }],
    });
    const reaction = reactionOf(all);
    expect(all.classification.unhandledDropped).toEqual([]);
    expect(unmappedOf(reaction).dropped).toEqual({ 'jee.difficulty': '3', 'jee.traps': 'a\nb', 'jee.prerequisites[0]': ' p ' });
    expect(reasonsOf(reaction).filter((r) => r.includes('changed or dropped by v6'))).toHaveLength(1);
    expect(reasonsOf(reaction).find((r) => r.includes('changed or dropped by v6'))).toBe("3 legacy value(s) were changed or dropped by v6's own normalisation; the originals are kept in legacy.unmapped.dropped");
    expect(all.report.build().consumedByDefault['reactions[*].jee.prerequisites[*]']).toBe(1);
    expect(all.report.build().preservedUnmappedFields).toMatchObject({ 'reaction.dropped.jee.difficulty': 1, 'reaction.dropped.jee.traps': 1, 'reaction.dropped.jee.prerequisites[*]': 1 });
    expect(reactionOf(all).difficulty).toBe(3);
  });

  it('top-level fields and top-level dropped leaves go to the report (documentUnmapped), counted, never to a record', async () => {
    const all = await mapClassified({ schemaVersion: 4, title: 'My export', meta: { by: ['me'] }, compounds: COMPOUNDS, reactions: [rx('r1', { pattern: 'a → b' })] });
    expect(all.classification.documentUnmapped).toEqual({ 'dropped.schemaVersion': 4, title: 'My export', meta: { by: ['me'] } });
    const report = all.report.build();
    expect(report.documentUnmapped).toEqual(all.classification.documentUnmapped);
    expect(report.preservedUnmappedFields).toMatchObject({ 'document.title': 1, 'document.meta': 1, 'document.dropped.schemaVersion': 1 });
    expect(report.notes.DOCUMENT_VALUE_KEPT).toBe(3);
    expect(report.notImported).toEqual([]);
  });

  it('a clean document has an empty documentUnmapped', async () => {
    expect((await run([rx('r1')])).classification.documentUnmapped).toEqual({});
  });
});

describe('collapseIntermediates and _v4', () => {
  it('are kept whole in legacy.unmapped without a review reason', async () => {
    const all = await run([rx('r1', { collapseIntermediates: false }), rx('r2', { collapseIntermediates: true, _v4: { reagent: 'KOH', extra: '', condition: 'heat' } })]);
    const [a, b] = all.classification.records.reaction;
    expect(unmappedOf(a as Reaction)).toEqual({ collapseIntermediates: false });
    expect(unmappedOf(b as Reaction)).toEqual({ collapseIntermediates: true, _v4: { reagent: 'KOH', extra: '', condition: 'heat' } });
    expect(reasonsOf(b as Reaction)).toEqual([]);
    expect(all.classification.report.preservedUnmappedFields['reaction.collapseIntermediates']).toBe(2);
    expect(all.classification.report.preservedUnmappedFields['reaction._v4']).toBe(1);
  });
});
