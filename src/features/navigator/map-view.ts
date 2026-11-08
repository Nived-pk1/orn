/**
 * The map's view (step 8.2a, ADR-044): which arrows of the Scene are DRAWN, how, and which boxes fade. The Scene is the whole drawing, computed
 * once by the pipeline; this is a derived, pure view over it (never stored, never fed back to the layout). Rules:
 *  - nothing focused and no chapter chosen: boxes only, no arrow (the quiet map);
 *  - a focused family (selected, or hovered for 150 ms): only the arrows that leave it ("makes": solid, in its group colour) and enter it
 *    ("made from": dashed, ink); a two-way pair is two parallel lines, one per direction (step 8.4c, C);
 *  - a chapter and no focus: every arrow of the chapter, a two-way pair as two lines, both solid and dark;
 *  - a self-loop is never drawn: the box carries "n within the family" instead;
 *  - Unclassified is hidden unless shown; the reactions that lead there are counted for the legend;
 *  - a busy chapter (more than BUSY_CHAPTER_ARROWS arrows) draws none until a family is chosen (`busy` says how many);
 *  - a chain ("From A to B") draws only the chain's arrows, heavy and solid in the first family's colour, numbered at their chips;
 *  - an arrow of ONE reaction shows that reaction's reagent words on its chip (`facts`), unless the chip would overlap another;
 *  - the selected arrow stays drawn. Boxes that are not the focus, not at an end of a drawn arrow (in a chapter also: with no reaction inside)
 *    fade (they stay clickable).
 */
import type { MapMarks } from '@/render/svg';
import type { Scene, SceneEdge, SceneNode } from '@/render/scene';
import type { withChips, Drawn, PairFacts } from './map-chips';
import { BUSY_ARROWS, isBusy } from './busy-rule';
import { pairSeparationMap, strokePx } from '@/render/svg';
import { pointAlong, shifted, sideOffset, snapEnds } from './map-geometry';

/** A chapter with more arrows than this (after pair merging) draws none until a family is chosen (step 8.2b, B2). */
export const BUSY_CHAPTER_ARROWS = BUSY_ARROWS;

export interface MapViewOptions {
  /** The focused family (a node id), or null. */
  readonly focusId: string | null;
  /** A chapter is chosen: all of its arrows are drawn. */
  readonly chapter: boolean;
  readonly showUnclassified: boolean;
  /** The selected arrow, which stays drawn. */
  readonly selectedEdgeId?: string | undefined;
  /** "From A to B": the steps of the chosen chain, in order; only these arrows are drawn. */
  readonly chain?: readonly { readonly from: string; readonly to: string }[] | undefined;
  /** What one family-to-family arrow carries (distinct reactions, and the reagent words when it is one). Absent: no words on chips. */
  readonly facts?: ((from: string, to: string) => PairFacts | undefined) | undefined;
  /** The function that adds the chip marks (words, step numbers). It is its own chunk and arrives just after the first paint: until then the arrows keep their plain count chips. */
  readonly chips?: typeof withChips | undefined;
  /** The map's zoom (screen px per map unit): chips are placed in screen pixels at it (step 8.4b, A). Default 1. */
  readonly zoom?: number | undefined;
}

export type { PairFacts } from './map-chips';

export interface MapView {
  /** What is drawn: the Scene's boxes (without a hidden Unclassified) and only the arrows in view. */
  readonly scene: Scene;
  /** What the keyboard and the menu move through: the visible boxes (a hidden Unclassified is not one) and every arrow between them, drawn or not. */
  readonly navigation: Scene;
  readonly marks: MapMarks;
  /** Nothing focused, no chapter, no selected arrow: the quiet map (the line "Tap or click a family ..." shows). */
  readonly quiet: boolean;
  /** A busy chapter: how many arrows it has (nothing is drawn until a family is chosen); 0 when it is not busy. */
  readonly busy: number;
  /** Step 8.4b, C: the busy view is a selected family (or the bucket), not a chapter: its arrows are listed in the panel. */
  readonly busySelection: boolean;
  /** `present`: the Scene has an Unclassified box; `reactions`: how many reactions lead there (counted from the arrows, shown or not). */
  readonly unclassified: { readonly present: boolean; readonly shown: boolean; readonly reactions: number };
}

