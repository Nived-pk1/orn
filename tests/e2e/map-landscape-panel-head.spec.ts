/**
 * Step 8.4f, M4 (STUDIO build, own-data fixture, Chromium, Pixel 7 and iPhone 14 landscape): the side panel's header follows the pattern of the wide panes:
 * the chip row first (the review mark at its right end), then the title on its own line BELOW the chip row, then (full) the summary. Before: the chips,
 * the title and the previous / next buttons shared one squeezed row.
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
  test.describe(`landscape panel header (${label})`, () => {
    test.use({ ...device, actionTimeout: 60_000 });

    test("the title is below the chip row; the review mark is at the row's right end", async ({
      page,
    }) => {
      test.setTimeout(300_000);
      await openMapPhone(page);
      await page.waitForTimeout(1200);
      const at = await page.evaluate(() => {
        const area = document
          .querySelector('svg[role="group"]')
          ?.getBoundingClientRect();
        const controls = [
          ...document.querySelectorAll("[data-map-control]"),
        ].map((c) => c.getBoundingClientRect());
        for (const n of document.querySelectorAll("svg [data-node-id]")) {
          const r = n.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          if (
            area &&
            x > area.left + 8 &&
            x < area.right - 8 &&
            y > area.top + 8 &&
            y < area.bottom - 8 &&
            !controls.some(
              (c) =>
                x > c.left - 8 &&
                x < c.right + 8 &&
                y > c.top - 8 &&
                y < c.bottom + 8,
            )
          )
            return { x, y };
        }
        return null;
      });
      if (at === null) throw new Error("no family on screen");
      await page.touchscreen.tap(at.x, at.y);
      await expect(
        page.getByRole("button", { name: "Close inspector" }),
      ).toBeVisible();
      await page.waitForTimeout(1200);
      const head = await page.evaluate(() => {
        const rect = (e: Element | null) => {
          const r = e?.getBoundingClientRect();
          return r === undefined
            ? null
            : { x: r.x, y: r.y, w: r.width, h: r.height };
        };
        const header = document.querySelector("aside header");
        return {
          chips: rect(
            header?.querySelector("h3")?.previousElementSibling ?? null,
          ),
          title: rect(header?.querySelector("h3") ?? null),
          aside: rect(header?.querySelector("[data-head-aside]") ?? null),
        };
      });
      console.log(`M4 ${label} ${JSON.stringify(head)}`);
      if (head.chips === null || head.title === null || head.aside === null)
        throw new Error("no header parts");
      expect(
        head.title.y,
        "the title starts below the chip row",
      ).toBeGreaterThanOrEqual(head.chips.y + head.chips.h - 1);
      expect(
        head.aside.x + head.aside.w,
        "the review mark is at the right end of the chip row",
      ).toBeGreaterThanOrEqual(head.chips.x + head.chips.w - 2);
    });
  });
}
