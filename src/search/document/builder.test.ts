/**
 * The document builder (step 4.5, SEARCH §1 and §3), on the demo dataset and on a generated state with curriculum records:
 * which kinds have a document and which never do, what each kind contributes, that no document holds text of another record, the
 * 4,000 character cap, and the derived data (exam scope ranks per version, topics, reagent families).
 */
import { describe, expect, it } from 'vitest';
import { indexEngine } from '@/core/indexes/full';
import type { AnyRecord, CanonicalState, RecordKind } from '@/core/schema';
import { RECORD_KINDS } from '@/core/schema';
import { demoRecords } from '@/test-support/legacy-classify-kit';
import { stateOfRecords } from '@/test-support/legacy-map-kit';
import { fullDocuments, searchStateOf, withRecords } from '@/test-support/search-state';
import { SEARCH_TEXT_CAP } from '../contracts';
import { buildDocument, documentPortsOf, isSearchKind, plainText, SEARCH_KINDS } from './index';

const demo = stateOfRecords(demoRecords());
const portsOf = (state: CanonicalState) => documentPortsOf(state, indexEngine.build(state, 0));
const records = (state: CanonicalState): AnyRecord[] => RECORD_KINDS.flatMap((kind) => Object.values(state.records[kind] as Record<string, AnyRecord>));
const GENERATED = { species: 12, classes: 3, reagents: 3, reactions: 8, relationshipsPerReaction: 0.5, topics: 3, shape: 'dense', seed: 5 } as const;

describe('which records have a document', () => {
  it('exactly the SEARCH §1 kinds; presentation records, relationships, mappings, relevance and assets never', () => {
    expect([...SEARCH_KINDS].sort()).toEqual(['caveat', 'class', 'concept', 'exam', 'exam_version', 'mechanism', 'named_reaction', 'reaction', 'reagent', 'reference', 'route', 'species', 'topic', 'transformation']);
    const ports = portsOf(demo);
    const made = new Map<RecordKind, number>();
    for (const record of records(demo)) {
      const doc = buildDocument(record, ports);
      expect(doc !== undefined, `${record.kind} ${record.id}`).toBe(isSearchKind(record.kind));
      if (doc !== undefined) made.set(record.kind, (made.get(record.kind) ?? 0) + 1);
    }
    for (const kind of ['navigator_anchor', 'reaction_scheme', 'view_preset', 'entity_display', 'relationship', 'topic_mapping', 'exam_relevance', 'asset'] as const) {
      expect(made.has(kind), kind).toBe(false);
    }
    expect(Object.keys(demo.records.entity_display).length + Object.keys(demo.records.navigator_anchor).length).toBeGreaterThan(0); // the demo has presentation records to exclude
    for (const kind of ['species', 'class', 'reagent', 'reaction', 'named_reaction', 'concept', 'mechanism', 'topic']) expect(made.get(kind as RecordKind), kind).toBeGreaterThan(0);
  });

  it('exams and exam versions are findable by name, label and year (exams step review E3)', () => {
    const ports = portsOf(demo);
    const exam = Object.values(demo.records.exam)[0] as AnyRecord & { name: string };
    const version = Object.values(demo.records.exam_version)[0] as AnyRecord & { label: string };
    const examDoc = buildDocument(exam, ports);
    expect(examDoc?.kind).toBe('exam');
    expect(examDoc?.title).toBe(exam.name);
    expect(examDoc?.names).toContain(exam.name);
    const withYear = { ...version, year: 2027 } as AnyRecord;
    const versionDoc = buildDocument(withYear, ports);
    expect(versionDoc?.kind).toBe('exam_version');
    expect(versionDoc?.title).toBe(version.label);
    expect(versionDoc?.names).toContain(version.label);
    expect(versionDoc?.text).toContain('2027');
  });

  it('one document per record, id and kind from the record, title not empty, every field the contract requires', () => {
    const docs = fullDocuments(searchStateOf(GENERATED));
    expect(new Set(docs.map((d) => d.id)).size).toBe(docs.length);
    for (const doc of docs) {
      expect(doc.title, doc.id).not.toBe('');
      expect(doc.names.length, doc.id).toBeGreaterThan(0);
      expect(doc.text.length, doc.id).toBeLessThanOrEqual(SEARCH_TEXT_CAP);
      expect(['draft', 'published']).toContain(doc.lifecycle);
      structuredClone(doc);
    }
  });
});

