/**
 * On a phone the "From A to B" sheet covers the bottom of the map: when a chain is chosen the drawing moves (a pan at the same scale, a zoom out only
 * when the chain does not fit) so the chain's boxes sit in the part above the sheet (step 8.2b-fix, E2). The geometry is `viewportAboveSheet`.
 */
import { useEffect, useState, type RefObject } from 'react';
import type { Scene } from '@/render/scene';
import type { ViewportController } from '@/render/viewport';

export function useChainReveal(args: {
  readonly phone: boolean;
  readonly chain: readonly { readonly from: string; readonly to: string }[] | undefined;
  readonly svg: SVGSVGElement | null;
  readonly root: RefObject<HTMLElement | null>;
  readonly scene: Scene | null;
  readonly controller: ViewportController | null;
}): void {
  const { phone, chain, svg, root, scene, controller } = args;
  // the sheet changes height when a card is chosen or "Show all" opens it: the drawing is placed again for the new height
  const [sheetHeight, setSheetHeight] = useState(0);
  useEffect(() => {
    const sheet = phone && chain !== undefined ? root.current?.querySelector('[aria-label="From A to B"]') : null;
    if (sheet === null || sheet === undefined || typeof ResizeObserver === 'undefined') return;
    const read = (): void => setSheetHeight(Math.round(sheet.getBoundingClientRect().height));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [phone, chain, root]);
  useEffect(() => {
    if (!phone || chain === undefined || chain.length === 0 || svg === null || scene === null || controller === null) return;
    const ids = new Set(chain.flatMap((step) => [step.from, step.to]));
    const boxes = scene.nodes.filter((node) => ids.has(node.id));
    const area = svg.getBoundingClientRect();
    const sheet = root.current?.querySelector('[aria-label="From A to B"]')?.getBoundingClientRect().height ?? 0;
    let live = true;
    void import('./chain-reveal').then(({ viewportAboveSheet }) => {
      const moved = live ? viewportAboveSheet(controller.current(), { width: area.width, height: area.height }, sheet, boxes) : undefined;
      if (moved !== undefined) controller.setViewport(moved);
    });
    return () => {
      live = false;
    };
    // only a different chain moves the drawing: not every redraw of the same one
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the chain's identity is its steps
  }, [phone, chain, svg, controller, sheetHeight]);
}