const countOf = (edge: SceneEdge): number => edge.bundleSize ?? 1;
const within = (n: number): string => `${n} ${n === 1 ? 'reaction' : 'reactions'} within the family`;

function roleOf(edge: SceneEdge, focus: string | null, nodes: ReadonlyMap<string, SceneNode>): Drawn {
  if (focus !== null && edge.to === focus && edge.from !== focus) return { edge: { ...edge, stroke: 'dashed' }, mark: { role: 'madeFrom' } };
  // the bucket has no family colour: what leaves it stays in neutral ink (step 8.2b-fix, S4)
  const source = nodes.get(edge.from);
  const tone = source?.box === 'unclassified' ? undefined : source?.tone;
  return { edge, mark: { role: 'makes', ...(tone === undefined ? {} : { tone }) } };
}

/**
 * A two-way pair is TWO lines, one per direction (step 8.4c, C; ADR-044 addendum). They are drawn parallel, the stroke EDGES `pairGapPx(zoom)` apart
 * on the screen (8 to 16 px, growing with the zoom), each on the side the layout put it. Each is marked `paired`; with no family focused both are ink
 * (no colour: neither is "made" by a chosen family). Everything else about the lines (style, chip, head, hit) is the arrow's own.
 */
function pairUp(drawn: readonly Drawn[], zoom: number, focused: boolean, nodes: ReadonlyMap<string, SceneNode>): Drawn[] {
  const byKey = new Map(drawn.map((d) => [`${d.edge.from}>${d.edge.to}`, d]));
  return drawn.map((d) => {
    const back = byKey.get(`${d.edge.to}>${d.edge.from}`);
    if (back === undefined || d.edge.from === d.edge.to) return d;
    const { tone: _tone, ...plain } = d.mark;
    const separation = pairSeparationMap(zoom, (strokePx(d.edge.weight, zoom) + strokePx(back.edge.weight, zoom)) / 2); // the edges, not the centres, are the gap apart
    const mark = { ...(focused ? d.mark : plain), paired: true as const };
    // the signed distance of the other line's middle from this one, along this line's own normal: its side stays, its size becomes `separation`
    const normal = sideOffset(d.edge.points, 1);
    const from = pointAlong(d.edge.points, 0.5);
    const to = pointAlong(back.edge.points, 0.5);
    const signed = (to.x - from.x) * normal.x + (to.y - from.y) * normal.y;
    const wanted = signed < 0 ? -separation : separation;
    const by = sideOffset(d.edge.points, -(wanted - signed) / 2);
    const moved = shifted(d.edge.points, by);
    const fromBox = nodes.get(d.edge.from);
    const toBox = nodes.get(d.edge.to);
    const points = fromBox === undefined || toBox === undefined ? moved : snapEnds(moved, fromBox, toBox); // the ends stay on the borders of their boxes
    return { mark, edge: { ...d.edge, points, labelAt: { x: d.edge.labelAt.x + by.x, y: d.edge.labelAt.y + by.y } } };
  });
}

