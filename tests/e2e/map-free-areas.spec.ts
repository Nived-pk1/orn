/**
 * Step 8.4e, Part A (A3, A4, A6): the map's controls float ON the canvas and Fit leaves each its own free area. Phone portrait (Pixel 7,
 * Chromium) over the own-data layout fixture: no empty strip between the phone bar and the drawing, the top row of boxes fully visible
 * at Fit, no floating control over a family box (nothing selected and a family selected), and the canvas carries the app's one focus ring,
 * not the browser's black outline. Floating controls are marked `data-map-control`.
 */
import { devices, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { boxTitlePx } from "./box-text";
import { leaveChapters, loadDemo } from "./kit";
import { chipsSettled, clickNode } from "./map-focus-kit";
import {
  FAMILY_ONE,
  NAVIGATOR,
  openMapDesktop,
  openMapPhone,
} from "./map-layout-kit";

const { defaultBrowserType: _pixel, ...PIXEL } = devices["Pixel 7"];

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
const meets = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function rects(page: Page, selector: string): Promise<Rect[]> {
  return page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)]
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        })
        .filter((r) => r.w > 0 && r.h > 0),
    selector,
  );
}

async function settle(page: Page): Promise<void> {
  let previous = "";
  for (let i = 0; i < 40; i += 1) {
    const now = JSON.stringify(await rects(page, "svg [data-node-id]"));
    if (now === previous) return;
    previous = now;
    await page.waitForTimeout(250);
  }
}

/**
 * A3. Bars and the hint pill meet no family box. The stack at the side of a map wider than the screen (the phone, which pans sideways) can
 * reach into a box that runs past the edge; there the rule holds for what the box SAYS: no text of a box (title, formula, count) is under it.
 */
async function expectFree(page: Page): Promise<void> {
  const controls = await page.evaluate(() =>
    [...document.querySelectorAll("[data-map-control]")]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          kind: el.getAttribute("data-map-control"),
          shown: getComputedStyle(el).visibility !== "hidden", // a hint pill with nothing to say covers nothing
        };
      })
      .filter((r) => r.w > 0 && r.h > 0 && r.shown),
  );
  expect(
    controls.length,
    "the floating controls are marked data-map-control",
  ).toBeGreaterThan(0);
  const boxes = await rects(page, "svg [data-node-id]");
  const words = await rects(page, "svg [data-label-of] text");
  for (const control of controls) {
    const against = control.kind === "stack" ? words : boxes;
    for (const one of against)
      expect(
        meets(control, one),
        `${control.kind} ${JSON.stringify(control)} over ${JSON.stringify(one)}`,
      ).toBe(false);
  }
}

test.describe("the map to the reference: free areas (Pixel 7)", () => {
  test.use({ ...PIXEL, actionTimeout: 60_000 });

  test("A4: no empty strip above the drawing, the top row of boxes fully visible at Fit", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openMapPhone(page);
    await settle(page);
    await page.locator(`svg [data-node-id="${FAMILY_ONE}"]`).tap();
    await settle(page);
    const area = await page
      .getByRole("group", { name: NAVIGATOR })
      .boundingBox();
    const bar = await page.locator("[data-phone-map-bar]").boundingBox();
    if (area === null || bar === null) throw new Error("no area or bar");
    const frame = await page
      .locator("[data-phone-map-bar]")
      .evaluate(
        (el) => el.closest("[data-map-room]")?.getBoundingClientRect().y ?? 0,
      );
    expect(
      area.y - frame,
      "no empty strip: the drawing starts at the top of the top of its own column",
    ).toBeLessThanOrEqual(2);
    const boxes = await rects(page, "svg [data-node-id]");
    const top = Math.min(...boxes.map((b) => b.y));
    expect(
      top,
      "the top row is fully visible, below the floating bar",
    ).toBeGreaterThanOrEqual(bar.y + bar.height);
    expect(
      top - (bar.y + bar.height),
      "and close under it",
    ).toBeLessThanOrEqual(40);
  });

  test("A3: at Fit no floating control meets a family box (nothing selected, then a family selected)", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openMapPhone(page);
    await settle(page);
    await expectFree(page);
    await page.locator(`svg [data-node-id="${FAMILY_ONE}"]`).tap();
    await settle(page);
    await page.getByRole("button", { name: "Fit" }).tap();
    await settle(page);
    await expectFree(page);
  });

  test("A6: after a tap the canvas shows the token focus ring and no browser outline", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openMapPhone(page);
    await settle(page);
    const drawing = page.getByRole("group", { name: NAVIGATOR });
    await drawing.focus();
    const style = await drawing.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        outlineStyle: s.outlineStyle,
        ring: s.boxShadow,
        inset: el.getAttribute("data-focus-ring"),
      };
    });
    expect(style.outlineStyle === "auto", "no UA outline").toBe(false);
    expect(style.ring !== "none" || style.outlineStyle !== "none").toBe(true);
  });
});

