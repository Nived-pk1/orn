/**
 * Step 8.4e, C4 (STUDIO build, own-data fixture, Pixel 7 and iPhone 14 in Chromium, portrait): the first view and Fit use the largest zoom at which
 * the boxes fit the map area's HEIGHT: family titles up to 13 px (before: 6.1 px; Pixel 7 now 12.8 px, iPhone 14 8.1 px because its map area is shorter, 10 px since resume 4) and the boxes use most of
 * the free height. Landscape belongs to Part E.
 */
import { devices, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { boxTitlePx } from "./box-text";
import { NAVIGATOR, openMapPhone } from "./map-layout-kit";

const { defaultBrowserType: _a, ...IPHONE } = devices["iPhone 14"];
const { defaultBrowserType: _b, ...PIXEL } = devices["Pixel 7"];

async function measure(page: Page): Promise<{ title: number; use: number; columns: number; rows: number }> {
  const title = await boxTitlePx(page);
  const found = await page.evaluate((name) => {
    const area = (document.querySelector('svg[role="group"]') as unknown as SVGElement).getBoundingClientRect();
    const boxes = [...document.querySelectorAll('svg [data-node-id]')].map((n) => n.getBoundingClientRect()).filter((b) => b.right > area.left && b.left < area.right && b.bottom > area.top && b.top < area.bottom);
    const rows = new Set(boxes.map((b) => Math.round(b.top / 20)));
    const columns = new Set(boxes.map((b) => Math.round(b.left / 20)));
    return { top: Math.min(...boxes.map((b) => b.top)), bottom: Math.max(...boxes.map((b) => b.bottom)), height: area.height, rows: rows.size, columns: columns.size, name };
  }, NAVIGATOR.source);
  return { title, use: (found.bottom - found.top) / found.height, columns: found.columns, rows: found.rows };
}

// the iPhone 14 map area is only about 365 px high, so the largest zoom that fits the height gives smaller titles there (before: 6.1 px, 52% of the height)
for (const [label, device, minTitle, minUse] of [["Pixel 7", PIXEL, 10, 0.8], ["iPhone 14", IPHONE, 9.99, 0.65]] as const) {
  test.describe(`the phone's first view and Fit (${label})`, () => {
    test.use({ ...device, actionTimeout: 60_000 });

    test("titles 10 to 13 px and the boxes use most of the height, at the first view and after Fit", async ({ page }, info) => {
      test.setTimeout(300_000);
      await openMapPhone(page);
      await page.waitForTimeout(1500);
      const first = await measure(page);
      info.annotations.push({ type: "phone view", description: `${label}: title ${first.title.toFixed(1)} px, ${first.columns} columns, ${first.rows} rows, boxes use ${(first.use * 100).toFixed(0)}% of the height` });
      console.log(`C4 ${label} first view: ${JSON.stringify(first)}`);
      expect(first.title, "titles are readable").toBeGreaterThanOrEqual(minTitle);
      expect(first.title, "and never above 13 px").toBeLessThanOrEqual(13.2);
      expect(first.use, "the boxes use the height").toBeGreaterThanOrEqual(minUse);
      await page.getByRole("button", { name: "Zoom out", exact: true }).count();
      await page.getByRole("button", { name: "Fit", exact: true }).tap();
      await page.waitForTimeout(1200);
      const fitted = await measure(page);
      expect(Math.abs(fitted.title - first.title), "Fit returns to the first view").toBeLessThan(0.3);
    });
  });
}