export function mapView(scene: Scene, options: MapViewOptions): MapView {
  const unclassifiedIds = new Set(scene.nodes.filter((node) => node.box === 'unclassified').map((node) => node.id));
  const present = unclassifiedIds.size > 0;
  const hide = present && !options.showUnclassified;
  const leading = scene.edges.filter((edge) => unclassifiedIds.has(edge.to) && edge.from !== edge.to).reduce((sum, edge) => sum + countOf(edge), 0);
  const visibleNodes = scene.nodes.filter((node) => !(hide && unclassifiedIds.has(node.id)));
  const nodes = new Map(visibleNodes.map((node) => [node.id, node]));
  const focus = options.focusId !== null && nodes.has(options.focusId) ? options.focusId : null;
  const usable = scene.edges.filter((edge) => edge.from !== edge.to && nodes.has(edge.from) && nodes.has(edge.to));

  const chain = options.chain !== undefined && options.chain.length > 0 ? options.chain : undefined;
  const chainTone = chain === undefined ? undefined : nodes.get((chain[0] as { from: string }).from)?.tone;
  const chainEdges = chain === undefined ? [] : chain.flatMap((step) => usable.find((edge) => edge.from === step.from && edge.to === step.to) ?? []);
  const chosen = chain !== undefined ? chainEdges : focus !== null ? usable.filter((edge) => edge.from === focus || edge.to === focus) : options.chapter ? usable : [];
  const selected = options.selectedEdgeId === undefined || chosen.some((edge) => edge.id === options.selectedEdgeId) ? undefined : usable.find((edge) => edge.id === options.selectedEdgeId);
  const base = [...chosen, ...(selected === undefined ? [] : [selected])].map((edge) => roleOf(edge, chain === undefined ? focus : null, nodes));
  const asChain = (d: Drawn): Drawn => ({ edge: { ...d.edge, weight: 'heavy', stroke: 'solid' }, mark: { role: 'makes', ...(chainTone === undefined ? {} : { tone: chainTone }) } });
  const drawn = chain !== undefined ? base.map(asChain) : focus !== null || options.chapter ? pairUp(base, options.zoom ?? 1, focus !== null, nodes) : base;
  // a busy chapter draws nothing until a family is chosen (its families stay at full strength); the selected arrow stays
  const busy = chain === undefined && (focus !== null || options.chapter) && isBusy(drawn.length) ? drawn.length : 0;
  const drawable = busy > 0 ? drawn.filter((d) => d.edge.id === options.selectedEdgeId) : drawn;
  const shown = options.chips === undefined ? drawable : options.chips(drawable, options.facts, chain !== undefined, visibleNodes, options.zoom);

  const ends = new Set<string>();
  for (const d of drawn) {
    ends.add(d.edge.from);
    ends.add(d.edge.to);
  }
  const fading = focus !== null || options.chapter || chain !== undefined;
  const full = new Set(ends);
  if (focus !== null) full.add(focus);
  else if (options.chapter && chain === undefined) for (const node of visibleNodes) if ((node.reactionCounts?.loops ?? 0) > 0) full.add(node.id);
  const faded = new Set(fading ? visibleNodes.filter((node) => !full.has(node.id)).map((node) => node.id) : []);

  const captions = new Map<string, string>();
  const captionNames = new Map<string, string>();
  const described = visibleNodes.map((node) => {
    const loops = node.reactionCounts?.loops ?? 0;
    if (loops <= 0 || node.box === 'unclassified') return node;
    captions.set(node.id, `↻ ${loops}`);
    captionNames.set(node.id, within(loops));
    return { ...node, ariaLabel: `${node.ariaLabel}, ${within(loops)}` };
  });

  return {
    scene: { ...scene, nodes: described, edges: shown.map((d) => d.edge) },
    navigation: { ...scene, nodes: visibleNodes, edges: scene.edges.filter((edge) => nodes.has(edge.from) && nodes.has(edge.to)) },
    marks: { edges: new Map(shown.map((d) => [d.edge.id, d.mark])), faded, captions, captionNames, ...(busy > 0 && focus !== null ? { outlined: new Map([...ends].filter((id) => id !== focus).map((id) => [id, nodes.get(id)?.tone])) } : {}) },
    quiet: focus === null && !options.chapter && chain === undefined && shown.length === 0,
    busy,
    busySelection: busy > 0 && focus !== null,
    unclassified: { present, shown: present && options.showUnclassified, reactions: leading },
  };
}
