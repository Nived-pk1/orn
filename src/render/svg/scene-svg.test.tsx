// @vitest-environment jsdom
/**
 * Scene -> DOM (step 5.4a): counts per layer, attributes, glyphs, edge styles by dash and width alone, text as tspans, hostile
 * strings as text (ADV-033, render part), clipping with the full text reachable, LOD 0 to 3, accessible names.
 */
import { cleanup, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BOXES, type Scene, type SceneNode } from '@/render/scene';
import { demoNavigatorScene, draw, edge, node, sceneOf, withEdge, withNode } from '@/test-support/svg-kit';
import { nobodyPorts, pipe, projectionOf } from '@/test-support/scene-kit';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ARROW_LINE_HEIGHT, STROKE_DASH, WEIGHT_WIDTH } from './geometry';

afterEach(cleanup);

const all = (root: Element, selector: string): Element[] => [...root.querySelectorAll(selector)];
const nodeEl = (root: Element, id: string): Element => root.querySelector(`[data-node-id="${id}"]`) as Element;
const edgeEl = (root: Element, id: string): Element => root.querySelector(`[data-edge-id="${id}"]`) as Element;

describe('the whole drawing', () => {
  const scene = demoNavigatorScene(true);

  it('is one root svg with a name, one world group and five layers in drawing order', () => {
    const { container, svg } = draw(scene, { ariaLabel: 'Navigator: demo' });
    expect(all(container, 'svg')).toHaveLength(1);
    expect(svg.getAttribute('role')).toBe('group');
    expect(svg.getAttribute('aria-label')).toBe('Navigator: demo');
    const worlds = all(container, '[data-world]');
    expect(worlds).toHaveLength(1);
    expect(all(worlds[0] as Element, ':scope > [data-layer]').map((layer) => layer.getAttribute('data-layer'))).toEqual(['edges', 'nodes', 'labels', 'badges', 'overlay']);
  });

  it('draws every node and every edge of the Scene once, with its id and its accessible name', () => {
    const { container } = draw(scene);
    expect(scene.nodes.length).toBeGreaterThan(10);
    expect(scene.edges.length).toBeGreaterThan(10);
    expect(all(container, '[data-node-id]').map((el) => el.getAttribute('data-node-id'))).toEqual(scene.nodes.map((n) => n.id));
    expect(all(container, '[data-edge-id]').map((el) => el.getAttribute('data-edge-id'))).toEqual(scene.edges.map((e) => e.id));
    for (const n of scene.nodes) expect(nodeEl(container, n.id).getAttribute('aria-label')).toBe(n.ariaLabel);
    for (const e of scene.edges) expect(edgeEl(container, e.id).getAttribute('aria-label')).toBe(e.ariaLabel);
    expect(within(container as HTMLElement).getAllByRole('graphics-symbol')).toHaveLength(scene.nodes.length + scene.edges.length);
  });

  it('puts nodes at their corners and takes the node box kind from the Scene', () => {
    const { container } = draw(scene);
    for (const n of scene.nodes) {
      const el = nodeEl(container, n.id);
      expect(el.getAttribute('transform')).toBe(`translate(${n.x} ${n.y})`);
      expect(el.getAttribute('data-box')).toBe(n.box);
    }
    expect(new Set(scene.nodes.map((n) => n.box)).size).toBeGreaterThanOrEqual(3);
  });

  it('writes no colour literal and no inline style: colours come from the tokens through classes', () => {
    const { container } = draw(scene);
    const colourAttributes = ['fill', 'stroke', 'stop-color', 'flood-color', 'color'];
    for (const el of all(container, '*')) {
      expect(el.hasAttribute('style'), el.tagName).toBe(false);
      for (const name of colourAttributes) {
        const value = el.getAttribute(name);
        if (value !== null) expect(value, `${el.tagName} ${name}`).toMatch(/^(none|currentColor|url\(#[\w-]+\))$/);
      }
    }
  });

  it('keeps the ONE world group out of the layers: nothing in the drawing transforms it', () => {
    const { container } = draw(scene);
    expect((all(container, '[data-world]')[0] as Element).hasAttribute('transform')).toBe(false);
  });

  it('draws a dimmed (outside scope) node dimmed', () => {
    const dimmed = sceneOf([node('cls_a'), node('cls_b')]);
    const { container } = draw(withNode(dimmed, 'cls_b', { state: { dimmed: true, onPath: false } }));
    expect(nodeEl(container, 'cls_b').getAttribute('class')).toContain('dimmed');
    expect(nodeEl(container, 'cls_a').getAttribute('class') ?? '').not.toContain('dimmed');
  });
});

describe('glyphs (UI_ARCHITECTURE §3)', () => {
  const scene = sceneOf([
    node('cls_hub', { kind: 'class', role: 'anchor' }),
    node('spc_member', { kind: 'species', role: 'member', record: { kind: 'species', id: 'spc_member' } }),
    node('spc_alone', { kind: 'species', role: 'focus', record: { kind: 'species', id: 'spc_alone' } }),
    node('rgt_chip', { kind: 'reagent', role: 'focus', record: { kind: 'reagent', id: 'rgt_chip' } }),
    node('virtual:overflow:x', { kind: 'virtual', role: 'overflow', hidden: { outgoing: 3, incoming: 0 }, hiddenMembers: 12 }),
    node('virtual:unclassified', { kind: 'virtual', role: 'unclassified' }),
  ]);
  let container: HTMLElement;
  beforeEach(() => {
    container = draw(scene, { lod: 1 }).container;
  });
  const shapes = (id: string): Element[] => all(nodeEl(container, id), ':scope > rect');

  it('a class hub is a block with a thick left rule', () => {
    const [block, rule] = shapes('cls_hub') as [Element, Element];
    expect(block.getAttribute('class')).toContain('hubBlock');
    expect(rule.getAttribute('class')).toContain('hubRule');
    expect(Number(rule.getAttribute('width'))).toBeGreaterThanOrEqual(4);
    expect(rule.getAttribute('height')).toBe(block.getAttribute('height'));
  });

  it('a species, a member, a reagent chip, the overflow box and Unclassified are different shapes', () => {
    const species = shapes('spc_alone')[0] as Element;
    const member = shapes('spc_member')[0] as Element;
    const chip = shapes('rgt_chip')[0] as Element;
    const overflow = shapes('virtual:overflow:x')[0] as Element;
    const unclassified = shapes('virtual:unclassified')[0] as Element;
    expect(species.getAttribute('class')).toContain('box');
    expect(member.getAttribute('class')).toContain('member');
    expect(chip.getAttribute('class')).toContain('chip');
    // The chip is round-ended; the species box is square-ish.
    expect(Number(chip.getAttribute('rx'))).toBeGreaterThan(Number(species.getAttribute('rx')));
    // Overflow and Unclassified are dashed with different patterns; no other box is dashed.
    expect(overflow.getAttribute('stroke-dasharray')).toBe('6 4');
    expect(unclassified.getAttribute('stroke-dasharray')).toBe('2 3');
    for (const solid of [species, member, chip]) expect(solid.hasAttribute('stroke-dasharray')).toBe(false);
  });

  it('shows the words of the glyph: the overflow box says "+N more", Unclassified its fixed word', () => {
    expect(container.textContent).toContain('+12 more');
    expect(container.textContent).toContain('Unclassified');
  });

  it('uses the font sizes of the node box kind', () => {
    const label = (id: string): Element => container.querySelector(`[data-label-of="${id}"] text`) as Element;
    expect(label('cls_hub').getAttribute('font-size')).toBe(String(BOXES.hub.label.size));
    expect(label('rgt_chip').getAttribute('font-size')).toBe(String(BOXES.reagent.label.size));
    expect(label('spc_member').getAttribute('font-size')).toBe(String(BOXES.member.label.size));
  });
});

describe('edges: stroke, weight and arrowheads', () => {
  const nodes = [node('cls_a'), node('cls_b')];
  const styled = (over: Parameters<typeof edge>[3]): Scene => sceneOf(nodes, [edge('e1', 'cls_a', 'cls_b', over)]);
  const cases: readonly (readonly [string, Scene, 'solid' | 'dashed' | 'dotted', 'heavy' | 'normal' | 'light'])[] = [
    ['exclusive', styled({ selectivity: 'exclusive' }), 'solid', 'heavy'],
    ['major', styled({ selectivity: 'major' }), 'solid', 'heavy'],
    ['unspecified', styled({ selectivity: 'unspecified' }), 'solid', 'normal'],
    ['mixture component', styled({ selectivity: 'mixture_component' }), 'solid', 'normal'],
    ['minor', styled({ selectivity: 'minor' }), 'dashed', 'normal'],
    ['trace', styled({ selectivity: 'trace' }), 'dotted', 'light'],
    ['inferred major, to a member', sceneOf([node('cls_a'), node('cls_b', { kind: 'species', role: 'member' })], [edge('e1', 'cls_a', 'cls_b', { selectivity: 'major', inferred: true })]), 'dotted', 'heavy'],
    ['inferred major between hubs (item d: not dotted)', styled({ selectivity: 'major', inferred: true }), 'solid', 'heavy'],
    ['membership', styled({ semantic: 'membership', selectivity: undefined }), 'solid', 'light'],
    ['overflow', styled({ semantic: 'overflow', selectivity: undefined }), 'dashed', 'light'],
  ];
  const drawn = cases.map(([name, scene, stroke, weight]) => {
    const { container } = draw(scene);
    const path = edgeEl(container, 'e1').querySelector('path') as Element;
    return { name, stroke, weight, dash: path.getAttribute('stroke-dasharray'), width: path.getAttribute('stroke-width'), group: edgeEl(container, 'e1'), path };
  });

  it.each(drawn.map((d) => [d.name, d] as const))('%s is drawn with the dash pattern and width of its style', (_name, d) => {
    expect(d.dash).toBe(STROKE_DASH[d.stroke] ?? null);
    expect(d.width).toBe(String(WEIGHT_WIDTH[d.weight]));
    expect(d.group.getAttribute('data-stroke')).toBe(d.stroke);
    expect(d.group.getAttribute('data-weight')).toBe(d.weight);
  });

  it('every distinct style of GRAPH_SEMANTICS §4 differs from every other by dash pattern and width alone (no colour)', () => {
    const byStyle = new Map<string, string>();
    for (const d of drawn) byStyle.set(`${d.stroke}/${d.weight}`, `${d.dash}|${d.width}`);
    expect(byStyle.size).toBe(7);
    expect(new Set(byStyle.values()).size).toBe(byStyle.size);
  });

  it('the three weights are three widths in order, and the three strokes are three patterns', () => {
    expect(WEIGHT_WIDTH.heavy).toBeGreaterThan(WEIGHT_WIDTH.normal);
    expect(WEIGHT_WIDTH.normal).toBeGreaterThan(WEIGHT_WIDTH.light);
    expect(new Set([STROKE_DASH.solid, STROKE_DASH.dashed, STROKE_DASH.dotted]).size).toBe(3);
  });

  it('draws arrowheads as markers: filled for a reaction, open for a reagent link, none for membership', () => {
    const marker = (scene: Scene): { ref: string | null; defs: Element[] } => {
      const { container } = draw(scene);
      const ref = (edgeEl(container, 'e1').querySelector('path') as Element).getAttribute('marker-end');
      return { ref, defs: all(container, 'marker') };
    };
    const reaction = marker(styled({ semantic: 'transforms_to' }));
    expect(reaction.defs).toHaveLength(2);
    const id = /^url\(#(.+)\)$/.exec(reaction.ref ?? '')?.[1] as string;
    expect(reaction.defs.find((m) => m.id === id)?.querySelector('path')?.getAttribute('class')).toContain('markerFilled');
    const open = marker(styled({ semantic: 'uses_reagent' }));
    const openId = /^url\(#(.+)\)$/.exec(open.ref ?? '')?.[1] as string;
    expect(open.defs.find((m) => m.id === openId)?.querySelector('path')?.getAttribute('class')).toContain('markerOpen');
    expect(openId).not.toBe(id);
    expect(marker(styled({ semantic: 'membership', selectivity: undefined })).ref).toBeNull();
  });

  it('draws a self-loop as an edge with from === to, and a bundle once with its total', () => {
    const loop = sceneOf(nodes, [edge('e1', 'cls_a', 'cls_a')]);
    const { container } = draw(loop);
    expect(loop.edges[0]?.from).toBe(loop.edges[0]?.to);
    expect(all(container, '[data-edge-id]')).toHaveLength(1);
    expect((edgeEl(container, 'e1').querySelector('path') as Element).getAttribute('d')).toMatch(/^M[\d. -]+( L[\d. -]+){3}$/);
  });

  it('shows the count of a bundle (the TOTAL) from LOD 2 on', () => {
    const bundled = withEdge(styled({}), 'e1', { bundleSize: 752 });
    const lod1 = draw(bundled, { lod: 1 });
    expect(lod1.container.querySelector('[data-count-of]')).toBeNull();
    cleanup();
    const lod2 = draw(bundled, { lod: 2 });
    expect((lod2.container.querySelector('[data-count-of="e1"] text') as Element).textContent).toBe('752');
  });
});

describe('text', () => {
  const base = sceneOf([node('cls_a')]);
  const runs = [{ text: 'C' }, { text: '2', script: 'sub' as const }, { text: 'H' }, { text: '5', script: 'sub' as const }, { text: 'O' }, { text: '2+', script: 'sup' as const }, { text: ' x', emphasis: 'strong' as const }];

  it('is one tspan per run, sub and superscripts by class, and the line returns to its baseline', () => {
    const { container } = draw(withNode(base, 'cls_a', { label: runs }), { lod: 1 });
    const spans = all(container, '[data-label-of="cls_a"] text:first-of-type tspan');
    expect(spans.map((s) => s.textContent)).toEqual(runs.map((r) => r.text));
    expect(spans.map((s) => (s.getAttribute('class') ?? '').includes('script'))).toEqual([false, true, false, true, false, true, false]);
    expect(spans[6]?.getAttribute('class')).toContain('strong');
    const size = BOXES.hub.label.size;
    const dys = spans.map((s) => Number(s.getAttribute('dy') ?? 0));
    expect(dys[1]).toBeCloseTo(size * 0.25);
    expect(dys[2]).toBeCloseTo(-size * 0.25);
    expect(dys[5]).toBeCloseTo(-size * 0.4);
    // The shifts cancel: the text ends on the baseline it began on.
    expect(dys.reduce((sum, dy) => sum + dy, 0)).toBeCloseTo(0, 5);
  });

  it('renders hostile strings as text, never as elements (ADV-033, render part)', () => {
    const hostile = '<img src=x onerror=alert(1)></text><script>alert(2)</script>"\'&amp; **b** [[spc_x|y]]';
    const hostileScene = withNode(base, 'cls_a', { label: [{ text: hostile }], sublabel: [{ text: hostile }], ariaLabel: hostile });
    const { container } = draw(hostileScene, { lod: 3 });
    for (const tag of ['img', 'script', 'foreignObject', 'a', 'iframe']) expect(container.querySelector(tag), tag).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    const texts = all(container, '[data-label-of="cls_a"] text').map((t) => t.textContent);
    expect(texts).toEqual([hostile, hostile]);
    expect(nodeEl(container, 'cls_a').getAttribute('aria-label')).toBe(hostile);
    expect(all(container, '*').every((el) => [...el.attributes].every((attr) => !attr.name.startsWith('on')))).toBe(true);
  });

  it('renders hostile arrow text as text', () => {
    const hostile = '<script>alert(1)</script>';
    const scene = withEdge(sceneOf([node('cls_a'), node('cls_b')], [edge('e1', 'cls_a', 'cls_b')]), 'e1', { above: [{ text: hostile }], below: [{ text: hostile }] });
    const { container } = draw(scene, { lod: 2 });
    expect(container.querySelector('script')).toBeNull();
    expect(all(container, '[data-arrow-text-of="e1"] text').map((t) => t.textContent)).toEqual([hostile, hostile]);
  });

  it('puts arrow text above and below the label point of the edge', () => {
    const scene = withEdge(sceneOf([node('cls_a'), node('cls_b')], [edge('e1', 'cls_a', 'cls_b')]), 'e1', { above: [{ text: 'PCC' }], below: [{ text: 'H' }, { text: '2', script: 'sub' }, { text: 'O' }] });
    const { container } = draw(scene, { lod: 2 });
    const at = scene.edges[0]?.labelAt as { x: number; y: number };
    const above = container.querySelector('[data-side="above"]') as Element;
    const below = container.querySelector('[data-side="below"]') as Element;
    expect(Number(above.getAttribute('x'))).toBe(at.x);
    expect(Number(above.getAttribute('y'))).toBeLessThan(at.y);
    expect(Number(below.getAttribute('y'))).toBeGreaterThan(at.y);
    expect(all(below, 'tspan')).toHaveLength(3);
  });
});

describe('arrow text in the box the layout reserved (step 5.5a, items a and f)', () => {
  const lines = (above: boolean, below: boolean): { container: HTMLElement; at: { x: number; y: number }; ys: number[] } => {
    const base = sceneOf([node('cls_a'), node('cls_b')], [edge('e1', 'cls_a', 'cls_b')]);
    const scene = withEdge(base, 'e1', { ...(above ? { above: [{ text: 'NaOH' }] } : {}), ...(below ? { below: [{ text: 'heat' }] } : {}) });
    const { container } = draw(scene, { lod: 2 });
    const ys = all(container, '[data-arrow-text-of="e1"] text').map((t) => Number(t.getAttribute('y')));
    return { container, at: scene.edges[0]?.labelAt as { x: number; y: number }, ys };
  };

  it('the lines are stacked in the order above, below and centred on the label point', () => {
    const two = lines(true, true);
    expect(two.ys).toHaveLength(2);
    expect((two.ys[0] as number)).toBeLessThan(two.ys[1] as number);
    // the midpoint of the two baselines is within one line of the label point (the block is centred)
    expect(Math.abs(((two.ys[0] as number) + (two.ys[1] as number)) / 2 - two.at.y)).toBeLessThan(ARROW_LINE_HEIGHT);
    const one = lines(true, false);
    expect(one.ys).toHaveLength(1);
    expect(Math.abs((one.ys[0] as number) - one.at.y)).toBeLessThan(ARROW_LINE_HEIGHT);
  });

  it('arrow text and the bundle count have a paper-coloured outline drawn under the glyphs, from the stylesheet and the tokens', () => {
    const css = readFileSync(resolve(__dirname, 'scene-svg.module.css'), 'utf8');
    for (const selector of ['.arrowText', '.count']) {
      const start = css.indexOf(`${selector} {`);
      const block = start < 0 ? "" : css.slice(start, css.indexOf("}", start));
      expect(block, selector).toContain('paint-order: stroke');
      expect(block, selector).toContain('stroke: var(--color-paper)');
    }
    const { container } = draw(demoNavigatorScene(false), { lod: 2 });
    expect(all(container, '[data-arrow-text-of] text[style], [data-count-of] text[style]')).toEqual([]);
  });
});

describe('a label longer than its box', () => {
  const longName = `Very long name ${'x'.repeat(400)}`;
  const piped = pipe(projectionOf({ nodes: [node('spc_long', { kind: 'species', record: { kind: 'species', id: 'spc_long' }, role: 'focus' })] }), {
    ...nobodyPorts,
    describe: () => ({ name: longName, formula: 'C2H6O' }),
  });
  const scene = piped.scene;

  it('is clipped to its box by a clip path of the box size', () => {
    const n = scene.nodes[0] as SceneNode;
    expect(n.width).toBe(BOXES.species.maxWidth);
    const { container } = draw(scene, { lod: 1 });
    const ref = (container.querySelector('[data-label-of="spc_long"] > g') as Element).getAttribute('clip-path') as string;
    const id = /^url\(#(.+)\)$/.exec(ref)?.[1] as string;
    const rect = container.querySelector(`clipPath[id="${id}"] rect`) as Element;
    expect(rect.getAttribute('width')).toBe(String(n.width));
    expect(rect.getAttribute('height')).toBe(String(n.height));
  });

  it('keeps the full text reachable: a title and the accessible name', () => {
    const { container } = draw(scene, { lod: 1 });
    expect((nodeEl(container, 'spc_long').querySelector('title') as Element).textContent).toContain(longName);
    expect(nodeEl(container, 'spc_long').getAttribute('aria-label')).toContain(longName);
  });

  it('uses one clip path per distinct box size, not one per node', () => {
    const demo = demoNavigatorScene(true);
    const { container } = draw(demo, { lod: 1 });
    const sizes = new Set(demo.nodes.map((n) => `${n.width}x${n.height}`));
    expect(all(container, 'clipPath')).toHaveLength(sizes.size);
    expect(sizes.size).toBeLessThan(demo.nodes.length);
    expect(new Set(all(container, 'clipPath').map((c) => c.id)).size).toBe(sizes.size);
  });
});

describe('level of detail', () => {
  const overview = demoNavigatorScene(false);
  const scene = demoNavigatorScene(true);
  const visible = (of: Scene, lod: 0 | 1 | 2 | 3): { nodes: number; edges: number } => ({ nodes: of.nodes.filter((n) => n.minLod <= lod).length, edges: of.edges.filter((e) => e.minLod <= lod).length });
  // The demo's hubs carry no flags and no hidden neighbours, so the badges come from a hand-made Scene.
  const flagged = sceneOf([node('cls_a', { flags: ['has_caveat'] }), node('cls_b', { hidden: { outgoing: 2, incoming: 0 } }), node('cls_c')]);
  const withBadges = flagged.nodes.filter((n) => n.badges.length > 0);
  const withArrowText = scene.edges.filter((e) => e.above !== undefined || e.below !== undefined);
  const bundles = overview.edges.filter((e) => e.bundleSize !== undefined);

  it('the demo has what the levels differ in', () => {
    expect(withBadges).toHaveLength(2);
    expect(withArrowText.length).toBeGreaterThan(0);
    expect(bundles.length).toBeGreaterThan(0);
    expect(visible(scene, 0).nodes).toBeLessThan(visible(scene, 1).nodes);
  });

  it('LOD 0: glyphs only: an element below its minLod is not rendered, and nothing says a word', () => {
    const { container } = draw(scene, { lod: 0 });
    expect(all(container, '[data-node-id]')).toHaveLength(visible(scene, 0).nodes);
    expect(all(container, '[data-edge-id]')).toHaveLength(visible(scene, 0).edges);
    expect(all(container, '[data-layer="labels"] text')).toHaveLength(0);
    expect(all(container, '[data-layer="badges"] > *')).toHaveLength(0);
    for (const el of all(container, '[data-node-id]')) expect(scene.nodes.find((n) => n.id === el.getAttribute('data-node-id'))?.minLod).toBe(0);
  });

  it('LOD 1: labels, no badges and no arrow text', () => {
    for (const of of [overview, scene, flagged]) {
      const { container } = draw(of, { lod: 1 });
      expect(all(container, '[data-node-id]')).toHaveLength(visible(of, 1).nodes);
      expect(all(container, '[data-edge-id]')).toHaveLength(visible(of, 1).edges);
      expect(all(container, '[data-label-of]')).toHaveLength(visible(of, 1).nodes);
      expect(all(container, '[data-arrow-text-of]')).toHaveLength(0);
      expect(all(container, '[data-badges-of], [data-count-of]')).toHaveLength(0);
      cleanup();
    }
  });

  it('LOD 2: badges, bundle counts and arrow text', () => {
    const marks = draw(flagged, { lod: 2 });
    expect(all(marks.container, '[data-badges-of]')).toHaveLength(withBadges.length);
    cleanup();
    const over = draw(overview, { lod: 2 });
    expect(all(over.container, '[data-count-of]')).toHaveLength(bundles.length);
    cleanup();
    const expanded = draw(scene, { lod: 2 });
    expect(all(expanded.container, '[data-arrow-text-of]')).toHaveLength(withArrowText.filter((e) => e.minLod <= 2).length);
    expect(all(expanded.container, 'image')).toHaveLength(0);
  });

  it('LOD 3 draws every node and edge', () => {
    const { container } = draw(scene, { lod: 3 });
    expect(all(container, '[data-node-id]')).toHaveLength(visible(scene, 3).nodes);
    expect(all(container, '[data-edge-id]')).toHaveLength(visible(scene, 3).edges);
  });

  it('draws one badge per flag with a different shape per kind, each with a title', () => {
    const flagged = sceneOf([node('cls_a', { flags: ['has_caveat', 'has_mechanism', 'review_required', 'has_warning', 'has_error', 'outside_scope'], hidden: { outgoing: 5, incoming: 4 } })]);
    const { container } = draw(flagged, { lod: 2 });
    const badges = all(container, '[data-badge-kind]');
    expect(badges.map((b) => b.getAttribute('data-badge-kind'))).toEqual(['caveat', 'mechanism', 'review', 'warning', 'error', 'outside_scope', 'hidden_neighbours']);
    expect(new Set(badges.map((b) => b.getAttribute('data-shape'))).size).toBeGreaterThanOrEqual(5);
    for (const b of badges) expect(b.querySelector('title')?.textContent).toBeTruthy();
    expect(badges[6]?.textContent).toContain('9');
  });
});
