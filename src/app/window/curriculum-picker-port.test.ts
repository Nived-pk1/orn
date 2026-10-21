/** The curriculum questions of the record pickers' port (step 6.6c): topics in tree order, the mappings and relevance of a record, exams, versions and the map families. */
import { describe, expect, it } from 'vitest';
import { knowledgePicker } from '@/test-support/knowledge-kit';
import { editorRig } from '@/test-support/editor-kit';

const picker = () => knowledgePicker(editorRig());

describe('topics', () => {
  it('lists every topic depth first: a topic, then its children by order, with the depth', () => {
    const topics = picker().topics?.() ?? [];
    expect(topics).toHaveLength(27);
    expect(topics[0]?.depth).toBe(0);
    const at = new Map(topics.map((t, i) => [t.id, i]));
    for (const topic of topics) {
      if (topic.depth === 0) continue;
      const before = topics.slice(0, at.get(topic.id)).reverse().find((t) => t.depth === topic.depth - 1);
      expect(before).toBeDefined();
    }
  });
});

describe('mappings and relevance of a record', () => {
  it('a mapped demo reaction lists its topic and role in words, with the mapping ID', () => {
    const lines = picker().topicLinesOf?.({ kind: 'reaction', id: 'rxn_alcohol1-to-aldehyde-pcc' }) ?? [];
    expect(lines).toEqual([expect.objectContaining({ id: 'tmp_alcohol1-to-aldehyde-pcc-alcohol-oxidation-dehydration', words: 'Oxidation and dehydration of alcohols · core' })]);
  });
  it('a topic lists the records mapped to it, with their roles', () => {
    const lines = picker().mappedRecordsOf?.('top_alcohol-oxidation-dehydration') ?? [];
    expect(lines.some((l) => l.target.id === 'rxn_alcohol1-to-aldehyde-pcc' && /core$/.test(l.words))).toBe(true);
  });
  it('the demo relevance record is listed for its reaction, naming the version and the scope', () => {
    const lines = picker().relevanceLinesOf?.({ kind: 'reaction', id: 'rxn_cyclohexanone-oxime-beckmann' }) ?? [];
    expect(lines).toEqual([expect.objectContaining({ id: 'erl_beckmann-advanced', words: 'JEE Advanced 2026 (provisional) · enrichment' })]);
  });
  it('a record with none lists none', () => {
    const p = picker();
    expect(p.relevanceLinesOf?.({ kind: 'reaction', id: 'rxn_aniline-diazotisation' })).toEqual([]);
  });
});

describe('exams and their versions', () => {
  it('lists the exams by name and the versions of ONE exam', () => {
    const p = picker();
    expect(p.exams?.().map((e) => e.name)).toEqual(['JEE Advanced', 'JEE Main']);
    expect(p.versionsOf?.('exm_jee-main').map((v) => v.id)).toEqual(['exv_jee-main-2026']);
    expect(p.versionsOf?.('exm_nothing')).toEqual([]);
  });
});

describe('map families', () => {
  it('lists the anchors with the class name, group, tone, order and cell', () => {
    const families = picker().mapFamilies?.() ?? [];
    expect(families).toHaveLength(15);
    expect(families.find((f) => f.id === 'anc_alcohols')).toMatchObject({ name: 'Alcohols', group: 'Oxygen compounds', tone: 'green', order: 7, cell: { column: 1, row: 1 }, targetId: 'cls_alcohols' });
  });
  it('names the family of a class, or none', () => {
    const p = picker();
    expect(p.mapFamilyOf?.('cls_alcohols')).toBe('anc_alcohols');
    expect(p.mapFamilyOf?.('cls_nothing')).toBeUndefined();
  });
});

describe('a topic as a parent', () => {
  it('cannot be its own parent or below itself (a cycle), in words', () => {
    const p = picker();
    expect(p.parentRefusal?.('top_alcohol-oxidation-dehydration', 'top_alcohol-oxidation-dehydration', 'topic')).toMatch(/cannot be its own parent/);
    expect(p.parentRefusal?.('top_alcohols-phenols-ethers', 'top_alcohol-oxidation-dehydration', 'topic')).toMatch(/already below/);
    expect(p.parentRefusal?.('top_alcohol-oxidation-dehydration', 'top_alcohols-phenols-ethers', 'topic')).toBeUndefined();
  });
});
