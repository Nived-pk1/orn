/**
 * The map's view (step 8.2a, ADR-044): which arrows of the Scene are DRAWN, how, and which boxes fade. The Scene is the whole drawing, computed
 * once by the pipeline; this is a derived, pure view over it (never stored, never fed back to the layout). Rules:
 *  - nothing focused and no chapter chosen: boxes only, no arrow (the quiet map);
 *  - a focused family (selected, or hovered for 150 ms): only the arrows that leave it ("makes": solid, in its group colour) and enter it
 *    ("made from": dashed, ink), the two lines of a two-way pair kept at least PAIR_GAP px apart;
 *  - a chapter and no focus: every arrow of the chapter, a two-way pair as ONE line with a head and a count chip at each end;
 *  - a self-loop is never drawn: the box carries "n within the family" instead;
 *  - Unclassified is hidden unless shown; the reactions that lead there are counted for the legend;
 *  - the selected arrow stays drawn. Boxes that are not the focus, not at an end of a drawn arrow (in a chapter also: with no reaction inside)
 *    fade (they stay clickable).
 */
import type { MapMarks, EdgeMark } from '@/render/svg';
import type { Scene, SceneEdge, SceneNode } from '@/render/scene';
import { distance, pointAlong, reactionsWord, shifted, sideOffset } from './map-geometry';

/** The least distance between the two lines of a pair in a family focus (px). */
export const PAIR_GAP = 6;
/** Where along a merged pair the count chips sit: near their own heads. */
const NEAR_HEAD = 0.78;

export interface MapViewOptions {
  /** The focused family (a node id), or null. */
  readonly focusId: string | null;
  /** A chapter is chosen: all of its arrows are drawn. */
  readonly chapter: boolean;
  readonly showUnclassified: boolean;
  /** The selected arrow, which stays drawn. */
  readonly selectedEdgeId?: string | undefined;
}

export interface MapView {
  /** What is drawn: the Scene's boxes (without a hidden Unclassified) and only the arrows in view. */
  readonly scene: Scene;
  /** What the keyboard and the menu move through: the visible boxes (a hidden Unclassified is not one) and every arrow between them, drawn or not. */
  readonly navigation: Scene;
  readonly marks: MapMarks;
  /** Nothing focused, no chapter, no selected arrow: the quiet map (the line "Tap or click a family ..." shows). */
  readonly quiet: boolean;
  /** `present`: the Scene has an Unclassified box; `reactions`: how many reactions lead there (counted from the arrows, shown or not). */
  readonly unclassified: { readonly present: boolean; readonly shown: boolean; readonly reactions: number };
}

const countOf = (edge: SceneEdge): number => edge.bundleSize ?? 1;
const nameOf = (node: SceneNode | undefined, fallback: string): string => (node === undefined ? fallback : node.label.map((run) => run.text).join('') || fallback);
const within = (n: number): string => `${n} within the family`;

interface Drawn {
  readonly edge: SceneEdge;
  readonly mark: EdgeMark;
}

function roleOf(edge: SceneEdge, focus: string | null, nodes: ReadonlyMap<string, SceneNode>): Drawn {
  if (focus !== null && edge.to === focus && edge.from !== focus) return { edge: { ...edge, stroke: 'dashed' }, mark: { role: 'madeFrom' } };
  const tone = nodes.get(edge.from)?.tone;
  return { edge, mark: { role: 'makes', ...(tone === undefined ? {} : { tone }) } };
}

