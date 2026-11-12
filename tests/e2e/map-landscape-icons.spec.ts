/**
 * Step 8.4f, M3 (STUDIO build, own-data fixture, Chromium, Pixel 7 and iPhone 14 landscape): each of the five tabs in the icon column shows a visible icon (its
 * box at least 20 px, a mask that is not none and loads, a colour that is not transparent) and carries its name as the accessible name. Before: the screenshot
 * showed an empty strip and a blue mark.
 */
import { devices } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openMapPhone } from "./map-layout-kit";

const { defaultBrowserType: _a, ...IPHONE } = devices["iPhone 14 landscape"];
const { defaultBrowserType: _b, ...PIXEL } = devices["Pixel 7 landscape"];

for (const [label, device] of [
  ["Pixel 7 landscape", PIXEL],
  ["iPhone 14 landscape", IPHONE],
] as const) {
  test.describe(`landscape icon column (${label})`, () => {
    test.use({ ...device, actionTimeout: 60_000 });

    test("each of the five items shows an icon and has its name", async ({
      page,
    }, info) => {
      test.setTimeout(300_000);
      await openMapPhone(page);
      await page.waitForTimeout(1200);
      const seen = await page.evaluate(async () => {
        const nav = document.querySelector('nav[aria-label="Home"]');
        const out: Record<string, unknown>[] = [];
        for (const button of nav?.querySelectorAll("button") ?? []) {
          const icon = button.querySelector("span[aria-hidden]");
          const s = icon === null ? null : getComputedStyle(icon);
          const mask =
            s?.maskImage ?? s?.getPropertyValue("-webkit-mask-image") ?? "none";
          const url = /url\("?([^")]+)"?\)/.exec(mask)?.[1];
          const loaded = url === undefined ? false : (await fetch(url)).ok;
          const r = icon?.getBoundingClientRect();
          out.push({
            name: button.getAttribute("aria-label") ?? button.textContent,
            w: r?.width ?? 0,
            h: r?.height ?? 0,
            mask,
            loaded,
            color: s?.backgroundColor,
            opacity: s?.opacity,
            visibility: s?.visibility,
          });
        }
        return out;
      });
      info.annotations.push({
        type: "icons",
        description: JSON.stringify(seen),
      });
      console.log(`M3 ${label} ${JSON.stringify(seen)}`);
      expect(seen.map((s) => s["name"])).toEqual([
        "Chapters",
        "Families",
        "Map",
        "Explore",
        "Search",
      ]);
      for (const s of seen) {
        expect(
          Number(s["w"]),
          `${String(s["name"])} icon width`,
        ).toBeGreaterThanOrEqual(20);
        expect(
          Number(s["h"]),
          `${String(s["name"])} icon height`,
        ).toBeGreaterThanOrEqual(20);
        expect(s["mask"], `${String(s["name"])} has a mask`).not.toBe("none");
        expect(s["loaded"], `${String(s["name"])} mask file loads`).toBe(true);
        expect(s["color"], `${String(s["name"])} colour`).not.toBe(
          "rgba(0, 0, 0, 0)",
        );
        expect(s["visibility"]).toBe("visible");
      }
      // pixels: the icon's own box is not one flat colour (a mask that has not painted shows the button's background only)
      for (const name of ["Chapters", "Families", "Map", "Explore", "Search"]) {
        const item = page
          .getByRole("navigation", { name: "Home" })
          .getByRole("button", { name, exact: true });
        const box = await item
          .locator("span[aria-hidden]")
          .first()
          .boundingBox();
        if (box === null) throw new Error(`${name}: no icon box`);
        const png = await page.screenshot({ clip: box });
        const distinct = await page.evaluate(async (b64) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext("2d");
          if (g === null) return 0;
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          const seen = new Set<number>();
          for (let i = 0; i < d.length; i += 4)
            seen.add(
              ((d[i] ?? 0) << 16) | ((d[i + 1] ?? 0) << 8) | (d[i + 2] ?? 0),
            );
          return seen.size;
        }, png.toString("base64"));
        expect(
          distinct,
          `${name}: the icon paints more than one colour`,
        ).toBeGreaterThan(2);
      }
      for (const name of ["Chapters", "Families", "Map", "Explore", "Search"])
        await expect(
          page
            .getByRole("navigation", { name: "Home" })
            .getByRole("button", { name, exact: true }),
        ).toBeVisible();
    });
  });
}
