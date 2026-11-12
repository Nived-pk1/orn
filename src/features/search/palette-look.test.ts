import { describe, expect, it } from "vitest";
import { ICON_NAMES } from "@/ui/primitives";
import { RECORD_KINDS } from "@/core/schema";
import { commandLook, kindIcon } from "./palette-look";

/** Step 8.4f, L2: every palette row has an icon (a file that exists), commands that have a key say it; data in a table, not a branch per command. */
describe("palette look", () => {
  it("every record kind has an icon that exists", () => {
    for (const kind of RECORD_KINDS)
      expect(ICON_NAMES).toContain(kindIcon(kind));
  });
  it("commands: an icon that exists for every id shape the registry uses", () => {
    for (const id of [
      "import-file",
      "replace-demo",
      "undo-import",
      "edit-names",
      "fit",
      "zoom-in",
      "zoom-out",
      "overview-mode",
      "overview",
      "open-chapters",
      "go-map",
      "open-reactions",
      "open-precursors",
      "open-reagents",
      "open-named",
      "open-mechanisms",
      "open-syllabus",
      "go-dataset",
      "go-review",
      "go-workbench",
      "export",
      "unanchored",
      "scope:all",
      "scope:exv_x",
      "structures:full",
      "new-reaction",
      "something-new",
    ])
      expect(ICON_NAMES, id).toContain(commandLook(id).icon);
  });
  it("the keys that exist are said: Fit 0, Zoom in +, Zoom out -", () => {
    expect(commandLook("fit").keys).toBe("0");
    expect(commandLook("zoom-in").keys).toBe("+");
    expect(commandLook("zoom-out").keys).toBe("-");
    expect(commandLook("export").keys).toBeUndefined();
  });
});
