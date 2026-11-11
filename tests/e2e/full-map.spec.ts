/**
 * Step 8.4e, Part D (STUDIO build, own-data fixture, Chromium: desktop and the Pixel 7 / iPhone 14 profiles, portrait and landscape): FULL MAP.
 * The frame hides and the map fills the viewport (at least 95%); the pane opens OVER it without changing the map area; the button, Esc and Back
 * leave; Shift+F enters (plain F centres on the selection). The interaction table of the notes is exercised in full-map-table.spec.ts.
 */
import { devices, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { FAMILY_ONE, openMapDesktop, openMapPhone } from "./map-layout-kit";
import { clickNode } from "./map-focus-kit";
import { boxTitlePx } from "./box-text";

const { defaultBrowserType: _a, ...IPHONE } = devices["iPhone 14"];
const { defaultBrowserType: _b, ...PIXEL } = devices["Pixel 7"];
const { defaultBrowserType: _c, ...IPHONE_LANDSCAPE } =
  devices["iPhone 14 landscape"];
const { defaultBrowserType: _d, ...PIXEL_LANDSCAPE } =
  devices["Pixel 7 landscape"];

export const drawing = (page: Page) => page.locator('svg[role="group"]');

/** The map area (the drawing's box) and its share of the viewport. */
export async function areaOf(
  page: Page,
): Promise<{ x: number; y: number; w: number; h: number; share: number }> {
  return page.evaluate(() => {
    const r = (
      document.querySelector('svg[role="group"]') as unknown as SVGElement
    ).getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      share: (r.width * r.height) / (window.innerWidth * window.innerHeight),
    };
  });
}

const full = (page: Page) => page.locator("[data-full-map]");

async function enterByButton(page: Page, phone: boolean): Promise<void> {
  const button = page.getByRole("button", { name: "Full map", exact: true });
  await expect(button).toBeVisible({ timeout: 60_000 });
  if (phone) await button.tap();
  else await button.click();
  await expect(full(page)).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Exit full map", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(900);
}

for (const size of [
  { width: 1280, height: 800 },
  { width: 1920, height: 1000 },
]) {
  test.describe(`full map, desktop ${size.width} x ${size.height}`, () => {
    test.use({ actionTimeout: 60_000 });

    test("the button enters and leaves; the map covers 95% of the viewport; the pane opens over the map without changing its size", async ({
      page,
    }) => {
      test.setTimeout(300_000);
      await openMapDesktop(page);
      await page.setViewportSize(size);
      await page.waitForTimeout(900);
      const normal = await areaOf(page);
      expect(
        normal.share,
        "the normal map shares the screen with the frame",
      ).toBeLessThan(0.9);
      await enterByButton(page, false);
      const whole = await areaOf(page);
      expect(
        whole.share,
        "full map: the map area covers at least 95% of the viewport",
      ).toBeGreaterThanOrEqual(0.95);
      await expect(
        page.getByRole("navigation", { name: "Modes" }),
      ).toBeHidden();
      await expect(page.locator("header")).toBeHidden();
      // a family selected: its pane opens OVER the map; the map area keeps its size
      await clickNode(page, page.locator(`svg [data-node-id="${FAMILY_ONE}"]`));
      const pane = page.getByRole("complementary", { name: "Inspector" });
      await expect(pane).toBeVisible();
      await page.waitForTimeout(900);
      const withPane = await areaOf(page);
      expect(
        Math.abs(withPane.w - whole.w),
        "the pane does not shrink the map",
      ).toBeLessThanOrEqual(1);
      expect(Math.abs(withPane.h - whole.h)).toBeLessThanOrEqual(1);
      const paneBox = (await pane.boundingBox()) as {
        x: number;
        width: number;
      };
      expect(
        paneBox.x + paneBox.width,
        "the pane sits at the right edge of the viewport",
      ).toBeGreaterThanOrEqual(size.width - 1);
      expect(paneBox.x, "and lies over the map").toBeLessThan(
        withPane.x + withPane.w,
      );
      await page.screenshot({
        path: `test-results/full-map-pane-${size.width}x${size.height}.png`,
      });
      await page
        .getByRole("button", { name: "Exit full map", exact: true })
        .click();
      await expect(full(page)).toHaveCount(0);
      await expect(
        page.getByRole("navigation", { name: "Modes" }),
      ).toBeVisible();
      await expect
        .poll(async () => (await areaOf(page)).share)
        .toBeLessThan(0.9);
    });

    test("Esc clears the selection first and the next Esc leaves; Back leaves without leaving the page; Shift+F enters, plain F does not", async ({
      page,
    }) => {
      test.setTimeout(300_000);
      await openMapDesktop(page);
      await page.setViewportSize(size);
      await page.waitForTimeout(900);
      const url = page.url();
      await clickNode(page, page.locator(`svg [data-node-id="${FAMILY_ONE}"]`));
      await drawing(page).focus();
      await page.keyboard.press("f"); // centre: not full map
      await expect(full(page)).toHaveCount(0);
      await page.keyboard.press("Shift+F");
      await expect(full(page)).toHaveCount(1);
      await page.waitForTimeout(600);
      await drawing(page).focus();
      await page.keyboard.press("Escape"); // the selection goes first
      await expect(full(page)).toHaveCount(1);
      await expect(page.getByText(/^Selected: /)).toHaveCount(0);
      await page.keyboard.press("Escape"); // nothing left for Esc to close: full map ends
      await expect(full(page)).toHaveCount(0);
      // Back
      await enterByButton(page, false);
      await page.goBack();
      await expect(full(page)).toHaveCount(0);
      expect(page.url(), "Back stayed in the app").toBe(url);
      await expect(drawing(page)).toBeVisible();
    });
  });
}

