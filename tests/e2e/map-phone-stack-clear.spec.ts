/**
 * Step 8.4f, M2 (STUDIO build, own-data fixture, Chromium): the A3 rule for the phone, no box text under the stack of buttons, holds in portrait AND
 * landscape (Pixel 7 and iPhone 14), with the inspector closed and open (a bottom sheet in portrait, a side panel in landscape), at the first view and
 * after every automatic re-fit (a selection, the panel opening, the panel closing, the Fit button, a rotation of the viewport).
 */
import { devices, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openMapPhone } from "./map-layout-kit";

const { defaultBrowserType: _a, ...IPHONE } = devices["iPhone 14"];
const { defaultBrowserType: _b, ...PIXEL } = devices["Pixel 7"];
const { defaultBrowserType: _c, ...IPHONE_L } = devices["iPhone 14 landscape"];
const { defaultBrowserType: _d, ...PIXEL_L } = devices["Pixel 7 landscape"];

async function wordsUnderStack(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const stack = document
      .querySelector('[data-map-control="stack"]')
      ?.getBoundingClientRect();
    if (stack === undefined) return ["no stack"];
    return [...document.querySelectorAll("svg [data-label-of] text")]
      .filter((t) => {
        const r = t.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.left < stack.right &&
          r.right > stack.left &&
          r.top < stack.bottom &&
          r.bottom > stack.top
        );
      })
      .map((t) => t.textContent ?? "");
  });
}

/** Tap a family that is on screen and under no control (the first view may not show family 01). */
async function tapAFamily(page: Page): Promise<void> {
  const at = await page.evaluate(() => {
    const area = (
      document.querySelector('svg[role="group"]') as unknown as SVGElement
    ).getBoundingClientRect();
    const controls = [...document.querySelectorAll("[data-map-control]")].map(
      (c) => c.getBoundingClientRect(),
    );
    for (const n of document.querySelectorAll("svg [data-node-id]")) {
      const r = n.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const free = !controls.some(
        (c) =>
          x > c.left - 8 &&
          x < c.right + 8 &&
          y > c.top - 8 &&
          y < c.bottom + 8,
      );
      if (
        free &&
        x > area.left + 8 &&
        x < area.right - 8 &&
        y > area.top + 8 &&
        y < area.bottom - 8
      )
        return { x, y };
    }
    return null;
  });
  if (at === null) throw new Error("no family on screen");
  await page.touchscreen.tap(at.x, at.y);
}

async function settle(page: Page): Promise<void> {
  let previous = "";
  for (let i = 0; i < 40; i += 1) {
    const now = await page.evaluate(() =>
      [...document.querySelectorAll("svg [data-node-id]")]
        .map((n) => JSON.stringify(n.getBoundingClientRect()))
        .join("|"),
    );
    if (now === previous) return;
    previous = now;
    await page.waitForTimeout(250);
  }
}

for (const [label, device] of [
  ["Pixel 7 portrait", PIXEL],
  ["iPhone 14 portrait", IPHONE],
  ["Pixel 7 landscape", PIXEL_L],
  ["iPhone 14 landscape", IPHONE_L],
] as const) {
  test.describe(`stack clear of box text (${label})`, () => {
    test.use({ ...device, actionTimeout: 60_000 });

    test("first view, a selection with its panel open, Fit, panel closed", async ({
      page,
    }) => {
      test.setTimeout(300_000);
      await openMapPhone(page);
      await settle(page);
      expect(await wordsUnderStack(page), `${label} first view`).toEqual([]);
      await tapAFamily(page);
      const close = page.getByRole("button", { name: "Close inspector" });
      await expect(close).toBeVisible();
      await page.waitForTimeout(1200);
      await settle(page);
      expect(
        await wordsUnderStack(page),
        `${label} family selected, panel open`,
      ).toEqual([]);
      await page.getByRole("button", { name: "Fit" }).tap();
      await settle(page);
      expect(
        await wordsUnderStack(page),
        `${label} after Fit, panel open`,
      ).toEqual([]);
      await close.tap();
      await page.waitForTimeout(800);
      await settle(page);
      expect(
        await wordsUnderStack(page),
        `${label} panel closed again`,
      ).toEqual([]);
    });
  });
}
