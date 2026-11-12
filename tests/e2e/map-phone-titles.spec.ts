/**
 * Step 8.4e, resume 4 item 1 (STUDIO build, own-data fixture, Chromium, Pixel 7 and iPhone 14 profiles, portrait and landscape, the normal map and full map):
 * on a touch layout the first view and Fit keep family titles between 10 and 13 px (the lower bound is the larger of FIT_FLOOR and the 10 px zoom), the map
 * pans both ways, and a pinch out still reaches FIT_FLOOR (the pinch minimum is unchanged). Before: landscape 6.1 px, iPhone 14 portrait 8.1 px.
 */
import { devices, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { boxTitlePx } from "./box-text";
import { openMapPhone } from "./map-layout-kit";

const { defaultBrowserType: _a, ...IPHONE } = devices["iPhone 14"];
const { defaultBrowserType: _b, ...PIXEL } = devices["Pixel 7"];
const { defaultBrowserType: _c, ...IPHONE_L } = devices["iPhone 14 landscape"];
const { defaultBrowserType: _d, ...PIXEL_L } = devices["Pixel 7 landscape"];
const FIT_FLOOR = 0.3775;

const scaleOf = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      (
        document.querySelector(
          "svg [data-world]",
        ) as unknown as SVGGraphicsElement
      ).getScreenCTM()?.a ?? 0,
  );

async function onScreen(
  page: Page,
): Promise<{ columns: number; rows: number }> {
  return page.evaluate(() => {
    const area = (
      document.querySelector('svg[role="group"]') as unknown as SVGElement
    ).getBoundingClientRect();
    const boxes = [...document.querySelectorAll("svg [data-node-id]")]
      .map((n) => n.getBoundingClientRect())
      .filter(
        (b) =>
          b.left >= area.left - 1 &&
          b.right <= area.right + 1 &&
          b.top >= area.top - 1 &&
          b.bottom <= area.bottom + 1,
      );
    return {
      columns: new Set(boxes.map((b) => Math.round(b.left / 20))).size,
      rows: new Set(boxes.map((b) => Math.round(b.top / 20))).size,
    };
  });
}

for (const [label, device] of [
  ["Pixel 7 portrait", PIXEL],
  ["iPhone 14 portrait", IPHONE],
  ["Pixel 7 landscape", PIXEL_L],
  ["iPhone 14 landscape", IPHONE_L],
] as const) {
  test.describe(`phone titles at Fit (${label})`, () => {
    test.use({ ...device, actionTimeout: 60_000 });

    test("10 to 13 px in the normal map and in full map; a pinch out reaches FIT_FLOOR", async ({
      page,
    }, info) => {
      test.setTimeout(300_000);
      await openMapPhone(page);
      await page.waitForTimeout(1500);
      const normal = {
        title: await boxTitlePx(page),
        ...(await onScreen(page)),
      };
      await page.getByRole("button", { name: "Full map", exact: true }).tap();
      await expect(page.locator("[data-full-map]")).toHaveCount(1);
      await page.waitForTimeout(1500);
      const full = { title: await boxTitlePx(page), ...(await onScreen(page)) };
      const line = `${label}: normal ${normal.title.toFixed(1)} px, ${normal.columns} x ${normal.rows} families whole on screen; full map ${full.title.toFixed(1)} px, ${full.columns} x ${full.rows}`;
      info.annotations.push({ type: "titles", description: line });
      console.log(`T ${line}`);
      expect(
        normal.title,
        `${label}: titles in the normal map are at least 10 px`,
      ).toBeGreaterThanOrEqual(9.95);
      expect(normal.title, "and at most 13 px").toBeLessThanOrEqual(13.2);
      expect(
        full.title,
        `${label}: titles in full map are at least 10 px`,
      ).toBeGreaterThanOrEqual(9.95);
      expect(full.title, "and at most 13 px").toBeLessThanOrEqual(13.2);
      // a pinch out still reaches the floor
      const area = (await page.locator('svg[role="group"]').boundingBox()) as {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.synthesizePinchGesture", {
        x: area.x + area.width / 2,
        y: area.y + area.height / 2,
        scaleFactor: 0.2,
        relativeSpeed: 400,
      });
      await expect
        .poll(() => scaleOf(page), {
          message: "the pinch out reaches FIT_FLOOR",
        })
        .toBeLessThan(FIT_FLOOR + 0.01);
      expect(await scaleOf(page), "and not below it").toBeGreaterThan(
        FIT_FLOOR - 0.01,
      );
    });
  });
}