for (const [label, device, phone] of [
  ["Pixel 7 portrait", PIXEL, true],
  ["iPhone 14 portrait", IPHONE, true],
  ["Pixel 7 landscape", PIXEL_LANDSCAPE, true],
  ["iPhone 14 landscape", IPHONE_LANDSCAPE, true],
] as const) {
  test.describe(`full map, ${label}`, () => {
    test.use({ ...device, actionTimeout: 60_000 });

    test("the round button enters; the map covers 95% of the viewport; the sheet opens over it; the button and Back leave", async ({
      page,
    }, info) => {
      test.setTimeout(300_000);
      await openMapPhone(page);
      const url = page.url();
      const normal = await areaOf(page);
      await enterByButton(page, phone);
      const whole = await areaOf(page);
      expect(
        whole.share,
        `${label}: the map area covers at least 95% of the viewport`,
      ).toBeGreaterThanOrEqual(0.95);
      expect(whole.h, "taller than the normal map").toBeGreaterThan(normal.h);
      const title = await boxTitlePx(page);
      info.annotations.push({
        type: "full map",
        description: `${label}: map ${whole.w.toFixed(0)} x ${whole.h.toFixed(0)} (${(whole.share * 100).toFixed(0)}% of the viewport), normal map ${normal.w.toFixed(0)} x ${normal.h.toFixed(0)}, box title ${title.toFixed(1)} px`,
      });
      console.log(`D ${label}: ${JSON.stringify({ whole, normal, title })}`);
      await page.screenshot({
        path: `test-results/full-map-${label.replace(/ /g, "-")}.png`,
      });
      // a family tapped: its sheet opens over the map, the map area does not change
      await page.locator(`svg [data-node-id="${FAMILY_ONE}"]`).tap();
      await page.waitForTimeout(1200);
      const withSheet = await areaOf(page);
      expect(
        Math.abs(withSheet.h - whole.h),
        "the sheet does not shrink the map",
      ).toBeLessThanOrEqual(1);
      expect(Math.abs(withSheet.w - whole.w)).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: `test-results/full-map-sheet-${label.replace(/ /g, "-")}.png`,
      });
      await page
        .getByRole("button", { name: "Exit full map", exact: true })
        .tap();
      await expect(full(page)).toHaveCount(0);
      await enterByButton(page, phone);
      await page.goBack();
      await expect(full(page)).toHaveCount(0);
      expect(page.url(), "Back stayed in the app").toBe(url);
    });
  });
}
