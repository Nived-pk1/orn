/** The Full map button (step 8.4e, Part D; a lazy chunk with the icons' names): outward diagonal arrows, then "Exit full map" with inward ones. */
import { useEffect } from "react";
import { useStore } from "zustand";
import { Icon, IconButton } from "@/ui/primitives";
import type { MapStore } from "@/ui/state/map-state";
import { toggleFullMap } from "./full-map-toggle";
import floating from "./map-float.module.css";
import phone from "./phone-home.module.css";

export default function FullMapButton(props: {
  readonly map: MapStore;
  readonly variant: "bar" | "round";
}) {
  const on = useStore(props.map, (s) => s.fullMap);
  const label = on ? "Exit full map" : "Full map";
  const icon = on ? "minimize-2" : "maximize-2";
  const { map } = props;
  const click = (): void => toggleFullMap(map);
  // Shift+F with the map's drawing focused (plain F already centres on the selection). Caught before the drawing's own handler sees it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (
        event.key !== "F" ||
        !event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        !(event.target as Element | null)?.closest?.('svg[role="group"]')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      toggleFullMap(map);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [map]);
  return props.variant === "bar" ? (
    <IconButton
      label={label}
      icon={icon}
      variant="default"
      className={floating.barButton}
      onClick={click}
    />
  ) : (
    <button
      type="button"
      className={phone.round}
      aria-label={label}
      onClick={click}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}
