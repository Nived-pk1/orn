/**
 * The d3-zoom binding (step 5.4b): gestures (wheel, drag, pinch) on the root `<svg>` become viewports for the controller; d3 never
 * writes the DOM transform (the controller does, once per frame). d3-zoom styles its element inline (touch-action and a tap
 * highlight); that attribute is removed so the page's CSP can stay strict, and the stylesheet supplies `touch-action: none`.
 * Double-click zoom is off (a double click selects or opens; it must not move the view).
 */
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import type { ZoomBehavior } from 'd3-zoom';
import type { Viewport } from './contracts';
import { SCALE_MAX, SCALE_MIN } from './contracts';

export interface ZoomBinding {
  /** Makes d3's own state match a viewport set by a command (no event is emitted). */
  readonly adopt: (view: Viewport) => void;
  readonly destroy: () => void;
}

export function bindZoom(element: SVGSVGElement, onGesture: (view: Viewport) => void, minScale: number = SCALE_MIN): ZoomBinding {
  let adopting = false;
  const selection = select<SVGSVGElement, unknown>(element);
  const behaviour: ZoomBehavior<SVGSVGElement, unknown> = zoom<SVGSVGElement, unknown>()
    // The visible extent is the element's laid-out box (d3's default reads the width/height attributes, which this drawing does not set).
    .extent(() => {
      const box = element.getBoundingClientRect();
      return [[0, 0], [box.width, box.height]];
    })
    .scaleExtent([minScale, SCALE_MAX])
    .on('zoom', (event: { readonly transform: { readonly x: number; readonly y: number; readonly k: number } }) => {
      if (!adopting) onGesture({ x: event.transform.x, y: event.transform.y, scale: event.transform.k });
    });
  selection.call(behaviour).on('dblclick.zoom', null);
  element.removeAttribute('style');
  return {
    adopt(view) {
      adopting = true;
      try {
        behaviour.transform(selection, zoomIdentity.translate(view.x, view.y).scale(view.scale));
      } finally {
        adopting = false;
      }
    },
    destroy() {
      selection.on('.zoom', null);
    },
  };
}
