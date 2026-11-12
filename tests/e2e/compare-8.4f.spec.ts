/**
 * Step 8.4f, Part 1 close: pictures of the real app next to the matching part of the design reference (docs/design/ORN_DESIGN_REFERENCE.html, light
 * theme) into screenshots/compare-8.4f/ (app-*.png, ref-*.png and the pair). Not an assertion spec. Chromium only, STUDIO build.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { devices, type Locator, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  examChip,
  leaveChapters,
  loadDemo,
  openApp,
  openPhoneApp,
} from "./kit";
import { NAVIGATOR, openMapPhone, phoneFamily } from "./map-layout-kit";

const OUT = resolve(process.cwd(), "screenshots", "compare-8.4f");
const REFERENCE = `file:///${resolve(process.cwd(), "docs", "design", "ORN_DESIGN_REFERENCE.html").split("\\").join("/")}`;
const { defaultBrowserType: _a, ...PIXEL } = devices["Pixel 7"];
const { defaultBrowserType: _b, ...PIXEL_L } = devices["Pixel 7 landscape"];
test.use({ actionTimeout: 60_000 });

const b64 = (path: string): string => readFileSync(path).toString("base64");

/** One picture of the app (a locator or the page) and one of the reference part, side by side in one png. */
async function pair(
  page: Page,
  name: string,
  app: Locator | Page,
  ref: Locator,
): Promise<void> {
  const appPath = resolve(OUT, `app-${name}.png`);
  const refPath = resolve(OUT, `ref-${name}.png`);
  await app.screenshot({ path: appPath });
  await ref.first().screenshot({ path: refPath });
  const other = await page.context().newPage();
  await other.setViewportSize({ width: 1500, height: 900 });
  await other.setContent(
    `<body style="margin:0;padding:12px;font:12px sans-serif;background:#ddd"><div style="display:flex;gap:12px;align-items:flex-start"><div><div>APP</div><img src="data:image/png;base64,${b64(appPath)}"></div><div><div>REFERENCE</div><img src="data:image/png;base64,${b64(refPath)}"></div></div></body>`,
  );
  await other.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: true });
  await other.close();
}

async function referencePage(page: Page, width = 1280): Promise<Page> {
  const ref = await page.context().newPage();
  await ref.setViewportSize({ width, height: 900 });
  await ref.goto(REFERENCE);
  return ref;
}

test("desktop: exam chip and menu, palette, Reactions cards and compact, family header", async ({
  page,
}) => {
  test.setTimeout(480_000);
  mkdirSync(OUT, { recursive: true });
  const ref = await referencePage(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(
    page.getByRole("group", { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ }),
  ).toBeVisible({ timeout: 60_000 });
  await pair(
    page,
    "exam-chip-desktop",
    page.locator("header").first(),
    ref.locator(".app .topbar"),
  );
  await examChip(page).click();
  await expect(page.getByRole("menuitemradio").first()).toBeVisible();
  await pair(
    page,
    "exam-menu-desktop",
    page.getByRole("menu"),
    ref.locator(".menu"),
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Search" });
  await expect(palette.getByRole("option").first()).toBeVisible({
    timeout: 60_000,
  });
  await pair(page, "palette", palette, ref.locator(".menu"));
  await page.keyboard.press("Escape");
  const rail = page.getByRole("navigation", { name: "Modes" });
  await rail.getByRole("button", { name: "Reactions", exact: true }).click();
  const main = page.getByRole("main");
  await expect(page.getByRole("list", { name: "Reactions" })).toBeVisible({
    timeout: 60_000,
  });
  await pair(page, "reactions-cards", main, ref.locator(".card").first());
  await page.getByRole("radio", { name: "Compact" }).click({ force: true });
  await pair(page, "reactions-compact", main, ref.locator(".list").first());
  await rail.getByRole("button", { name: "Map" }).click();
  await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
  await expect(
    page.getByRole("heading", { level: 1, name: /Alcohols/ }),
  ).toBeVisible({ timeout: 60_000 });
  await pair(
    page,
    "family-header",
    page
      .getByRole("heading", { level: 1, name: /Alcohols/ })
      .locator("xpath=.."),
    ref.locator(".panel .ph"),
  );
});

test.describe("phone portrait (Pixel 7)", () => {
  test.use({ ...PIXEL });
  test("first view (fixture and demo), top bar, exam chip menu", async ({
    page,
  }) => {
    test.setTimeout(480_000);
    mkdirSync(OUT, { recursive: true });
    const ref = await referencePage(page);
    await openMapPhone(page);
    await page.waitForTimeout(1500);
    await pair(
      page,
      "phone-first-view-fixture",
      page,
      ref.locator(".phone").first(),
    );
    await pair(
      page,
      "phone-top-bar",
      page.locator("header").first(),
      ref.locator(".ptop"),
    );
    await examChip(page).tap();
    await expect(page.getByRole("menuitemradio").first()).toBeVisible();
    await pair(page, "exam-menu-phone", page, ref.locator(".menu"));
    await page.keyboard.press("Escape");
  });

  test("first view of the demo", async ({ page }) => {
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    const ref = await referencePage(page);
    await openPhoneApp(page);
    await loadDemo(page);
    await page
      .getByRole("navigation", { name: "Home" })
      .getByRole("button", { name: "Map" })
      .tap();
    await expect(page.getByRole("group", { name: NAVIGATOR })).toBeVisible({
      timeout: 90_000,
    });
    await leaveChapters(page);
    await page.waitForTimeout(1800);
    await pair(
      page,
      "phone-first-view-demo",
      page,
      ref.locator(".phone").first(),
    );
  });
});

test.describe("phone landscape (Pixel 7)", () => {
  test.use({ ...PIXEL_L });
  test("the panel beside the map", async ({ page }) => {
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    const ref = await referencePage(page);
    await openMapPhone(page);
    await page.waitForTimeout(1200);
    await page
      .locator(`svg [data-node-id="${await phoneFamily(page)}"]`)
      .first()
      .tap();
    await page.waitForTimeout(1500);
    await pair(
      page,
      "phone-landscape-panel-beside-map",
      page,
      ref.locator(".phone").first(),
    );
  });
});
