// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { demoNavigatorScene, node, sceneOf } from '@/test-support/svg-kit';
import { render, screen, within } from '@testing-library/react';
import { keyOf, legendOf } from './legend';
import { NavigatorLegend } from './navigator-legend';

const grouped = (id: string, group: string, tone?: 'blue' | 'green' | 'amber' | 'violet') =>
  node(id, { arrangement: { cell: { column: 0, row: 0 }, group, ...(tone === undefined ? {} : { tone }) } });

describe('legendOf: each family group of the drawing once, from the data', () => {
  it('lists the four groups of the demo in the order the grid reads, with their tones and hub counts', () => {
    expect(legendOf(demoNavigatorScene(false))).toEqual([
      { group: 'Hydrocarbons', tone: 'blue', hubs: 4 },
      { group: 'Halogen compounds', tone: 'amber', hubs: 2 },
      { group: 'Oxygen compounds', tone: 'green', hubs: 7 },
      { group: 'Nitrogen compounds', tone: 'violet', hubs: 2 },
    ]);
  });

  it('is empty without a Scene, for a Scene with no groups, and never lists Unclassified or an ungrouped hub', () => {
    expect(legendOf(null)).toEqual([]);
    expect(legendOf(sceneOf([node('cls_a'), node('virtual:unclassified', { kind: 'virtual', role: 'unclassified' })]))).toEqual([]);
  });

  it('a group appears once however many hubs name it, and a name that is not in the data is not invented', () => {
    const items = legendOf(sceneOf([grouped('cls_a', 'Zeta', 'blue'), grouped('cls_b', 'Zeta', 'blue'), grouped('cls_c', 'Alpha', 'green'), node('cls_d')]));
    expect(items.map((i) => i.group).sort()).toEqual(['Alpha', 'Zeta']);
    expect(items.find((i) => i.group === 'Zeta')?.hubs).toBe(2);
  });

  it('a group without a tone is listed with no tone (a neutral swatch)', () => {
    expect(legendOf(sceneOf([grouped('cls_a', 'Plain')]))).toEqual([{ group: 'Plain', tone: undefined, hubs: 1 }]);
  });

  it('is a pure function of the Scene: the same list for the same Scene', () => {
    const scene = demoNavigatorScene(false);
    expect(legendOf(scene)).toEqual(legendOf(scene));
  });
});

describe('keyOf: what the drawing needs explained, only when it draws it (step 5.5d, item d)', () => {
  it('the demo draws chips, loops and the Unclassified box', () => {
    expect(keyOf(demoNavigatorScene(false))).toEqual({ chip: true, loop: true, unclassified: true });
  });
  it('nothing drawn, nothing explained', () => {
    expect(keyOf(null)).toEqual({ chip: false, loop: false, unclassified: false });
    expect(keyOf(sceneOf([node('cls_a')]))).toEqual({ chip: false, loop: false, unclassified: false });
  });
});

describe('NavigatorLegend explains the marks in words next to small samples', () => {
  it('says what the chip, the loop and Unclassified mean', () => {
    render(<NavigatorLegend items={[]} keys={{ chip: true, loop: true, unclassified: true }} />);
    const list = screen.getByRole('list', { name: 'What the marks mean' });
    const words = (li: Element): string => [...li.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
    const items = within(list).getAllByRole('listitem').map(words);
    expect(items).toEqual(['number of reactions on this arrow', 'reactions within the same family', 'Unclassified: compounds not in any family yet']);
    for (const li of within(list).getAllByRole('listitem')) expect(li.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole('list', { name: 'Family groups' })).toBeNull();
  });
  it('leaves out what is not drawn, and is absent when there is nothing to say', () => {
    const { container } = render(<NavigatorLegend items={[]} keys={{ chip: false, loop: true, unclassified: false }} />);
    expect(within(container).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['reactions within the same family']);
    const none = render(<NavigatorLegend items={[]} />);
    expect(none.container.querySelector('ul')).toBeNull();
  });
});
