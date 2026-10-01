/**
 * The search engine (step 4.5, SEARCH §2 and §3): normalisation (C2H5OH = C₂H₅OH, Wolff-Kishner = wolffkishner, α = alpha),
 * prefix on names only, fuzzy by term length, formulas and structures exact, the total order of results, revisions, the
 * serialised index, and that every value crossing the worker boundary survives `structuredClone`.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_QUERY_WORDS, MAX_SEARCH_LIMIT, type SearchDocument, type SearchQuery } from '../contracts';
import { fuzzyDistance, partsOf, termsOf, wordsOf } from './index';
import { tokens } from '@/core/text';
import { createSearchEngine, SearchNotLoaded } from './engine';
import { doc } from '@/test-support/search-docs';

const q = (text: string, over: Partial<SearchQuery> = {}): SearchQuery => ({ text, limit: 50, ...over });

function engineOf(documents: readonly SearchDocument[], revision = 1) {
  const engine = createSearchEngine();
  engine.load(documents, revision);
  return engine;
}
const idsOf = (engine: ReturnType<typeof engineOf>, text: string, over: Partial<SearchQuery> = {}): string[] => engine.search(q(text, over)).map((hit) => hit.ref.id);

describe('normalisation: one record however it is typed', () => {
  const engine = engineOf([
    doc('spc_a', { name: 'Ethanol', formula: 'C₂H₅OH' }),
    doc('nmr_b', { kind: 'named_reaction', name: 'Wolff–Kishner reduction', aliases: ['Wolffkishner'] }),
    doc('cpt_c', { kind: 'concept', name: 'α-effect', aliases: ['alpha effect'] }),
    doc('spc_z', { name: 'Zinc' }),
  ]);

  it('C2H5OH and C₂H₅OH find the same record (as formula, either way round)', () => {
    expect(idsOf(engine, 'C2H5OH')).toEqual(['spc_a']);
    expect(idsOf(engine, 'C₂H₅OH')).toEqual(['spc_a']);
    expect(idsOf(engine, 'c2h5oh')).toEqual(['spc_a']);
  });

  it('Wolff-Kishner, wolff kishner, Wolff–Kishner and wolffkishner all meet', () => {
    for (const text of ['Wolff-Kishner', 'wolff kishner', 'Wolff–Kishner', 'wolffkishner', 'WOLFFKISHNER', 'wolff-kishner reduction']) {
      expect(idsOf(engine, text), text).toEqual(['nmr_b']);
    }
  });

  it('α and alpha meet', () => {
    expect(idsOf(engine, 'α')).toEqual(['cpt_c']);
    expect(idsOf(engine, 'alpha')).toEqual(['cpt_c']);
    expect(idsOf(engine, 'α-effect')).toEqual(['cpt_c']);
    expect(idsOf(engine, 'alphaeffect')).toEqual(['cpt_c']);
  });

  it('a record named without the space is found by the spaced query', () => {
    const e = engineOf([doc('spc_k', { name: 'Wolffkishner' })]);
    expect(idsOf(e, 'wolff kishner')).toEqual(['spc_k']);
  });

  it('the query parts agree with core tokens() for any input (a divergence would silently change recall)', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 40 }), (input) => {
        const parts = wordsOf(input).flatMap((word) => partsOf(word));
        const all = new Set(tokens(input));
        for (const part of parts) expect(all.has(part), `${JSON.stringify(input)} part ${JSON.stringify(part)}`).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});

describe('prefix search is for names only', () => {
  const engine = engineOf([
    doc('spc_n', { name: 'Carbonyl compound' }),
    doc('spc_a', { name: 'Other', aliases: ['carbonic acid'] }),
    doc('spc_t', { name: 'Third', text: 'carbonylation of alkenes', tags: ['carbonylated'] }),
    doc('spc_f', { name: 'Fourth', formula: 'CH3COOH' }),
  ]);

  it('a prefix finds names and aliases, and not text, tags or formulas', () => {
    expect(idsOf(engine, 'carbon').sort()).toEqual(['spc_a', 'spc_n']);
    expect(idsOf(engine, 'ch3co')).toEqual([]);
    expect(idsOf(engine, 'carbonyl')).toContain('spc_n');
    expect(idsOf(engine, 'carbonyl')).not.toContain('spc_t');
  });

  it('whole words in text and tags are found', () => {
    expect(idsOf(engine, 'carbonylation')).toContain('spc_t');
    expect(idsOf(engine, 'carbonylated')).toContain('spc_t');
  });
});

describe('fuzzy matching by term length', () => {
  it('the rule: none under 5 characters, 1 from 5, 2 from 9 (counted in characters, not UTF-16 units)', () => {
    expect([ '', 'abcd', 'abcde', 'abcdefgh', 'abcdefghi', 'abcdefghijkl' ].map(fuzzyDistance)).toEqual([false, false, 1, 1, 2, 2]);
    expect(fuzzyDistance('😀😀😀😀')).toBe(false);
  });

  const engine = engineOf([
    doc('spc_e', { name: 'ethanol' }),
    doc('spc_b', { name: 'benzaldehyde' }),
    doc('spc_s', { name: 'sodium' }),
    doc('spc_m', { name: 'methane' }),
  ]);

  it('five characters or more: one edit finds it, two do not (and prefix still works)', () => {
    expect(idsOf(engine, 'sodum')).toEqual(['spc_s']); // 5 chars, one deletion
    expect(idsOf(engine, 'sdum')).toEqual([]); // 4 chars: no fuzzy, not a prefix
    expect(idsOf(engine, 'sodiom')).toEqual(['spc_s']); // 6 chars, one substitution
    expect(idsOf(engine, 'sxdxum')).toEqual([]); // 6 chars, two substitutions
    expect(idsOf(engine, 'methan')).toEqual(['spc_m']); // prefix
  });

  it('nine characters or more: two edits find it', () => {
    expect(idsOf(engine, 'benzaldhyde')).toEqual(['spc_b']); // 11 chars, one edit
    expect(idsOf(engine, 'benzaldhde')).toEqual(['spc_b']); // 10 chars, two edits
    expect(idsOf(engine, 'bnzaldhde')).toEqual([]); // 9 chars but three edits from the name
  });

  it('fewer than five characters are exact or prefix only', () => {
    expect(idsOf(engine, 'etha')).toEqual(['spc_e']);
    expect(idsOf(engine, 'etho')).toEqual([]);
  });

  it('formulas and structures never get fuzzy or prefix', () => {
    const e = engineOf([doc('spc_f', { name: 'Zeta', formula: 'C2H5OH', structureText: 'CC(=O)O' })]);
    expect(idsOf(e, 'c2h5oh')).toEqual(['spc_f']);
    expect(idsOf(e, 'c2h5o')).toEqual([]);
    expect(idsOf(e, 'c2h5ohh')).toEqual([]);
    expect(idsOf(e, 'c2h5oo')).toEqual([]);
    expect(idsOf(e, 'CC(=O)O')).toEqual(['spc_f']);
    expect(idsOf(e, '  CC(=O)O  ')).toEqual(['spc_f']);
    expect(idsOf(e, 'cc(=o)o')).toEqual([]); // case matters in a structure
    expect(idsOf(e, 'CC(=O)')).toEqual([]);
  });
});

describe('the order of results is total and does not depend on how the index was built', () => {
  const same = { names: ['Alpha'] };
  const documents = [
    doc('spc_1', { ...same, title: 'zeta', lifecycle: 'draft', scopeRanks: { exv_a: 0 } }),
    doc('spc_2', { ...same, title: 'zeta', lifecycle: 'published', scopeRanks: { exv_a: 0 } }),
    doc('spc_3', { ...same, title: 'Beta', lifecycle: 'published', scopeRanks: { exv_a: 3 } }),
    doc('spc_4', { ...same, title: 'Alpha', lifecycle: 'published', scopeRanks: { exv_a: 1 } }),
    doc('spc_5', { ...same, title: 'alpha', lifecycle: 'published', scopeRanks: {} }),
    doc('spc_6', { ...same, title: 'Alpha', lifecycle: 'draft', scopeRanks: { exv_a: 2 } }),
  ];

  it('score, then scope rank of the exam version, then published, then folded title, then id', () => {
    const engine = engineOf(documents);
    // no exam version: scope plays no part; published first, then folded title, then id
    expect(idsOf(engine, 'alpha')).toEqual(['spc_4', 'spc_5', 'spc_3', 'spc_2', 'spc_6', 'spc_1']);
    // with the version: official, prerequisite, enrichment, outside, unranked; ties inside a rank by lifecycle, title, id
    expect(idsOf(engine, 'alpha', { examVersionId: 'exv_a' })).toEqual(['spc_2', 'spc_1', 'spc_4', 'spc_6', 'spc_3', 'spc_5']);
  });

  it('a better score beats every tie-break', () => {
    const engine = engineOf([...documents, doc('spc_9', { names: ['Alpha'], aliases: [], title: 'zzz', tags: ['alpha'], lifecycle: 'draft', scopeRanks: { exv_a: 3 } })]);
    expect(idsOf(engine, 'alpha', { examVersionId: 'exv_a' })[0]).toBe('spc_9');
  });

  it('any load order, and an index built by updates, answer alike', () => {
    fc.assert(
      fc.property(fc.shuffledSubarray(documents, { minLength: documents.length }), (shuffled) => {
        const loaded = engineOf(shuffled);
        const grown = engineOf([]);
        grown.apply({ fromRevision: 1, revision: 2, upsert: shuffled, remove: [] });
        for (const examVersionId of [undefined, 'exv_a']) {
          const query = q('alpha', examVersionId === undefined ? {} : { examVersionId });
          expect(JSON.stringify(loaded.search(query))).toBe(JSON.stringify(engineOf(documents).search(query)));
          expect(JSON.stringify(grown.search(query))).toBe(JSON.stringify(loaded.search(query)));
        }
      }),
      { numRuns: 40 },
    );
  });

  it('limit cuts the list after ordering; hits say what matched', () => {
    const engine = engineOf(documents);
    expect(idsOf(engine, 'alpha', { limit: 2 })).toEqual(['spc_4', 'spc_5']);
    const hit = engine.search(q('alpha', { limit: 1 }))[0];
    expect(hit).toMatchObject({ ref: { kind: 'species', id: 'spc_4' }, title: 'Alpha', matchedField: 'name', matchedText: 'Alpha' });
  });
});

describe('what a hit says it matched', () => {
  const engine = engineOf([
    doc('spc_n', { name: 'Ethanol', aliases: ['grain alcohol'], formula: 'C2H5OH', structureText: 'CCO', tags: ['solvent'], text: 'distilled' }),
  ]);
  const field = (text: string) => engine.search(q(text))[0];

  it('names before aliases before formula, structure, tags, text', () => {
    expect(field('ethanol')).toMatchObject({ matchedField: 'name', matchedText: 'Ethanol' });
    expect(field('grain')).toMatchObject({ matchedField: 'alias', matchedText: 'grain alcohol' });
    expect(field('C2H5OH')).toMatchObject({ matchedField: 'formula', matchedText: 'C2H5OH' });
    expect(field('CCO')).toMatchObject({ matchedField: 'structure', matchedText: 'CCO' });
    expect(field('solvent')).toMatchObject({ matchedField: 'tag', matchedText: 'solvent' });
    expect(field('distilled')).toMatchObject({ matchedField: 'text' });
    expect(field('distilled')?.matchedText).toBeUndefined();
  });
});

describe('filters and facets', () => {
  const engine = engineOf([
    doc('spc_a', { name: 'Alpha', facets: { reagentFamilies: ['acid'], topicIds: ['top_1'], scopes: ['official'], reviewStatus: 'verified' }, scopeRanks: { exv_a: 0 } }),
    doc('rxn_b', { kind: 'reaction', name: 'Alpha reaction', facets: { reagentFamilies: ['base'], topicIds: ['top_2'], scopes: ['enrichment'], reviewStatus: 'unreviewed' }, scopeRanks: { exv_a: 2 } }),
    doc('rgt_c', { kind: 'reagent', name: 'Alpha reagent', facets: { reagentFamilies: ['acid', 'base'], topicIds: [], scopes: [], reviewStatus: 'unreviewed' } }),
  ]);

  it('kind and facets narrow; within a facet any value, across facets all; an empty list is no constraint', () => {
    expect(idsOf(engine, 'alpha', { kinds: ['reaction'] })).toEqual(['rxn_b']);
    expect(idsOf(engine, 'alpha', { facets: { reagentFamilies: ['acid'] } }).sort()).toEqual(['rgt_c', 'spc_a']);
    expect(idsOf(engine, 'alpha', { facets: { reagentFamilies: ['acid', 'base'], topicIds: ['top_2'] } })).toEqual(['rxn_b']);
    expect(idsOf(engine, 'alpha', { facets: { reviewStatus: 'verified' } })).toEqual(['spc_a']);
    expect(idsOf(engine, 'alpha', { facets: { topicIds: [] } })).toHaveLength(3);
    expect(idsOf(engine, 'alpha', { facets: { scopes: ['enrichment'] } })).toEqual(['rxn_b']);
  });

  it('the scope facet is read under the exam version when one is given (unmapped matches a record without a rank)', () => {
    expect(idsOf(engine, 'alpha', { examVersionId: 'exv_a', facets: { scopes: ['official'] } })).toEqual(['spc_a']);
    expect(idsOf(engine, 'alpha', { examVersionId: 'exv_a', facets: { scopes: ['unmapped'] } })).toEqual(['rgt_c']);
    expect(idsOf(engine, 'alpha', { examVersionId: 'exv_other', facets: { scopes: ['unmapped'] } }).sort()).toEqual(['rgt_c', 'rxn_b', 'spc_a']);
  });

  it('no words with a filter lists what the filter admits (a palette prefix alone); no words and no filter lists nothing', () => {
    expect(idsOf(engine, '', { kinds: ['reagent'] })).toEqual(['rgt_c']);
    expect(idsOf(engine, '  ', { kinds: ['species', 'reaction'] })).toEqual(['spc_a', 'rxn_b']); // no score: folded title decides
    expect(idsOf(engine, '')).toEqual([]);
    expect(idsOf(engine, '(((')).toEqual([]);
  });
});

describe('revisions, updates and what is refused', () => {
  it('apply answers a value; a wrong fromRevision is REVISION_MISMATCH with the revision the index has', () => {
    const engine = createSearchEngine();
    expect(engine.revision).toBe(-1);
    expect(engine.apply({ fromRevision: 0, revision: 1, upsert: [], remove: [] })).toEqual({ ok: false, code: 'REVISION_MISMATCH', have: -1 });
    engine.load([doc('spc_a', { name: 'Alpha' })], 4);
    expect(engine.apply({ fromRevision: 3, revision: 5, upsert: [doc('spc_b', { name: 'Beta' })], remove: [] })).toEqual({ ok: false, code: 'REVISION_MISMATCH', have: 4 });
    expect(engine.size()).toBe(1);
    expect(engine.apply({ fromRevision: 4, revision: 6, upsert: [doc('spc_b', { name: 'Beta' })], remove: ['spc_a', 'spc_gone'] })).toEqual({ ok: true, revision: 6, upserted: 1, removed: 1 });
    expect(engine.revision).toBe(6);
    expect(idsOf(engine, 'alpha')).toEqual([]);
    expect(idsOf(engine, 'beta')).toEqual(['spc_b']);
  });

  it('an id in both lists ends up present; an update that changes a document replaces the old terms', () => {
    const engine = engineOf([doc('spc_a', { name: 'Alpha' })]);
    engine.apply({ fromRevision: 1, revision: 2, upsert: [doc('spc_a', { name: 'Gamma' })], remove: ['spc_a'] });
    expect(idsOf(engine, 'alpha')).toEqual([]);
    expect(idsOf(engine, 'gamma')).toEqual(['spc_a']);
    expect(engine.size()).toBe(1);
  });

  it('search before a load is SearchNotLoaded; a malformed document or query is refused and changes nothing', () => {
    const engine = createSearchEngine();
    expect(() => engine.search(q('x'))).toThrow(SearchNotLoaded);
    expect(() => engine.load([{ ...doc('spc_a'), kind: 'asset' as never }], 1)).toThrow(TypeError);
    expect(() => engine.load([doc('spc_a'), doc('spc_a')], 1)).toThrow(/twice/);
    engine.load([doc('spc_a', { name: 'Alpha' })], 1);
    expect(() => engine.apply({ fromRevision: 1, revision: 2, upsert: [doc('spc_b'), { ...doc('spc_c'), text: 'x'.repeat(4_001) }], remove: ['spc_a'] })).toThrow(TypeError);
    expect(engine.size()).toBe(1);
    expect(engine.revision).toBe(1);
    expect(idsOf(engine, 'alpha')).toEqual(['spc_a']);
    expect(() => engine.search(q('x', { limit: 0 }))).toThrow(RangeError);
    expect(() => engine.search(q('x', { limit: MAX_SEARCH_LIMIT + 1 }))).toThrow(RangeError);
    expect(() => engine.search(q('a '.repeat(MAX_QUERY_WORDS + 1)))).toThrow(RangeError);
    expect(() => engine.search(q('a'.repeat(1_001)))).toThrow(RangeError);
  });
});

describe('the serialised index', () => {
  const documents = [
    doc('spc_a', { name: 'Ethanol', formula: 'C2H5OH', aliases: ['grain alcohol'], scopeRanks: { exv_a: 1 } }),
    doc('rxn_b', { kind: 'reaction', name: 'Oxidation of ethanol', text: 'to ethanal with PCC' }),
    doc('cpt_c', { kind: 'concept', name: 'α-effect' }),
  ];
  const queries = ['ethanol', 'c2h5oh', 'grain', 'alpha', 'ethanl', 'PCC', 'ethan'].map((text) => q(text, { examVersionId: 'exv_a' }));

  it('serialize then loadSerialized in a new engine answers every query alike', () => {
    const original = engineOf(documents, 7);
    const serialized = original.serialize();
    expect(serialized.revision).toBe(7);
    structuredClone(serialized);
    const restored = createSearchEngine();
    expect(restored.loadSerialized(structuredClone(serialized))).toEqual({ ok: true, revision: 7, documents: 3 });
    expect(restored.revision).toBe(7);
    for (const query of queries) expect(JSON.stringify(restored.search(query))).toBe(JSON.stringify(original.search(query)));
    // and it keeps taking updates
    expect(restored.apply({ fromRevision: 7, revision: 8, upsert: [doc('spc_z', { name: 'Zinc' })], remove: ['spc_a'] })).toMatchObject({ ok: true });
    expect(idsOf(restored, 'zinc')).toEqual(['spc_z']);
    expect(idsOf(restored, 'ethanol')).toEqual(['rxn_b']);
  });

  it('a serialised index that was updated into shape answers like one that was built', () => {
    const grown = engineOf([documents[0] as SearchDocument], 1);
    grown.apply({ fromRevision: 1, revision: 2, upsert: documents.slice(1), remove: [] });
    const restored = createSearchEngine();
    restored.loadSerialized({ ...grown.serialize() });
    for (const query of queries) expect(JSON.stringify(restored.search(query))).toBe(JSON.stringify(engineOf(documents, 2).search(query)));
  });

  it('a text that does not load is BAD_INDEX as a value and leaves the engine as it was', () => {
    const engine = engineOf(documents, 7);
    const good = engine.serialize();
    const parsed = JSON.parse(good.json) as Record<string, unknown>;
    const cases: [string, { json: string; revision: number }][] = [
      ['not JSON', { json: '{nope', revision: 7 }],
      ['not an index', { json: '{"format":"other"}', revision: 7 }],
      ['wrong revision', { json: good.json, revision: 8 }],
      ['other configuration', { json: JSON.stringify({ ...parsed, config: 'orn-search-config-0' }), revision: 7 }],
      ['other version', { json: JSON.stringify({ ...parsed, version: 2 }), revision: 7 }],
      ['a document missing from the index', { json: JSON.stringify({ ...parsed, documents: (parsed.documents as unknown[]).slice(1) }), revision: 7 }],
      ['a malformed document', { json: JSON.stringify({ ...parsed, documents: [{ id: 'spc_a' }] }), revision: 7 }],
      ['a repeated document', { json: JSON.stringify({ ...parsed, documents: [...(parsed.documents as unknown[]), (parsed.documents as unknown[])[0]] }), revision: 7 }],
      ['no index body', { json: JSON.stringify({ ...parsed, index: null }), revision: 7 }],
    ];
    for (const [name, input] of cases) {
      expect(engine.loadSerialized(input), name).toMatchObject({ ok: false, code: 'BAD_INDEX' });
      expect(engine.revision, name).toBe(7);
      expect(idsOf(engine, 'ethanol'), name).toEqual(['spc_a', 'rxn_b']);
    }
  });

  it('serialize with nothing loaded is SearchNotLoaded', () => {
    expect(() => createSearchEngine().serialize()).toThrow(SearchNotLoaded);
  });
});

describe('structuredClone: every param and result survives a worker boundary', () => {
  it('documents, updates, queries, hits and answers', () => {
    const engine = engineOf([doc('spc_a', { name: 'Ethanol', formula: 'C2H5OH', structureText: 'CCO' })]);
    const update = { fromRevision: 1, revision: 2, upsert: [doc('spc_b', { name: 'Beta' })], remove: ['spc_a'] };
    expect(structuredClone(update)).toEqual(update);
    const query = q('ethanol', { kinds: ['species'], facets: { topicIds: ['top_1'] }, examVersionId: 'exv_a' });
    expect(structuredClone(query)).toEqual(query);
    const hits = engine.search(query);
    expect(structuredClone(hits)).toEqual(hits);
    const answer = engine.apply(update);
    expect(structuredClone(answer)).toEqual(answer);
  });
});

describe('termsOf', () => {
  it('names go through the normaliser, a structure is one case-sensitive term, body text is cut into words first', () => {
    expect(termsOf('Wolff–Kishner', 'name')).toContain('wolffkishner');
    expect(termsOf('CC(=O)O\nCCO', 'structure')).toEqual(['CC(=O)O', 'CCO']);
    expect(termsOf('a b-c', 'text')).toEqual(['a', 'b', 'c', 'bc']);
    expect(termsOf('', 'name')).toEqual([]);
  });
});
