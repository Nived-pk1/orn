// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoNavigatorScene, node, sceneOf } from '@/test-support/svg-kit';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { keyOf, legendOf, NO_KEY } from './legend';
import { mapView } from './map-view';
import { NavigatorLegend } from './navigator-legend';

afterEach(cleanup);

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

describe('keyOf: what the map needs explained, only when it draws it (step 5.5d item d; reworked in 8.2a)', () => {
  const quiet = { focusId: null, chapter: false, showUnclassified: false } as const;
  it('the quiet demo map explains its two line styles, the within-the-family line and Unclassified, but no chip or pair (no arrow is drawn)', () => {
    expect(keyOf(mapView(demoNavigatorScene(false), quiet))).toEqual({ lines: true, chip: false, pair: false, within: true, unclassified: { shown: false, reactions: expect.any(Number) } });
  });
  it('a chapter draws arrows with chips, and the demo has a two-way pair', () => {
    const key = keyOf(mapView(demoNavigatorScene(false), { ...quiet, chapter: true }));
    expect(key.chip).toBe(true);
    expect(key.pair).toBe(true);
  });
  it('nothing drawn, nothing explained', () => {
    expect(keyOf(null)).toEqual(NO_KEY);
    expect(keyOf(mapView(sceneOf([]), quiet))).toEqual(NO_KEY);
  });
});

describe('NavigatorLegend explains the marks in words next to small samples', () => {
  const words = (li: Element): string => [...li.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
  it('says what the two line styles, the chip, the pair and the within-the-family line mean, in words', () => {
    render(<NavigatorLegend items={[]} keys={{ lines: true, chip: true, pair: true, within: true, unclassified: undefined }} />);
    const list = screen.getByRole('list', { name: 'What the marks mean' });
    const items = within(list).getAllByRole('listitem').map(words);
    expect(items).toEqual([
      "solid line in the family's colour: what the family makes",
      'dashed dark line: what the family is made from',
      'number of reactions on this arrow',
      'one line with a head at each end: reactions both ways, a number near each head',
      'n within the family: reactions that start and end in the same family (no loop is drawn)',
    ]);
    for (const li of within(list).getAllByRole('listitem')) expect(li.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole('list', { name: 'Family groups' })).toBeNull();
  });
  it('Unclassified hidden: says how many reactions lead there and offers Show; shown: Hide', () => {
    const onToggle = vi.fn();
    const hidden = render(<NavigatorLegend items={[]} keys={{ ...NO_KEY, unclassified: { shown: false, reactions: 5 } }} onToggleUnclassified={onToggle} />);
    expect(hidden.container.textContent).toContain('5 reactions lead to compounds that are in no family yet');
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    hidden.unmount();
    render(<NavigatorLegend items={[]} keys={{ ...NO_KEY, unclassified: { shown: true, reactions: 1 } }} onToggleUnclassified={onToggle} />);
    expect(screen.getByRole('button', { name: 'Hide' })).toBeTruthy();
    expect(screen.getByText(/Unclassified: compounds not in any family yet/)).toBeTruthy();
  });
  it('singular for one reaction; the Studio link only when given', () => {
    const { container } = render(<NavigatorLegend items={[]} keys={{ ...NO_KEY, unclassified: { shown: false, reactions: 1 } }} onToggleUnclassified={() => undefined} />);
    expect(container.textContent).toContain('1 reaction leads to compounds that are in no family yet');
    expect(screen.queryByRole('button', { name: 'See those compounds' })).toBeNull();
    cleanup();
    const onSee = vi.fn();
    render(<NavigatorLegend items={[]} keys={{ ...NO_KEY, unclassified: { shown: false, reactions: 2 } }} onToggleUnclassified={() => undefined} onSeeCompounds={onSee} />);
    fireEvent.click(screen.getByRole('button', { name: 'See those compounds' }));
    expect(onSee).toHaveBeenCalled();
  });
  it('is absent when there is nothing to say', () => {
    expect(render(<NavigatorLegend items={[]} />).container.querySelector('ul')).toBeNull();
  });
});
