import { describe, expect, it } from "vitest";

const load = (): Promise<{ initialScripts: (html: string) => string[] }> =>
  // @ts-expect-error plain .mjs script without types
  import("../../scripts/initial-js-size.mjs");

describe("initialScripts", () => {
  it("lists scripts and module preloads once, in order, ignoring css", async () => {
    const { initialScripts } = await load();
    const html =
      '<script type="module" crossorigin src="/assets/index-a.js"></script><link rel="modulepreload" href="/assets/vendor-b.js"><link rel="stylesheet" href="/assets/x.css"><link rel="modulepreload" href="/assets/vendor-b.js">';
    expect(initialScripts(html)).toEqual([
      "assets/index-a.js",
      "assets/vendor-b.js",
    ]);
  });
  it("returns nothing for a page without scripts", async () => {
    const { initialScripts } = await load();
    expect(initialScripts("<html></html>")).toEqual([]);
  });
});
