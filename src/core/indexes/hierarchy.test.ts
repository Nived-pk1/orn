import { describe, expect, it } from 'vitest';
import { REFERENCE_SPECS, type Names } from '../schema';
import { commit, loadFixtureState, must, type Tables } from '../../test-support/state-fixture';
import { coreIndexEngine } from './engine';
import { closure, HIERARCHY_FIELDS, isParentPath, parentIdsOf } from './hierarchy';
import type { HierarchyKind } from './contracts';

const base = loadFixtureState('maximal-valid');

describe('hierarchy table', () => {
  it('matches the reference registry: each parent field is a same-kind, detach reference', () => {
    for (const [kind, field] of Object.entries(HIERARCHY_FIELDS)) {
      const specs = REFERENCE_SPECS.filter((spec) => spec.owner === kind && spec.path.replace('[]', '') === field);
      expect(specs, kind).toHaveLength(1);
      expect(specs[0]?.target).toEqual({ type: 'id', kind });
    }
  });

  it('reads single and list parents and ignores malformed values', () => {
    expect(parentIdsOf({ parentId: 'top_a' }, 'topic')).toEqual(['top_a']);
    expect(parentIdsOf({ parentIds: ['cls_a', 'cls_b'] }, 'class')).toEqual(['cls_a', 'cls_b']);
    expect(parentIdsOf({ parentIds: ['cls_a', 3, null] }, 'class')).toEqual(['cls_a']);
    expect(parentIdsOf({}, 'class')).toEqual([]);
    expect(parentIdsOf(null, 'class')).toEqual([]);
    expect(parentIdsOf({ parentIds: 'cls_a' }, 'topic')).toEqual([]);
  });

  it('recognises parent paths exactly', () => {
    expect(isParentPath('parentIds[0]', 'class')).toBe(true);
    expect(isParentPath('parentId', 'topic')).toBe(true);
    expect(isParentPath('exampleSpeciesIds[0]', 'class')).toBe(false);
    expect(isParentPath('parentIdsExtra[0]', 'class')).toBe(false);
  });
});

describe('closure', () => {
  it('is breadth-first, deduplicated, excludes the start and survives cycles', () => {
    const graph: Record<string, string[]> = { a: ['b', 'c'], b: ['d', 'a'], c: ['d'], d: ['b'] };
    expect(closure('a', (id) => graph[id] ?? [])).toEqual(['b', 'c', 'd']);
  });
});

const names = (canonical: string): Names => ({ canonical, common: [], aliases: [] });

/** Adds class records `id -> parents` cloned from a fixture class. */
function withClasses(spec: Record<string, string[]>) {
  const template = must(Object.values(base.records.class)[0]);
  return commit(base, 1, (tables) => {
    for (const [id, parentIds] of Object.entries(spec)) {
      (tables as Tables).class[id] = { ...template, id, names: names(id), parentIds, exampleSpeciesIds: [] };
    }
  });
}

function indexesOf(spec: Record<string, string[]>) {
  const { after } = withClasses(spec);
  return coreIndexEngine.build(after);
}

describe('ancestorsOf / descendantsOf', () => {
  it('walks a chain nearest first', () => {
    const ix = indexesOf({ cls_a: [], cls_b: ['cls_a'], cls_c: ['cls_b'] });
    expect(ix.ancestorsOf('class', 'cls_c')).toEqual(['cls_b', 'cls_a']);
    expect(ix.descendantsOf('class', 'cls_a')).toEqual(['cls_b', 'cls_c']);
    expect(ix.classAncestors('cls_c' as never)).toEqual(['cls_b', 'cls_a']);
    expect(ix.ancestorsOf('class', 'cls_a')).toEqual([]);
  });

  it('handles a diamond once per node, in parentIds order', () => {
    const ix = indexesOf({ cls_top: [], cls_l: ['cls_top'], cls_r: ['cls_top'], cls_leaf: ['cls_r', 'cls_l'] });
    expect(ix.ancestorsOf('class', 'cls_leaf')).toEqual(['cls_r', 'cls_l', 'cls_top']);
    expect(ix.descendantsOf('class', 'cls_top')).toEqual(['cls_l', 'cls_r', 'cls_leaf']);
  });

  it('terminates on cycles and self-parents, never listing the start', () => {
    const ix = indexesOf({ cls_a: ['cls_b'], cls_b: ['cls_c'], cls_c: ['cls_a'], cls_s: ['cls_s'] });
    expect(ix.ancestorsOf('class', 'cls_a')).toEqual(['cls_b', 'cls_c']);
    expect(ix.descendantsOf('class', 'cls_a')).toEqual(['cls_c', 'cls_b']);
    expect(ix.ancestorsOf('class', 'cls_s')).toEqual([]);
    expect(ix.descendantsOf('class', 'cls_s')).toEqual([]);
  });

  it('skips dangling parents and answers [] for unknown IDs', () => {
    const ix = indexesOf({ cls_a: ['cls_missing'] });
    expect(ix.ancestorsOf('class', 'cls_a')).toEqual([]);
    expect(ix.ancestorsOf('class', 'cls_nothing')).toEqual([]);
    expect(ix.descendantsOf('class', 'cls_nothing')).toEqual([]);
  });

  it('does not mix kinds: a class link is not a concept link', () => {
    const ix = coreIndexEngine.build(base);
    expect(ix.ancestorsOf('class', 'cpt_max-carbonyl-addition')).toEqual([]);
    expect(ix.ancestorsOf('concept', 'cpt_max-carbonyl-addition')).toEqual(['cpt_max-nucleophilic-addition']);
  });

  it.each([
    ['class', 'cls_max-tertiary-alcohols', ['cls_max-alcohols'], 'cls_max-alcohols', ['cls_max-tertiary-alcohols']],
    [
      'concept',
      'cpt_max-carbonyl-addition',
      ['cpt_max-nucleophilic-addition'],
      'cpt_max-nucleophilic-addition',
      ['cpt_max-carbonyl-addition'],
    ],
    [      'named_reaction',
      'nrx_max-grignard-carbonyl-addition',
      ['nrx_max-grignard-reactions'],
      'nrx_max-grignard-reactions',
      ['nrx_max-grignard-carbonyl-addition'],
    ],
    [
      'topic',
      'top_max-grignard',
      ['top_max-alcohols', 'top_max-organic'],
      'top_max-organic',
      ['top_max-alcohols', 'top_max-grignard'],
    ],
  ] as [HierarchyKind, string, string[], string, string[]][])(
    '%s ancestry in the maximal fixture',
    (kind, child, ancestors, root, descendants) => {
      const ix = coreIndexEngine.build(base);
      expect(ix.ancestorsOf(kind, child)).toEqual(ancestors);
      expect(ix.descendantsOf(kind, root)).toEqual(descendants);
    },
  );

  it('INV-22 (Phase 1 part): walks a 5,000-deep chain without recursion and in bounded time', () => {
    const spec: Record<string, string[]> = { cls_n0: [] };
    for (let i = 1; i < 5000; i++) spec[`cls_n${i}`] = [`cls_n${i - 1}`];
    const started = Date.now();
    const ix = indexesOf(spec);
    expect(ix.ancestorsOf('class', 'cls_n4999')).toHaveLength(4999);
    expect(ix.descendantsOf('class', 'cls_n0')).toHaveLength(4999);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
