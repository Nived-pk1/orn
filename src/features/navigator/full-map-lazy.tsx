import { lazy, Suspense } from "react";
import type { MapStore } from "@/ui/state/map-state";

const Button = /* @__PURE__ */ lazy(() => import("./full-map-button"));

/** The Full map button, loaded after the first paint (step 8.4e, Part D): the first view does not wait for it and the first load does not carry it. */
export function FullMapButton(props: {
  readonly map: MapStore;
  readonly variant: "bar" | "round";
}) {
  return (
    <Suspense fallback={null}>
      <Button map={props.map} variant={props.variant} />
    </Suspense>
  );
}
