/**
 * The free areas of the map (step 8.4e, A3; a lazy chunk): measures the floating controls (`data-map-control`) inside the map area and tells
 * the canvas how much room each side needs, so Fit keeps the boxes out from under them. Nothing here knows what a control is for: a wide
 * control (a bar, the hint pill) takes the top or the bottom by where its middle is; a tall one (the zoom or phone stack) the left or right.
 * Measured, not constants: the real rectangles, again whenever a control appears, goes, or changes size. Draws nothing.
 */
import { useEffect, useMemo, useRef } from "react";
import { BOXES, type Scene } from "@/render/scene";
import { hitRefiner, nearerEdgeAt } from "@/render/svg";
import type { Insets, Rect } from "@/render/viewport";
import { boxesRect } from "./map-geometry";
import { phoneFitBox } from "./phone-fit";
import { CONTROL_GAP, insetsOf, titleUnitsOf, type Box } from "./free-areas-rule";

const READ = "[data-map-control]";
const PANE_HOST = '[data-full-map],[data-layout="phone"]';
const PANE = ":scope > aside:not([hidden])";

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
  const {
    area,
    onInsets,
    content: shown,
    scene,
    onPhoneBox,
    selectedId,
  } = props;
  // a selection ALONE does not move the view (the window is measured again for a resize, a rotation or a control, and then centres on the selection as it is then)
  const selectedNow = useRef(selectedId);
  selectedNow.current = selectedId;
  const contentWidth = shown === undefined ? undefined : shown.x1 - shown.x0;
  const contentHeight = shown === undefined ? undefined : shown.y1 - shown.y0;
  // the smallest family title as DRAWN (a box drawn bigger carries its text with it); the nominal size only when no family is drawn
  const titleUnits = useMemo(
    () => titleUnitsOf(scene?.nodes ?? [], BOXES.hub.label.size),
    [scene],
  );
  useEffect(
    () =>
      area?.style.setProperty("--map-title-u", String(titleUnits)) as undefined,
    [area, titleUnits],
  );
  // the nearer line of a two-way pair gets the click (step 8.4e, C1); until this chunk is loaded a click goes to the line drawn last
  useEffect(() => {
    hitRefiner.current = nearerEdgeAt;
    return () => {
      hitRefiner.current = undefined;
    };
  }, []);
  useEffect(() => {
    if (area === null) return undefined;
    let frame = 0;
    const measure = (): void => {
      frame = 0;
      const box = area.getBoundingClientRect();
      // a toast on a desktop screen lifts the bottom controls above it (map-float.module.css); Fit measures them where they rest, or it would shrink for every toast
      const lift =
        area.closest('[data-layout="desktop"][data-toast]') === null
          ? 0
          : (Number.parseFloat(
              getComputedStyle(area).getPropertyValue("--toast-height"),
            ) || 0) + 8;
      const controls: Box[] = [...area.querySelectorAll<HTMLElement>(READ)].map(
        (el) => {
          const r = el.getBoundingClientRect();
          const low = r.y - box.y + r.height / 2 > box.height / 2;
          return {
            x: r.x - box.x,
            y: r.y - box.y + (low ? lift : 0),
            w: r.width,
            h: r.height,
          };
        },
      );
      // full map: the pane lies OVER the map's right edge (step 8.4e, D2); Fit keeps the boxes out from under it like it does for a control
      const pane = area.closest(PANE_HOST)?.querySelector<HTMLElement>(PANE);
      if (pane !== null && pane !== undefined) {
        const r = pane.getBoundingClientRect();
        const x0 = Math.max(r.x, box.x);
        const x1 = Math.min(r.right, box.right);
        // outside full map only a side panel counts (phone landscape, step 8.4e E4): a bottom sheet is as wide as the map
        if (
          x1 > x0 &&
          (area.closest("[data-full-map]") !== null ||
            r.width < box.width * 0.9)
        )
          controls.push({ x: x0 - box.x, y: 0, w: x1 - x0, h: box.height }); // only the part that lies over the map
      }
      const size = { width: box.width, height: box.height };
      const insets = insetsOf(
        controls,
        size,
        contentWidth === undefined || contentHeight === undefined
          ? undefined
          : { width: contentWidth, height: contentHeight },
      );
      onInsets(insets);
      // the controls every box must stay clear of on the phone (A3): the stack of buttons at the side and the hint pill, where they are in the map area, with their gap
      const avoid = [...area.querySelectorAll<HTMLElement>('[data-map-control="stack"], [data-map-control="pill"]')]
        .filter((el) => getComputedStyle(el).visibility !== "hidden") // a hint pill with nothing to say covers nothing
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0)
        .map((r) => ({ x0: r.x - box.x - CONTROL_GAP, y0: r.y - box.y - CONTROL_GAP, x1: r.right - box.x + CONTROL_GAP, y1: r.bottom - box.y + CONTROL_GAP }));
      const nodes = scene?.nodes ?? [];
      const own = nodes.find((node) => node.id === selectedNow.current);
      const content = boxesRect(nodes);
      if (onPhoneBox !== undefined && content !== undefined)
        onPhoneBox(
          phoneFitBox({
            content,
            size,
            insets,
            titleUnits,
            selected: own === undefined ? undefined : boxesRect([own]),
            ...(avoid.length === 0 ? {} : { avoid, boxes: nodes.map((node) => ({ x0: node.x, y0: node.y, x1: node.x + node.width, y1: node.y + node.height })) }),
          }),
        );
    };
    const soon = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };
    const resize =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(soon);
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
    // the pane opening or closing, and full map itself, change the free areas too (they live outside the map area)
    const shell = area.closest("[data-layout]");
    if (shell !== null)
      mutation.observe(shell, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-full-map", "hidden"],
      });
    watch();
    return () => {
      window.cancelAnimationFrame(frame);
      resize?.disconnect();
      mutation.disconnect();
    };
  }, [
    area,
    onInsets,
    contentWidth,
    contentHeight,
    scene,
    onPhoneBox,
    titleUnits,
  ]);
  return null;
}
