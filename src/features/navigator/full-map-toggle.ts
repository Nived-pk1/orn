import type { MapStore } from "@/ui/state/map-state";

/** Enter or leave full map (step 8.4e, Part D). Entering loads the lazy part that does the browser side; leaving is the flag alone (that part reacts to it). */
export function toggleFullMap(map: MapStore): void {
  if (map.getState().fullMap) map.getState().setFullMap(false);
  else void import("./full-map").then((m) => m.enterFullMap(map));
}