describe('what a document contains', () => {
  const docOf = (state: CanonicalState, id: string) => fullDocuments(state).find((d) => d.id === id);

  it('a species: its names, aliases, entered formula, structure text, properties and notes', () => {
    const species = {
      ...Object.values(demo.records.species)[0],
      id: 'spc_t-full',
      names: { canonical: 'Ethanol', display: 'Ethyl alcohol', iupac: 'ethanol', common: ['spirit'], aliases: ['EtOH', 'C₂H₅OH'] },
      formula: ' C2H6O ',
      structure: { format: 'smiles', value: '  CCO ' },
      properties: [{ key: 'other', label: 'flash point', value: '13 °C', note: 'closed cup', citations: [] }],
      studyNotes: 'Remember **denaturation**.',
      tags: ['alcohol', 'alcohol', ' solvent '],
    } as unknown as AnyRecord;
    const doc = docOf(withRecords(demo, [species]), 'spc_t-full');
    expect(doc).toMatchObject({
      kind: 'species',
      title: 'Ethyl alcohol',
      names: ['Ethanol', 'Ethyl alcohol', 'ethanol', 'spirit'],
      aliases: ['EtOH', 'C₂H₅OH'],
      formula: 'C2H6O',
      structureText: 'CCO',
      tags: ['alcohol', 'solvent'],
    });
    expect(doc?.text).toContain('flash point');
    expect(doc?.text).toContain('13 °C');
    expect(doc?.text).toContain('closed cup');
    expect(doc?.text).toContain('Remember denaturation.');
    expect(doc?.text).not.toContain('**');
  });

  it('a reagent carries its profiles’ labels and aliases as aliases', () => {
    const reagent = Object.values(demo.records.reagent).find((r) => r.profiles.length > 0);
    expect(reagent).toBeDefined();
    const doc = docOf(demo, (reagent as AnyRecord).id);
    for (const profile of (reagent as { profiles: { label: string; aliases: string[] }[] }).profiles) {
      expect(doc?.aliases).toContain(profile.label);
      for (const alias of profile.aliases) expect(doc?.aliases).toContain(alias);
    }
  });

  it('a caveat has its title as the name and the rule and statement as text', () => {
    const caveat = Object.values(demo.records.caveat)[0] as unknown as { id: string; title: string; statement: string };
    const doc = docOf(demo, caveat.id);
    expect(doc?.names).toEqual([caveat.title]);
    expect(plainText(caveat.statement).split(/\s+/)[0]).toBeDefined();
    expect(doc?.text).toContain(plainText(caveat.statement).slice(0, 20));
  });

  it('a document never contains text of ANOTHER record: a rename or an alias elsewhere leaves it byte-identical', () => {
    const state = searchStateOf(GENERATED);
    const reaction = Object.values(state.records.reaction)[0] as AnyRecord;
    const participant = (reaction as unknown as { participants: { ref: { kind: string; id: string } }[] }).participants[0] as { ref: { kind: string; id: string } };
    const before = docOf(state, reaction.id);
    const target = (state.records.species as Record<string, AnyRecord>)[participant.ref.id] as unknown as { names: object };
    const renamed = withRecords(state, [{ ...target, names: { ...target.names, canonical: 'Zzyzx unique name', aliases: ['Qwertyuiop alias'] } } as unknown as AnyRecord]);
    const after = docOf(renamed, reaction.id);
    expect(after).toEqual(before);
    expect(JSON.stringify(after)).not.toContain('Zzyzx');
    expect(JSON.stringify(after)).not.toContain('Qwertyuiop');
    // the class and the topic documents likewise do not carry names of the records that refer to them
    for (const doc of fullDocuments(renamed)) if (doc.id !== participant.ref.id) expect(JSON.stringify(doc), doc.id).not.toContain('Zzyzx');
  });
});

describe('the text cap', () => {
  const longNote = (n: number): AnyRecord => {
    const species = Object.values(demo.records.species)[0] as unknown as Record<string, unknown>;
    return { ...species, id: 'spc_t-long', notes: 'x'.repeat(n) } as unknown as AnyRecord;
  };

  it('cuts at 4,000 characters and says so; exactly 4,000 is not cut', () => {
    const doc = fullDocuments(withRecords(demo, [longNote(9_000)])).find((d) => d.id === 'spc_t-long');
    expect(doc?.text.length).toBe(SEARCH_TEXT_CAP);
    expect(doc?.textTruncated).toBe(true);
    const exact = fullDocuments(withRecords(demo, [{ ...longNote(SEARCH_TEXT_CAP), studyNotes: undefined, properties: [], acidBaseNotes: undefined } as unknown as AnyRecord])).find((d) => d.id === 'spc_t-long');
    expect(exact?.text.length).toBe(SEARCH_TEXT_CAP);
    expect(exact?.textTruncated).toBe(false);
  });

  it('never ends in half a surrogate pair', () => {
    const species = { ...longNote(0), notes: `${'a'.repeat(SEARCH_TEXT_CAP - 1)}😀 and more` } as unknown as AnyRecord;
    const doc = fullDocuments(withRecords(demo, [species])).find((d) => d.id === 'spc_t-long');
    expect(doc?.textTruncated).toBe(true);
    expect(doc?.text.length).toBe(SEARCH_TEXT_CAP - 1);
    expect(doc?.text.endsWith('a')).toBe(true);
  });
});

