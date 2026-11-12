/**
 * What a palette row looks like (step 8.4f, L2; design reference section 7 menu rows): an icon on the left of every row and, for a command that has a
 * key, the key at the right. A table by id and kind, not a branch per command: the registry stays plain data (ids are the registry's own).
 */
import type { RecordKind } from "@/core/schema";
import type { IconName } from "@/ui/primitives";

export interface CommandLook {
  readonly icon: IconName;
  /** The key that does the same (from the map's key table), when there is one. */
  readonly keys?: string;
}

const KIND_ICONS: Partial<Record<RecordKind, IconName>> = {
  species: "atom",
  class: "layers",
  reagent: "test-tube",
  transformation: "route",
  named_reaction: "tag",
  mechanism: "compass",
  reaction: "flask",
  route: "route",
  topic: "book-open",
  exam: "list-checks",
  exam_version: "list-checks",
};

export const kindIcon = (kind: RecordKind): IconName =>
  KIND_ICONS[kind] ?? "mark";

const VIEW_ICONS: Readonly<Record<string, IconName>> = {
  chapters: "book-open",
  map: "map",
  navigator: "map",
  reactions: "flask",
  precursors: "route",
  reagents: "test-tube",
  named: "tag",
  mechanisms: "compass",
  syllabus: "list-checks",
  dataset: "database",
  review: "clipboard-check",
  workbench: "pencil",
};

const FIXED: Readonly<Record<string, CommandLook>> = {
  "import-file": { icon: "download" },
  "replace-demo": { icon: "database" },
  "undo-import": { icon: "undo" },
  "edit-names": { icon: "pencil" },
  export: { icon: "download" },
  fit: { icon: "scan", keys: "0" },
  "zoom-in": { icon: "plus", keys: "+" },
  "zoom-out": { icon: "minus", keys: "-" },
  "overview-mode": { icon: "map" },
  overview: { icon: "map" },
  unanchored: { icon: "triangle-alert" },
};

export function commandLook(id: string): CommandLook {
  const fixed = FIXED[id];
  if (fixed !== undefined) return fixed;
  const view = /^(?:go|open)-(.+)$/.exec(id)?.[1];
  if (view !== undefined) return { icon: VIEW_ICONS[view] ?? "compass" };
  if (id.startsWith("scope:")) return { icon: "tag" };
  if (id.startsWith("structures:")) return { icon: "atom" };
  if (id.startsWith("new")) return { icon: "plus" };
  return { icon: "search" };
}
