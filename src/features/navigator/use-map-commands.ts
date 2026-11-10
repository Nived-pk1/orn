import { useEffect } from "react";
import type { ViewportController } from "@/render/viewport";
import type { NavigatorPorts } from "./contracts";

/** The palette's commands (step 5.8) run on the map while it is mounted; each says why it cannot run. Moved from navigator-canvas.tsx (step 8.4e). */
export function useMapCommands(args: {
  readonly ports: NavigatorPorts;
  readonly controller: ViewportController | null;
  readonly unanchoredReason: string | undefined;
  readonly listing: boolean;
  readonly noScene: boolean;
  readonly nothingDrawn: string;
  readonly openUnanchored: () => void;
}): void {
  const {
    ports,
    controller,
    unanchoredReason,
    listing,
    noScene,
    nothingDrawn,
    openUnanchored,
  } = args;
  useEffect(
    () =>
      ports.ui.viewCommands.getState().register({
        zoomIn: () => controller?.zoomIn(),
        zoomOut: () => controller?.zoomOut(),
        fit: () => controller?.fit(),
        openUnanchored,
        ...(unanchoredReason === undefined ? {} : { unanchoredReason }),
        ...(listing
          ? { zoomReason: "the List view has no zoom" }
          : noScene
            ? { zoomReason: nothingDrawn }
            : {}),
      }),
    [
      ports,
      controller,
      unanchoredReason,
      listing,
      noScene,
      nothingDrawn,
      openUnanchored,
    ],
  );
}
