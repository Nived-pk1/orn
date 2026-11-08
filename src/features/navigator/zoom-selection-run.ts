/**
 * The work of "Zoom to selection" (step 8.4b, E2b), loaded on the first click (8.4b size round: nothing here runs before a click, so it
 * stays out of the initial chunk): fits the map to the focus set of what is selected (the selected family and the far ends of its drawn
 * arrows; an arrow's two families; the families of the chosen chain; the outlined families of a busy selection), 24 px margin, 200 ms (at once
 * with reduced motion). A command, never automatic: an automatic zoom on every click moved the map under the pointer and hid other families.
 */
import { BOXES, type Scene } from '@/render/scene';
import { fitBox, type ViewportController } from '@/render/viewport';
import { focusSetOf, zoomTargetRect } from './focus-fit';
import { animateView } from './zoom-to';

/** The family ids the selection is about: the chain's families, the selected family, or the two ends of the selected arrow. */
export function selectionIds(drawn: Scene, selected: ZoomSelectionArgs['selected'], chain: ZoomSelectionArgs['chain']): readonly string[] {
  if (chain !== undefined) return chain.flatMap((step) => [step.from, step.to]);
  if (selected === null) return [];
  if (selected.kind === 'node') return [selected.id];
  const edge = drawn.edges.find((one) => one.id === selected.id);
  return edge === undefined ? [] : [edge.from, edge.to];
}

export interface ZoomSelectionArgs {
  readonly controller: ViewportController | null;
  readonly svg: SVGSVGElement | null;
  readonly drawn: Scene | null;
  readonly selected: { readonly kind: 'node' | 'edge'; readonly id: string } | null;
  readonly chain: readonly { readonly from: string; readonly to: string }[] | undefined;
  readonly outlined: readonly string[];
}

const MIN_TITLE_PX = 12;

export function runZoomToSelection(args: ZoomSelectionArgs): void {
  const { controller, svg, drawn, selected, chain, outlined } = args;
  const area = svg?.getBoundingClientRect();
  if (controller === null || area === undefined || drawn === null) return;
  const ids = selectionIds(drawn, selected, chain);
  const focus = focusSetOf(drawn.nodes, { ids, arrows: drawn.edges.filter((one) => ids.includes(one.from) || ids.includes(one.to)), outlined });
  const own = selected !== null && selected.kind === 'node' ? focusSetOf(drawn.nodes, { ids: [selected.id], arrows: [], outlined: [] }) : undefined;
  const hub = drawn.nodes.find((node) => node.box === 'hub');
  const titleSize = hub === undefined ? 14 : BOXES.hub.label.size * (hub.scale ?? 1);
  const size = { width: area.width, height: area.height };
  const rect = zoomTargetRect({ focus, size, titleSize, minTitlePx: MIN_TITLE_PX, selected: own });
  if (rect === undefined) return;
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  animateView(controller, fitBox(rect, size), { reduced, raf: (run) => window.requestAnimationFrame(run), now: () => performance.now() });
}