describe('derived data: scope ranks, topics, reagent families (never indexed as text)', () => {
  const state = searchStateOf(GENERATED);
  const docs = new Map(fullDocuments(state).map((d) => [d.id, d] as const));

  it('scopeRanks come from core’s scopeOf per exam version; scopes name the distinct ranks best first', () => {
    const ports = portsOf(state);
    expect(ports.versions.map((v) => v.id)).toEqual(['exv_s-2025', 'exv_s-2026']);
    const ranks = ['official', 'prerequisite', 'enrichment', 'outside'];
    for (const doc of docs.values()) {
      const expected: Record<string, number> = {};
      for (const version of ports.versions) {
        const scope = version.scopeOf({ kind: doc.kind, id: doc.id } as never);
        if (scope !== 'unmapped') expected[version.id] = ranks.indexOf(scope);
      }
      expect(doc.scopeRanks, doc.id).toEqual(expected);
      expect(doc.facets.scopes, doc.id).toEqual(ranks.filter((_, rank) => Object.values(expected).includes(rank)));
    }
    expect(docs.get('cpt_s-inductive')?.scopeRanks).toEqual({ 'exv_s-2025': 2, 'exv_s-2026': 2 }); // the explicit enrichment override
    expect([...docs.values()].some((d) => Object.keys(d.scopeRanks).length === 0)).toBe(true); // an unmapped record has no ranks
    expect([...docs.values()].some((d) => Object.values(d.scopeRanks).includes(0))).toBe(true);
  });

  it('a concept that is a prerequisite of an official record is a prerequisite', () => {
    const ranks = docs.get('cpt_s-sn2')?.scopeRanks ?? {};
    expect(Object.values(ranks).every((r) => r === 1 || r === 0)).toBe(true);
    expect(Object.keys(ranks).length).toBeGreaterThan(0);
  });

  it('lifecycle and review status are copied; a draft is a draft', () => {
    expect(docs.get('cpt_s-inductive')?.lifecycle).toBe('draft');
    expect(docs.get('cpt_s-resonance')?.lifecycle).toBe('published');
    expect(docs.get('cpt_s-resonance')?.facets.reviewStatus).toBe('unreviewed');
  });

  it('topicIds are the topics that map to the record and their ancestors; a topic: itself and its ancestors', () => {
    const reaction = Object.keys(state.records.reaction).sort()[0] as string;
    const mapping = Object.values(state.records.topic_mapping).find((m) => m.target.id === reaction);
    const topic = (state.records.topic as Record<string, { parentId?: string }>)[mapping?.topicId as string];
    expect(docs.get(reaction)?.facets.topicIds).toEqual([...new Set([mapping?.topicId as string, ...(topic?.parentId === undefined ? [] : [topic.parentId])])].sort());
    const chapter = Object.keys(state.records.topic).find((id) => (state.records.topic as Record<string, { parentId?: string }>)[id]?.parentId !== undefined) as string;
    expect(docs.get(chapter)?.facets.topicIds).toEqual([chapter, (state.records.topic as Record<string, { parentId: string }>)[chapter]?.parentId].sort());
  });

  it('a reagent has its own families, a reaction the families of its reagent participants (sorted, distinct)', () => {
    const reagentId = Object.keys(state.records.reagent).sort()[0] as string;
    const reagent = state.records.reagent[reagentId as never] as unknown as Record<string, unknown>;
    const edited = withRecords(state, [{ ...reagent, families: ['oxidant', 'acid', 'oxidant'] } as unknown as AnyRecord]);
    const after = new Map(fullDocuments(edited).map((d) => [d.id, d] as const));
    expect(after.get(reagentId)?.facets.reagentFamilies).toEqual(['acid', 'oxidant']);
    const users = Object.values(state.records.reaction).filter((r) => r.participants.some((p) => p.ref.id === reagentId));
    expect(users.length).toBeGreaterThan(0);
    for (const reaction of users) expect(after.get(reaction.id)?.facets.reagentFamilies).toEqual(['acid', 'oxidant']);
    const others = Object.values(state.records.reaction).filter((r) => !r.participants.some((p) => p.ref.id === reagentId));
    for (const reaction of others) expect(after.get(reaction.id)?.facets.reagentFamilies).not.toContain('oxidant');
  });
});

describe('plainText', () => {
  it('drops markup, keeps link labels and line breaks, is total', () => {
    expect(plainText('**bold** and _em_')).toBe('bold and _em_');
    expect(plainText(undefined)).toBe('');
    expect(plainText('')).toBe('');
    expect(plainText('H~2~O and x^2^')).toContain('H');
    expect(plainText('first\n\nsecond')).toBe('first\nsecond');
    expect(plainText('**unclosed')).toContain('unclosed');
  });
});
