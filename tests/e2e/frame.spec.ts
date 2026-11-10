/**
 * The app frame takes less room (step 8.4a, Part C2), Studio with one notice showing: the map area is at least 640 px tall and 1100 px wide
 * at 1280x800 with the rail shown (1220 px with it hidden) and at least 840 px tall at 1920x1000; the header is 44 px, the status bar at most
 * 24 px; the rail's Collapse button shrinks it to a 56 px icon rail and the choice is remembered after a reload (step 8.4d replaced the 8.4a
 * Hide and its ☰ menu); the Find box uses the UI font. Step 8.4d adds: the breadcrumb, Ctrl K and the search box, the skip link, the tab title.
 * NOTE (honest): the rail-width test was written red first; the rest was written AFTER the source, so each rule was broken once and seen red (step 8.4d close).
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { loadDemo, openApp } from "./kit";
import { shotsDir } from "./editor-kit";

const STUDIO =
  process.env.ORN_BASE_URL?.replace(/\/+$/, "") ?? "http://127.0.0.1:4173";
test.use({ baseURL: STUDIO, actionTimeout: 60_000 });

const drawing = (page: Page) =>
  page.locator("[data-map-room] div[aria-busy]").first();

test("1280x800: the map area, the rail and its Collapse button, the bars", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(
    page.getByRole("group", { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("region", { name: "Notices" })).toBeVisible();
  const header = await page.locator("header").boundingBox();
  expect(header?.height ?? 999, "header height").toBeLessThanOrEqual(44.5);
  expect(header?.height ?? 0, "header height").toBeGreaterThanOrEqual(43.5);
  const status = await page.locator("footer").boundingBox();
  await page
    .locator("footer")
    .screenshot({ path: `${shotsDir()}/status-bar-close-up-1280.png` });
  expect(status?.height ?? 999, "status bar height").toBeLessThanOrEqual(24.5);
  const shown = await drawing(page).boundingBox();
  expect(shown?.height ?? 0, "map height").toBeGreaterThanOrEqual(640);
  // step 8.4d: the rail is 168 px below a 1440 px viewport (188 px from 1440), so the map is 1280 - 168 = 1112 px wide
  expect(shown?.width ?? 0, "map width with the rail").toBeGreaterThanOrEqual(
    1100,
  );
  const rail = page.getByRole("navigation", { name: "Modes" });
  const railBox = await rail.boundingBox();
  for (const row of await rail.getByRole("button").all()) {
    const box = await row.boundingBox();
    if (box !== null && (await row.textContent()) !== "Collapse")
      expect(box.height, "a rail row").toBeLessThanOrEqual(33);
  }
  expect(
    railBox?.width ?? 999,
    "the rail is 168 px wide below 1440 px",
  ).toBeLessThanOrEqual(170);
  expect(railBox?.width ?? 0).toBeGreaterThanOrEqual(166);
  await rail.getByRole("button", { name: "Collapse" }).click();
  await expect(rail.getByRole("button", { name: "Expand" })).toBeVisible();
  const narrow = await rail.boundingBox();
  expect(
    narrow?.width ?? 999,
    "the collapsed rail is 56 px wide",
  ).toBeLessThanOrEqual(58);
  expect(narrow?.width ?? 0).toBeGreaterThanOrEqual(54);
  await page.screenshot({
    path: `${shotsDir()}/frame-rail-collapsed-1280x800.png`,
  });
  const wider = await drawing(page).boundingBox();
  expect(
    wider?.width ?? 0,
    "map width with the rail collapsed",
  ).toBeGreaterThanOrEqual(1220);
  await page.waitForTimeout(1000); // the choice is saved after a short delay (a reload is not a flush)
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Organic Reaction Navigator" }),
  ).toBeAttached();
  await expect(rail.getByRole("button", { name: "Expand" })).toBeVisible({
    timeout: 60_000,
  }); // remembered
  await rail.getByRole("button", { name: "Expand" }).click();
  await expect(rail.getByRole("button", { name: "Collapse" })).toBeVisible();
});

test("the rail is 168 px wide at 1280 and 188 px at 1440", async ({ page }) => {
  test.setTimeout(300_000);
  await openApp(page);
  for (const [width, expected] of [
    [1280, 168],
    [1439, 168],
    [1440, 188],
  ] as const) {
    await page.setViewportSize({ width, height: 800 });
    const box = await page
      .getByRole("navigation", { name: "Modes" })
      .boundingBox();
    expect(Math.round(box?.width ?? 0), `rail width at ${width}`).toBe(
      expected,
    );
  }
});

test("1920x1000: the map area is at least 840 px tall; the Find box uses the UI font", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openApp(page);
  await loadDemo(page);
  await expect(
    page.getByRole("group", { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ }),
  ).toBeVisible({ timeout: 60_000 });
  const map = await drawing(page).boundingBox();
  expect(map?.height ?? 0, "map height at 1920x1000").toBeGreaterThanOrEqual(
    840,
  );
  const status = await page.locator("footer").boundingBox();
  expect(status?.height ?? 999).toBeLessThanOrEqual(24.5);
  const family = await page
    .getByRole("combobox", { name: "Find a family" })
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).not.toMatch(/mono/i);
});

// Step 8.4b, reviewer round, 2d (written red first): the status bar has a separator between ALL items, the Layout notes button included.
test("the status bar: a rule before every item but the first", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(
    page.getByRole("group", { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ }),
  ).toBeVisible({ timeout: 60_000 });
  const items = await page.evaluate(() => {
    const bar = document.querySelector("footer");
    if (bar === null) return [];
    const leaves = [
      ...bar.querySelectorAll(
        '[data-short-item], section > button:not([aria-label="Status details"]), footer > :not(section) > *',
      ),
    ];
    const own =
      [...bar.querySelectorAll("[data-short-item]")].length === 0 ? [] : leaves;
    return own
      .map((el) => ({
        text: (el.textContent ?? "").slice(0, 30),
        rule: parseFloat(getComputedStyle(el).borderLeftWidth),
        x: el.getBoundingClientRect().x,
      }))
      .sort((a, b) => a.x - b.x);
  });
  expect(items.length, "the bar has several items").toBeGreaterThan(4);
  expect(
    items
      .slice(1)
      .filter((item) => item.rule < 1)
      .map((item) => item.text),
    "items with no rule before them",
  ).toEqual([]);
});

// Step 8.4d, Part C: the top bar and the shortcuts.
test("the breadcrumb, the search box, Ctrl K, the skip link and the tab title", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(
    page.getByRole("group", { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ }),
  ).toBeVisible({ timeout: 60_000 });
  // the skip link is the first stop of Tab and moves the focus into the main area
  await page.reload(); // a fresh page: the first Tab starts from the top of the document (a click would move the starting point)
  await expect(
    page.getByRole("heading", { level: 1, name: "Organic Reaction Navigator" }),
  ).toBeAttached();
  await expect(page.getByRole("navigation", { name: "Modes" })).toBeVisible({
    timeout: 60_000,
  });
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  // the breadcrumb names the view; a selected family adds its name; the tab title follows
  const crumb = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumb).toHaveText("Map");
  await expect(page).toHaveTitle("Map · ORN");
  await page.locator('svg [data-node-id="cls_alcohols"]').click();
  await expect(crumb).toContainText("Alcohols");
  await expect(page).toHaveTitle("Alcohols · Map · ORN");
  // the search box says what it does and opens the palette; Esc closes it; Ctrl K opens it again with the places to go
  const box = page.getByRole("button", { name: "Search or jump to…" });
  await expect(box).toContainText("Ctrl K");
  await box.click();
  const palette = page.getByRole("dialog", { name: "Search" });
  await expect(palette).toBeVisible();
  await expect(
    palette.getByRole("option", { name: "Go to Reactions" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    palette.getByRole("option", { name: "Back up your data" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await page.keyboard.press("Control+k");
  await expect(palette).toBeVisible();
  await palette.getByRole("option", { name: "Go to Reactions" }).click();
  await expect(page).toHaveTitle(/^Reactions · ORN$|· Reactions · ORN$/);
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText("Reactions");
});
