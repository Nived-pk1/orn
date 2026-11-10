/**
 * The free areas of the map (step 8.4e, A3; a lazy chunk): measures the floating controls (`data-map-control`) inside the map area and tells
 * the canvas how much room each side needs, so Fit keeps the boxes out from under them. Nothing here knows what a control is for: a wide
 * control (a bar, the hint pill) takes the top or the bottom by where its middle is; a tall one (the zoom or phone stack) the left or right.
 * Measured, not constants: the real rectangles, again whenever a control appears, goes, or changes size. Draws nothing.
 */
import { useEffect } from "react";
import type { Insets } from "@/render/viewport";
import { insetsOf, type Box } from "./free-areas-rule";

const READ = "[data-map-control]";

/** `contentWidth` / `contentHeight`: the size (map units) of what Fit shows when the map fits it whole (the desktop): each corner control then takes the edge that costs the fit least. */
export function FreeAreas(props: {
  readonly area: HTMLElement | null;
  readonly onInsets: (insets: Insets) => void;
  readonly contentWidth?: number;
  readonly contentHeight?: number;
}) {
  const { area, onInsets, contentWidth, contentHeight } = props;
  useEffect(() => {
    if (area === null) return undefined;
    let frame = 0;
    const measure = (): void => {
      frame = 0;
      const box = area.getBoundingClientRect();
      const controls: Box[] = [...area.querySelectorAll<HTMLElement>(READ)].map(
        (el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x - box.x, y: r.y - box.y, w: r.width, h: r.height };
        },
      );
      onInsets(insetsOf(controls, { width: box.width, height: box.height }, contentWidth === undefined || contentHeight === undefined ? undefined : { width: contentWidth, height: contentHeight }));
    };
    const soon = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(soon);
    const watch = (): void => {
      resize?.disconnect();
      resize?.observe(area);
      area.querySelectorAll(READ).forEach((el) => resize?.observe(el));
      soon();
    };
    const mutation = new MutationObserver(watch);
    mutation.observe(area, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-map-control", "hidden", "data-shown"],
    });
    watch();
    return () => {
      window.cancelAnimationFrame(frame);
      resize?.disconnect();
      mutation.disconnect();
    };
  }, [area, onInsets, contentWidth, contentHeight]);
  return null;
}