/** Two arrows between the same two boxes, one each way: one line, a head at each end, the other direction's chip near the start. */
function mergePairs(drawn: readonly Drawn[], nodes: ReadonlyMap<string, SceneNode>): Drawn[] {
  const byKey = new Map(drawn.map((d) => [`${d.edge.from}>${d.edge.to}`, d]));
  const done = new Set<string>();
  const out: Drawn[] = [];
  for (const d of [...drawn].sort((a, b) => (a.edge.id < b.edge.id ? -1 : a.edge.id > b.edge.id ? 1 : 0))) {
    const key = `${d.edge.from}>${d.edge.to}`;
    if (done.has(key)) continue;
    const back = byKey.get(`${d.edge.to}>${d.edge.from}`);
    done.add(key);
    if (back === undefined) {
      out.push(d);
      continue;
    }
    done.add(`${back.edge.from}>${back.edge.to}`);
    const e = d.edge;
    const fromName = nameOf(nodes.get(e.from), e.from);
    const toName = nameOf(nodes.get(e.to), e.to);
    const tone = nodes.get(e.from)?.tone;
    const merged: SceneEdge = {
      ...e,
      labelAt: pointAlong(e.points, NEAR_HEAD),
      bundleSize: countOf(e),
      ariaLabel: `${fromName} to ${toName}: ${reactionsWord(countOf(e))}; ${toName} to ${fromName}: ${reactionsWord(countOf(back.edge))}`,
    };
    out.push({ edge: merged, mark: { role: 'pair', startHead: true, extraChip: { at: pointAlong(e.points, 1 - NEAR_HEAD), size: countOf(back.edge) }, ...(tone === undefined ? {} : { tone }) } });
  }
  return out;
}

/** In a family focus, the two lines of a pair that run on top of each other are moved PAIR_GAP / 2 apart each (arcs that already bow apart stay). */
function separatePairs(drawn: readonly Drawn[]): Drawn[] {
  const byKey = new Map(drawn.map((d) => [`${d.edge.from}>${d.edge.to}`, d]));
  return drawn.map((d) => {
    const back = byKey.get(`${d.edge.to}>${d.edge.from}`);
    if (back === undefined) return d;
    if (distance(pointAlong(d.edge.points, 0.5), pointAlong(back.edge.points, 0.5)) >= PAIR_GAP) return d;
    const by = sideOffset(d.edge.points, PAIR_GAP / 2);
    return { mark: d.mark, edge: { ...d.edge, points: shifted(d.edge.points, by), labelAt: { x: d.edge.labelAt.x + by.x, y: d.edge.labelAt.y + by.y } } };
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

  const chosen = focus !== null ? usable.filter((edge) => edge.from === focus || edge.to === focus) : options.chapter ? usable : [];
  const selected = options.selectedEdgeId === undefined || chosen.some((edge) => edge.id === options.selectedEdgeId) ? undefined : usable.find((edge) => edge.id === options.selectedEdgeId);
  const base = [...chosen, ...(selected === undefined ? [] : [selected])].map((edge) => roleOf(edge, focus, nodes));
  const drawn = focus !== null ? separatePairs(base) : options.chapter ? mergePairs(base, nodes) : base;

  const ends = new Set<string>();
  for (const d of drawn) {
    ends.add(d.edge.from);
    ends.add(d.edge.to);
  }
  const fading = focus !== null || options.chapter;
  const full = new Set(ends);
  if (focus !== null) full.add(focus);
  else if (options.chapter) for (const node of visibleNodes) if ((node.reactionCounts?.loops ?? 0) > 0) full.add(node.id);
  const faded = new Set(fading ? visibleNodes.filter((node) => !full.has(node.id)).map((node) => node.id) : []);

  const captions = new Map<string, string>();
  const described = visibleNodes.map((node) => {
    const loops = node.reactionCounts?.loops ?? 0;
    if (loops <= 0 || node.box === 'unclassified') return node;
    captions.set(node.id, within(loops));
    return { ...node, ariaLabel: `${node.ariaLabel}, ${within(loops)}` };
  });

  return {
    scene: { ...scene, nodes: described, edges: drawn.map((d) => d.edge) },
    navigation: { ...scene, nodes: visibleNodes, edges: scene.edges.filter((edge) => nodes.has(edge.from) && nodes.has(edge.to)) },
    marks: { edges: new Map(drawn.map((d) => [d.edge.id, d.mark])), faded, captions },
    quiet: focus === null && !options.chapter && drawn.length === 0,
    unclassified: { present, shown: present && options.showUnclassified, reactions: leading },
  };
}
