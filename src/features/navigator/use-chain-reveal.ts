/**
 * On a phone the "From A to B" sheet covers the bottom of the map: when a chain is chosen the drawing moves (a pan at the same scale, a zoom out only
 * when the chain does not fit) so the chain's boxes sit in the part above the sheet (step 8.2b-fix, E2). The geometry is `viewportAboveSheet`.
 */
import { useEffect, type RefObject } from 'react';
import type { Scene } from '@/render/scene';
import type { ViewportController } from '@/render/viewport';
import { viewportAboveSheet } from './reveal';

export function useChainReveal(args: {
  readonly phone: boolean;
  readonly chain: readonly { readonly from: string; readonly to: string }[] | undefined;
  readonly svg: SVGSVGElement | null;
  readonly root: RefObject<HTMLElement | null>;
  readonly scene: Scene | null;
  readonly controller: ViewportController | null;
}): void {
  const { phone, chain, svg, root, scene, controller } = args;
  useEffect(() => {
    if (!phone || chain === undefined || chain.length === 0 || svg === null || scene === null || controller === null) return;
    const ids = new Set(chain.flatMap((step) => [step.from, step.to]));
    const boxes = scene.nodes.filter((node) => ids.has(node.id));
    const area = svg.getBoundingClientRect();
    const sheet = root.current?.querySelector('[aria-label="From A to B"]')?.getBoundingClientRect().height ?? 0;
    const moved = viewportAboveSheet(controller.current(), { width: area.width, height: area.height }, sheet, boxes);
    if (moved !== undefined) controller.setViewport(moved);
    // only a different chain moves the drawing: not every redraw of the same one
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the chain's identity is its steps
  }, [phone, chain, svg, controller]);
}
