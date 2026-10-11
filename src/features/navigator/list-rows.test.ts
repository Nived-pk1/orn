/** The List view's pure parts (step 5.7, item j): the rows of a Scene, the sorts, and the header press cycle. */
import { describe, expect, it } from 'vitest';
import type { Scene, SceneEdge, SceneNode } from '@/render/scene';
import { arrowValue, familyValue, listRowsOf, nextSort, sortRows, type Sort } from './list-rows';

const node = (id: string, name: string, box: SceneNode['box'] = 'hub', group?: string): SceneNode => ({
  id,
  glyph: 'class_hub',
  box,
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  label: [{ text: name }],
  badges: [],
  ...(group === undefined ? {} : { group }),
  emphasis: 'normal',
  state: { dimmed: false, onPath: false },
  minLod: 0,
  ariaLabel: `${name}, class hub`,
});
const edge = (id: string, from: string, to: string, bundleSize?: number): SceneEdge => ({
  id,
  from,
  to,
  points: [],
  semantic: 'transforms_to',
  stroke: 'solid',
  weight: 'normal',
  arrowHead: 'filled',
  labelAt: { x: 0, y: 0 },
  ...(bundleSize === undefined ? {} : { bundleSize }),
  minLod: 0,
  ariaLabel: `${from} to ${to}`,
});
const scene = (nodes: SceneNode[], edges: SceneEdge[]): Scene => ({ revision: 1, projectionKey: 'p', layoutKey: 'l', nodes, edges, bounds: { width: 1, height: 1 }, truncation: null });

describe('listRowsOf', () => {
  const s = scene(
    [node('a', 'Alcohols', 'hub', 'Oxygen compounds'), node('b', 'Aldehydes'), node('u', 'Unclassified', 'unclassified'), node('m', 'Member', 'member')],
    [edge('e1', 'a', 'b', 3), edge('e2', 'b', 'a'), edge('e3', 'a', 'a', 2)],
  );

  it('has a row per family (hubs and the unclassified box, not members) in the maps order, with reactions out and in', () => {
    const { families } = listRowsOf(s);
    expect(families.map((row) => row.id)).toEqual(['a', 'b', 'u']);
    expect(families.map((row) => [row.out, row.in])).toEqual([[5, 3], [1, 3], [0, 0]]);
    expect(families[0]).toMatchObject({ name: 'Alcohols', group: 'Oxygen compounds', label: 'Alcohols, class hub' });
    expect(families[1]?.group).toBe('');
  });

  it('has a row per arrow with the names of its ends and its number of reactions (1 for a single arrow)', () => {
    const { arrows } = listRowsOf(s);
    expect(arrows.map((row) => [row.id, row.from, row.to, row.reactions])).toEqual([
      ['e1', 'Alcohols', 'Aldehydes', 3],
      ['e2', 'Aldehydes', 'Alcohols', 1],
      ['e3', 'Alcohols', 'Alcohols', 2],
    ]);
  });
});

describe('sortRows and nextSort', () => {
  const rows = listRowsOf(
    scene(
      [node('a', 'Alkanes'), node('b', 'alcohols'), node('c', 'Esters 10'), node('d', 'Esters 2'), node('e', 'Ethers')],
      [edge('x1', 'a', 'b', 4), edge('x2', 'b', 'c', 4), edge('x3', 'c', 'd', 1)],
    ),
  ).families;

  it('sorts names without regard to case, numbers inside names in numeric order, and ties by id', () => {
    const sorted = sortRows(rows, { column: 'name', direction: 'ascending' }, familyValue).map((row) => row.name);
    expect(sorted).toEqual(['alcohols', 'Alkanes', 'Esters 2', 'Esters 10', 'Ethers']);
    expect(sortRows(rows, { column: 'name', direction: 'descending' }, familyValue).map((row) => row.name)).toEqual([...sorted].reverse());
  });

  it('sorts counts by value and breaks ties by id, in both directions; no sort keeps the order given', () => {
    const asc = sortRows(rows, { column: 'out', direction: 'ascending' }, familyValue);
    expect(asc.map((row) => row.out)).toEqual([0, 0, 1, 4, 4]);
    expect(asc.filter((row) => row.out === 4).map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortRows(rows, { column: 'out', direction: 'descending' }, familyValue).map((row) => row.out)).toEqual([4, 4, 1, 0, 0]);
    expect(sortRows(rows, null, familyValue)).toBe(rows);
  });

  it('is deterministic for any order of the rows', () => {
    const sort: Sort = { column: 'in', direction: 'descending' };
    expect(sortRows([...rows].reverse(), sort, familyValue).map((row) => row.id)).toEqual(sortRows(rows, sort, familyValue).map((row) => row.id));
  });

  it('arrow columns: from, to and reactions', () => {
    const { arrows } = listRowsOf(scene([node('a', 'A'), node('b', 'B')], [edge('x', 'b', 'a', 2), edge('y', 'a', 'b', 5)]));
    expect(sortRows(arrows, { column: 'from', direction: 'ascending' }, arrowValue).map((row) => row.id)).toEqual(['y', 'x']);
    expect(sortRows(arrows, { column: 'reactions', direction: 'descending' }, arrowValue).map((row) => row.id)).toEqual(['y', 'x']);
  });

  it('a header press goes ascending, descending, then back to the maps own order; another column starts ascending', () => {
    const first = nextSort(null, 'name');
    expect(first).toEqual({ column: 'name', direction: 'ascending' });
    const second = nextSort(first, 'name');
    expect(second).toEqual({ column: 'name', direction: 'descending' });
    expect(nextSort(second, 'name')).toBeNull();
    expect(nextSort(second, 'out')).toEqual({ column: 'out', direction: 'ascending' });
  });
});
