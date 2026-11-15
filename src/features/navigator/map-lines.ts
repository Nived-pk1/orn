/** The map's one-line sentences and the reason Open family cannot act (moved out of navigator-canvas.tsx, step 8.4e). */
export const QUIET_LINE =
  "Tap or click a family to see what it makes and what it is made from.";
export const busyLine = (n: number): string =>
  `This chapter has ${n} arrows. Tap or click a family to see its part.`;
/** The selected bucket ("Not in a family yet") with more arrows than the map draws at once: the panel lists them (step 8.4b, C). */
export const listedLine = (n: number): string =>
  `${n} arrows: listed in the panel`;
/** A hover preview of a family with more lines than a preview draws: nothing is selected, so no panel is promised. */
export const hoverBusyLine = (n: number): string =>
  `This family has ${n} arrows. Click it to see them.`;
const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;
/**
 * The count line of a selected family (step 8.4m, M3): "16 reactions to 9 families". `listed`: its lines are NOT drawn (more than the map
 * shows at once) and the panel has the list (its "Links" section, or the bucket's arrows), so the line may say so. Never otherwise.
 */
export const linksLine = (reactions: number, families: number, listed: boolean): string =>
  `${plural(reactions, "reaction", "reactions")} to ${plural(families, "family", "families")}${listed ? ": listed in the panel" : ""}`;

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
