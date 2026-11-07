/**
 * "Zoom to selection" (step 8.4b, E2b): fits the map to the focus set of what is selected (the selected family and the far ends of its drawn
 * arrows; an arrow's two families; the families of the chosen chain; the outlined families of a busy selection), 24 px margin, 200 ms (at once
 * with reduced motion). A command, never automatic: an automatic zoom on every click moved the map under the pointer and hid other families.
 */
import { useCallback, useMemo } from 'react';
import { BOXES, type Scene } from '@/render/scene';
import { fitBox, type ViewportController } from '@/render/viewport';
import { focusSetOf, zoomTargetRect } from './focus-fit';
import { animateView } from './zoom-to';

const MIN_TITLE_PX = 12;

export interface ZoomSelectionArgs {
  readonly controller: ViewportController | null;
  readonly svg: SVGSVGElement | null;
  readonly drawn: Scene | null;
  readonly selected: { readonly kind: 'node' | 'edge'; readonly id: string } | null;
  readonly chain: readonly { readonly from: string; readonly to: string }[] | undefined;
  readonly outlined: readonly string[];
}

export function useZoomToSelection(args: ZoomSelectionArgs): { readonly zoom: () => void; readonly available: boolean } {
  const { controller, svg, drawn, selected, chain, outlined } = args;
  const rects = useMemo(() => {
    if (drawn === null) return undefined;
    const edge = selected !== null && selected.kind === 'edge' ? drawn.edges.find((one) => one.id === selected.id) : undefined;
    const ids = chain !== undefined ? chain.flatMap((step) => [step.from, step.to]) : selected === null ? [] : selected.kind === 'node' ? [selected.id] : edge === undefined ? [] : [edge.from, edge.to];
    const focus = focusSetOf(drawn.nodes, { ids, arrows: drawn.edges.filter((one) => ids.includes(one.from) || ids.includes(one.to)), outlined });
    const own = selected !== null && selected.kind === 'node' ? focusSetOf(drawn.nodes, { ids: [selected.id], arrows: [], outlined: [] }) : undefined;
    const hub = drawn.nodes.find((node) => node.box === 'hub');
    return { focus, own, titleSize: hub === undefined ? 14 : BOXES.hub.label.size * (hub.scale ?? 1) };
  }, [drawn, selected, chain, outlined]);
  const zoom = useCallback((): void => {
    const area = svg?.getBoundingClientRect();
    if (controller === null || area === undefined || rects === undefined) return;
    const size = { width: area.width, height: area.height };
    const rect = zoomTargetRect({ focus: rects.focus, size, titleSize: rects.titleSize, minTitlePx: MIN_TITLE_PX, selected: rects.own });
    if (rect === undefined) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    animateView(controller, fitBox(rect, size), { reduced, raf: (run) => window.requestAnimationFrame(run), now: () => performance.now() });
  }, [controller, svg, rects]);
  return { zoom, available: rects?.focus !== undefined };
}
