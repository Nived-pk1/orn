/**
 * The free areas of the map (step 8.4e, A3; a lazy chunk): measures the floating controls (`data-map-control`) inside the map area and tells
 * the canvas how much room each side needs, so Fit keeps the boxes out from under them. Nothing here knows what a control is for: a wide
 * control (a bar, the hint pill) takes the top or the bottom by where its middle is; a tall one (the zoom or phone stack) the left or right.
 * Measured, not constants: the real rectangles, again whenever a control appears, goes, or changes size. Draws nothing.
 */
import { useEffect, useMemo } from "react";
import { BOXES, type Scene } from "@/render/scene";
import type { Insets, Rect } from "@/render/viewport";
import { boxesRect } from "./map-geometry";
import { phoneFitBox } from "./phone-fit";
import { insetsOf, type Box } from "./free-areas-rule";

const READ = "[data-map-control]";

/** `content`: the rectangle (map units) of what Fit shows when the map fits it whole (the desktop): each corner control then takes the edge that costs the fit least. */
export function FreeAreas(props: {
  readonly area: HTMLElement | null;
  readonly onInsets: (insets: Insets) => void;
  readonly content?: Rect;
  /** The drawing: its smallest family title (map units) is published as `--map-title-u` for the touch marks (step 8.4e, C2). */
  readonly scene?: Scene | null;
  /** The phone (step 8.4e, C4): receives the world window Fit and the first view show; absent on the desktop. */
  readonly onPhoneBox?: (box: Rect) => void;
  /** The selected box's id: the phone's view is centred on it. */
  readonly selectedId?: string | undefined;
}) {
  const { area, onInsets, content: shown, scene, onPhoneBox, selectedId } = props;
  const contentWidth = shown === undefined ? undefined : shown.x1 - shown.x0;
  const contentHeight = shown === undefined ? undefined : shown.y1 - shown.y0;
  const titleUnits = useMemo(() => Math.min(BOXES.hub.label.size, ...(scene?.nodes ?? []).filter((node) => node.box === "hub").map((node) => BOXES.hub.label.size * (node.scale ?? 1))), [scene]);
  useEffect(() => area?.style.setProperty("--map-title-u", String(titleUnits)) as undefined, [area, titleUnits]);
  useEffect(() => {
    if (area === null) return undefined;
    let frame = 0;
    const measure = (): void => {
      frame = 0;
      const box = area.getBoundingClientRect();
      // a toast on a desktop screen lifts the bottom controls above it (map-float.module.css); Fit measures them where they rest, or it would shrink for every toast
      const lift = area.closest('[data-layout="desktop"][data-toast]') === null ? 0 : (Number.parseFloat(getComputedStyle(area).getPropertyValue("--toast-height")) || 0) + 8;
      const controls: Box[] = [...area.querySelectorAll<HTMLElement>(READ)].map(
        (el) => {
          const r = el.getBoundingClientRect();
          const low = r.y - box.y + r.height / 2 > box.height / 2;
          return { x: r.x - box.x, y: r.y - box.y + (low ? lift : 0), w: r.width, h: r.height };
        },
      );
      const size = { width: box.width, height: box.height };
      const insets = insetsOf(controls, size, contentWidth === undefined || contentHeight === undefined ? undefined : { width: contentWidth, height: contentHeight });
      onInsets(insets);
      const nodes = scene?.nodes ?? [];
      const own = nodes.find((node) => node.id === selectedId);
      const content = boxesRect(nodes);
      if (onPhoneBox !== undefined && content !== undefined) onPhoneBox(phoneFitBox({ content, size, insets, titleUnits, selected: own === undefined ? undefined : boxesRect([own]) }));
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
  }, [area, onInsets, contentWidth, contentHeight, scene, onPhoneBox, selectedId, titleUnits]);
  return null;
}
