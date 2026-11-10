/** The map's one-line sentences and the reason Open family cannot act (moved out of navigator-canvas.tsx, step 8.4e). */
export const QUIET_LINE =
  "Tap or click a family to see what it makes and what it is made from.";
export const busyLine = (n: number, selection = false): string =>
  selection
    ? `${n} arrows: listed in the panel`
    : `This chapter has ${n} arrows. Tap or click a family to see its part.`;

/** Why Open family cannot act now, or undefined when it can. */
export function openFamilyReason(
  selected: { readonly kind: "node" | "edge" } | null,
  isFamily: boolean,
): string | undefined {
  if (selected === null) return "select a family first";
  if (selected.kind === "edge")
    return "an arrow is selected: use Open, or select a family";
  if (!isFamily) return "the selection is not a family";
  return undefined;
}