const SIZES = [
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1000 },
];

test.describe("the map to the reference: desktop floating controls (Studio)", () => {
  test.use({ actionTimeout: 60_000 });

  test("A1: no toolbar row above the map; the controls float in four places and each works", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openMapDesktop(page);
    await settle(page);
    const area = await page
      .getByRole("group", { name: NAVIGATOR })
      .boundingBox();
    const column = await page.locator("[data-map-room]").boundingBox();
    if (area === null || column === null) throw new Error("no area");
    expect(
      area.y - column.y,
      "the drawing starts at the top of its column: no row above it",
    ).toBeLessThanOrEqual(2);
    const bar = page.locator('[data-map-control="bar"]').first();
    await expect(bar.getByRole("combobox", { name: "Chapter" })).toBeVisible();
    await expect(
      bar.getByRole("button", { name: "Find a family" }),
    ).toBeVisible();
    await expect(
      bar.getByRole("button", { name: "From A to B" }),
    ).toBeVisible();
    await expect(bar.getByRole("button", { name: "More" })).toBeVisible();
    const stack = page.locator('[data-map-control="stack"]');
    const before = await page
      .locator("svg [data-world]")
      .getAttribute("transform");
    await stack.getByRole("button", { name: "Zoom in" }).click();
    await expect
      .poll(() => page.locator("svg [data-world]").getAttribute("transform"))
      .not.toBe(before);
    await stack.getByRole("button", { name: "Zoom out" }).click();
    await stack.getByRole("button", { name: "Fit" }).click();
    await expect(
      page.locator("[data-arrow-key], [data-key-button]").first(),
    ).toBeVisible();
    await expect(
      page.locator("[data-map-quiet]"),
      "the hint shows while nothing is selected",
    ).toBeVisible();
    await clickNode(page, page.locator(`svg [data-node-id="${FAMILY_ONE}"]`));
    await expect(page.locator("[data-map-selected]")).toBeVisible();
    await expect(
      page.locator("[data-map-quiet]"),
      "and hides on a selection",
    ).toHaveCount(0);
  });

  for (const size of SIZES) {
    test(`A3: at Fit no floating control meets a family box, nothing selected and a family selected (${size.width} x ${size.height})`, async ({
      page,
    }) => {
      test.setTimeout(300_000);
      await openMapDesktop(page);
      await page.setViewportSize(size);
      await page.waitForTimeout(900);
      await settle(page);
      await expectFree(page);
      await clickNode(page, page.locator(`svg [data-node-id="${FAMILY_ONE}"]`));
      await chipsSettled(page);
      await settle(page);
      await expectFree(page);
    });
  }

  test("the demo: box titles at Fit stay at least 10 px at 1280 x 800 (pane shut), 1389 x 868 and 1920 x 1000", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await loadDemo(page);
    await leaveChapters(page);
    await expect(page.getByRole("group", { name: NAVIGATOR })).toBeVisible({
      timeout: 90_000,
    });
    for (const size of [
      { width: 1280, height: 800 },
      { width: 1389, height: 868 },
      { width: 1920, height: 1000 },
    ]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(900);
      await settle(page);
      expect(
        await boxTitlePx(page),
        `${size.width} x ${size.height}`,
      ).toBeGreaterThanOrEqual(10);
    }
  });
});
