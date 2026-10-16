/** The phone's Families tab rows (ADR-039): the List view's own families, grouped, with nothing added or left out. */
import { describe, expect, it } from 'vitest';
import type { Scene, SceneEdge, SceneNode } from '@/render/scene';
import { familyCardsOf, NO_GROUP_TITLE, UNCLASSIFIED_TITLE } from './family-cards';
import { listRowsOf } from './list-rows';

const node = (id: string, name: string, x: number, y: number, box: SceneNode['box'] = 'hub', group?: string, formula?: string): SceneNode => ({
  id, glyph: 'class_hub', box, x, y, width: 10, height: 10, label: [{ text: name }], ...(formula === undefined ? {} : { sublabel: [{ text: formula }] }), badges: [],
  ...(group === undefined ? {} : { group }), emphasis: 'normal', state: { dimmed: false, onPath: false }, minLod: 0, ariaLabel: `${name}, class hub`,
});
const edge = (id: string, from: string, to: string, bundleSize?: number): SceneEdge => ({
  id, from, to, points: [], semantic: 'transforms_to', stroke: 'solid', weight: 'normal', arrowHead: 'filled', labelAt: { x: 0, y: 0 }, ...(bundleSize === undefined ? {} : { bundleSize }), minLod: 0, ariaLabel: `${from} to ${to}`,
});
const scene = (nodes: SceneNode[], edges: SceneEdge[]): Scene => ({ revision: 1, projectionKey: 'p', layoutKey: 'l', nodes, edges, bounds: { width: 1, height: 1 }, truncation: null });

const S = scene(
  [
    node('ale', 'Alkenes', 0, 0, 'hub', 'Hydrocarbons', 'R2C=CR2'),
    node('alk', 'Alkanes', 100, 0, 'hub', 'Hydrocarbons'),
    node('hal', 'Haloalkanes', 0, 100, 'hub', 'Halogen compounds', 'R-X'),
    node('alc', 'Alcohols', 0, 200, 'hub', 'Oxygen compounds', 'R-OH'),
    node('ald', 'Aldehydes', 100, 200, 'hub', 'Oxygen compounds', 'R-CHO'),
    node('ami', 'Amines', 0, 300, 'hub', 'Nitrogen compounds'),
    node('nog', 'Orphans', 100, 300, 'hub'),
    node('unc', 'Unclassified', 200, 300, 'unclassified'),
    node('mem', 'A member', 300, 300, 'member'),
  ],
  [edge('e1', 'alk', 'hal', 2), edge('e2', 'alc', 'ald', 3), edge('e3', 'ald', 'alc'), edge('e4', 'ald', 'ald', 2), edge('e5', 'alk', 'ale', 4)],
);

describe('familyCardsOf', () => {
  it('has one card for every family row of the List view, no more and no less', () => {
    const rows = listRowsOf(S).families.map((row) => row.id).sort();
    const cards = familyCardsOf(S).flatMap((group) => group.cards.map((card) => card.id)).sort();
    expect(cards).toEqual(rows);
    expect(cards).not.toContain('mem'); // a member is not a family
  });

  it('keeps the List order inside every group and says the same name', () => {
    const rows = listRowsOf(S).families;
    for (const group of familyCardsOf(S)) {
      const expected = rows.filter((row) => group.cards.some((card) => card.id === row.id));
      expect(group.cards.map((card) => card.id)).toEqual(expected.map((row) => row.id));
      expect(group.cards.map((card) => card.name)).toEqual(expected.map((row) => row.name));
    }
  });

  it('puts every family in the group the List view names for it', () => {
    const rows = new Map(listRowsOf(S).families.map((row) => [row.id, row.group] as const));
    for (const group of familyCardsOf(S)) {
      for (const card of group.cards) {
        const named = rows.get(card.id) ?? '';
        if (group.title === NO_GROUP_TITLE) expect(named).toBe('');
        else if (group.title !== UNCLASSIFIED_TITLE) expect(named).toBe(group.title);
      }
    }
  });

  it('orders the groups as the map reads (top to bottom), then no group, then Unclassified', () => {
    expect(familyCardsOf(S).map((group) => group.title)).toEqual(['Hydrocarbons', 'Halogen compounds', 'Oxygen compounds', 'Nitrogen compounds', NO_GROUP_TITLE, UNCLASSIFIED_TITLE]);
  });

  it('counts the reactions on the arrows that leave or enter a family, a loop once', () => {
    const byId = new Map(familyCardsOf(S).flatMap((group) => group.cards).map((card) => [card.id, card] as const));
    expect(byId.get('alk')?.reactions).toBe(6); // 2 to haloalkanes + 4 to alkenes
    expect(byId.get('alc')?.reactions).toBe(4); // 3 out, 1 in
    expect(byId.get('ald')?.reactions).toBe(1 + 3 + 2); // 1 out to alcohols, 3 in, the loop of 2 once
    expect(byId.get('ami')?.reactions).toBe(0);
  });

  it('carries the general formula of the hub, when it has one', () => {
    const byId = new Map(familyCardsOf(S).flatMap((group) => group.cards).map((card) => [card.id, card] as const));
    expect(byId.get('alc')?.formula).toEqual([{ text: 'R-OH' }]);
    expect(byId.get('alk')?.formula).toBeUndefined();
  });

  it('is empty without a Scene', () => {
    expect(familyCardsOf(null)).toEqual([]);
  });
});
