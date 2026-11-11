/**
 * Step 8.4e, Part D5 (STUDIO build, own-data fixture, desktop 1280 x 800, Chromium): THE INTERACTION TABLE of docs/reviews/step-8-4e-notes.md. Every row
 * is exercised once IN full map. A STAYS row works exactly as outside and full map is still on afterwards; a LEAVES row leaves full map first and then
 * goes. Test code only.
 */
import { devices, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { FAMILY_ONE, openMapDesktop, openMapPhone } from "./map-layout-kit";
import { clickNode } from "./map-focus-kit";
import { clickToolbar, openKey } from "./map-toolbar-kit";

const full = (page: Page) => page.locator("[data-full-map]");
const drawing = (page: Page) => page.locator('svg[role="group"]');
const world = (page: Page): Promise<string | null> =>
  page.locator("svg [data-world]").getAttribute("transform");
const scaleOf = async (page: Page): Promise<number> =>
  Number(/scale\(([\d.]+)\)/.exec((await world(page)) ?? "")?.[1] ?? 0);
const selected = (page: Page) => page.getByText(/^Selected: /);

async function enter(page: Page): Promise<void> {
  if ((await full(page).count()) === 1) return;
  await page.getByRole("button", { name: "Full map", exact: true }).click();
  await expect(full(page)).toHaveCount(1);
  await page.waitForTimeout(900);
}
const stays = async (page: Page): Promise<void> =>
  expect(full(page), "full map is still on").toHaveCount(1);
const left = async (page: Page): Promise<void> =>
  expect(full(page), "full map ended").toHaveCount(0);

test.describe("the interaction table, in full map (desktop)", () => {
  test.use({ actionTimeout: 60_000 });

  test("STAYS rows: zoom, Fit, wheel, pan, chapter, Find, From A to B, Key, Selected bar, keyboard, List, canvas menu, pane lists", async ({
    page,
  }) => {
    test.setTimeout(600_000);
    await openMapDesktop(page);
    await enter(page);
    const view = drawing(page);
    const box = (await view.boundingBox()) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    // zoom in / out / Fit, wheel, pan
    const fitted = await scaleOf(page);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect.poll(() => scaleOf(page)).toBeGreaterThan(fitted);
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await expect.poll(() => scaleOf(page)).toBeLessThan(fitted);
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await expect
      .poll(async () => Math.abs((await scaleOf(page)) - fitted))
      .toBeLessThan(0.01);
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.wheel(0, -300);
    await expect.poll(() => scaleOf(page)).toBeGreaterThan(fitted);
    const before = await world(page);
    await page.mouse.move(centre.x, centre.y + 150);
    await page.mouse.down();
    await page.mouse.move(centre.x + 60, centre.y + 170, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => world(page)).not.toBe(before);
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    await stays(page);

    // chapter select
    const chapter = page.getByRole("combobox", { name: "Chapter" });
    const options = await chapter
      .locator("option")
      .evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));
    expect(options.length).toBeGreaterThan(1);
    await chapter.selectOption(options[1] as string);
    await page.waitForTimeout(900);
    await chapter.selectOption(options[0] as string);
    await page.waitForTimeout(900);
    await stays(page);

    // Find a family
    await page.getByRole("button", { name: "Find a family" }).click();
    const find = page.getByRole("combobox", { name: "Find a family" });
    await find.fill("Family 08");
    await expect(selected(page).first()).toContainText("Family 08");
    await stays(page);

    // the Selected bar: Zoom to selection, Clear
    await page.getByRole("button", { name: /^Zoom to / }).click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Clear the selection" }).click();
    await expect(selected(page)).toHaveCount(0);
    await stays(page);

    // a click on a box, on empty canvas (clears); the pane lists
    await clickNode(page, page.locator(`svg [data-node-id="${FAMILY_ONE}"]`));
    await expect(selected(page).first()).toContainText("Family 01");
    const pane = page.getByRole("complementary", { name: "Inspector" });
    await expect(pane).toBeVisible();
    const goNext = pane
      .getByRole("group", { name: "Go next" })
      .getByRole("button")
      .first();
    if ((await goNext.count()) > 0) {
      await goNext.click();
      await page.waitForTimeout(600);
    }
    await stays(page);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 8);
    await stays(page);

    // From A to B (its panel opens over the map), Key (Esc closes the Key only)
    await clickToolbar(page, "From A to B");
    const chain = page.locator("[data-right-pane]");
    await expect(chain).toBeVisible();
    const chainBox = (await chain.boundingBox()) as {
      x: number;
      width: number;
    };
    const paneBox = (await pane.boundingBox()) as { x: number };
    expect(
      chainBox.x + chainBox.width,
      "the A-to-B panel is left of the open pane, not under it",
    ).toBeLessThanOrEqual(paneBox.x + 1);
    await clickToolbar(page, "From A to B");
    await stays(page);
    await openKey(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Key" })).toHaveCount(0);
    await stays(page);

    // the keyboard: Z, + / -, arrows, Enter, Tab
    await clickNode(page, page.locator(`svg [data-node-id="${FAMILY_ONE}"]`));
    await view.focus();
    await page.keyboard.press("z");
    await page.waitForTimeout(500);
    const z0 = await scaleOf(page);
    await page.keyboard.press("+");
    await expect.poll(() => scaleOf(page)).toBeGreaterThan(z0);
    await page.keyboard.press("-");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await stays(page);

    // List / Show the map (More)
    const bar = page.getByRole("toolbar", { name: "Canvas tools" });
    await bar.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "List" }).click();
    await expect(page.locator('[data-view="list"]')).toBeVisible();
    await bar.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Show the map" }).click();
    await expect(drawing(page)).toBeVisible();
    await stays(page);

    // the canvas menu: Zoom in, Fit
    const node = page.locator(`svg [data-node-id="${FAMILY_ONE}"]`);
    await node.click({ button: "right" });
    const nodeMenu = page.getByRole("menu", { name: /^Family 01/ });
    const menu = nodeMenu;
    await expect(menu).toBeVisible();
    const items = await menu.getByRole("menuitem").allTextContents();
    console.log("canvas menu items:", JSON.stringify(items));
    // an arrow row of the node's menu selects that arrow; Show in inspector shows the record
    await menu
      .getByRole("menuitem", { name: /^To Family/ })
      .first()
      .click();
    await expect(selected(page).first()).toContainText("Family 01 to Family");
    await node.click({ button: "right" });
    await nodeMenu.getByRole("menuitem", { name: /Show in inspector/ }).click();
    await stays(page);
    // the empty canvas's menu: Zoom in, Zoom out, Fit
    const empty = { x: box.x + box.width / 2, y: box.y + box.height - 12 };
    for (const name of ["Zoom in", "Zoom out", "Fit"]) {
      await page.mouse.click(empty.x, empty.y, { button: "right" });
      await page
        .getByRole("menu")
        .last()
        .getByRole("menuitem", { name })
        .click();
      await page.waitForTimeout(400);
    }
    await stays(page);
  });

  test("LEAVES rows: double-click a box, Open family, Open reactions, the canvas-menu page items, the Open buttons of the pane leave full map first; Back from that view gives the normal map with the selection and view", async ({
    page,
  }) => {
    test.setTimeout(600_000);
    await openMapDesktop(page);
    const node = page.locator(`svg [data-node-id="${FAMILY_ONE}"]`);
    const overview = page.getByRole("button", { name: "Overview" });
    const back = async (): Promise<void> => {
      await overview.click();
      await expect(drawing(page)).toBeVisible();
      await left(page);
    };

    // double-click a box; the view was moved by the wheel first (not the automatic fit), and comes back the same
    await enter(page);
    const box = (await drawing(page).boundingBox()) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 120); // a little out: the view is no longer the automatic fit, every family stays in view
    await page.waitForTimeout(700);
    const scale = await scaleOf(page);
    await node.dblclick();
    await expect(
      page.getByRole("region", { name: /^Family page: / }),
    ).toBeVisible();
    await left(page);
    await back();
    expect(
      Math.abs((await scaleOf(page)) - scale),
      "the view is as it was",
    ).toBeLessThan(0.02);

    // Open family (the Selected bar)
    await enter(page);
    await clickNode(page, node);
    await expect(selected(page).first()).toContainText("Family 01");
    await page.getByRole("button", { name: "Open family" }).click();
    await expect(
      page.getByRole("region", { name: /^Family page: / }),
    ).toBeVisible();
    await left(page);
    await back();
    await expect(selected(page).first()).toContainText("Family 01"); // the selection survived the round trip

    // the canvas menu's page item
    await enter(page);
    await node.click({ button: "right" });
    await page
      .getByRole("menu")
      .getByRole("menuitem", { name: "Open family page" })
      .click();
    await expect(
      page.getByRole("region", { name: /^Family page: / }),
    ).toBeVisible();
    await left(page);
    await back();

    // an arrow: Open reactions (the Selected bar), and the pane's "Open these n reactions"
    await enter(page);
    await node.click({ button: "right" });
    await page
      .getByRole("menu")
      .getByRole("menuitem", { name: /^To Family/ })
      .first()
      .click();
    await expect(selected(page).first()).toContainText("Family 01 to Family");
    await page.getByRole("button", { name: "Open reactions" }).click(); // the arrow's reactions: the family page, at that arrow
    await left(page);
    await expect(page.getByRole("navigation", { name: "Modes" })).toBeVisible();
    await back();
    await enter(page);
    await node.click({ button: "right" });
    await page
      .getByRole("menu")
      .getByRole("menuitem", { name: /^To Family/ })
      .first()
      .click();
    const open = page
      .getByRole("complementary", { name: "Inspector" })
      .getByRole("button", { name: /^Open these \d+ reactions in Reactions/ });
    await open.click();
    await left(page);
    await page
      .getByRole("navigation", { name: "Modes" })
      .getByRole("button", { name: "Map" })
      .click();
    await expect(drawing(page)).toBeVisible();
  });

  test("Studio: Unanchored reactions and the multi-selection work inside full map (they do not need the frame)", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openMapDesktop(page);
    await enter(page);
    const bar = page.getByRole("toolbar", { name: "Canvas tools" });
    await bar.getByRole("button", { name: "More" }).click();
    const item = page.getByRole("menuitem", { name: /^Unanchored reactions/ });
    await expect(item).toBeVisible();
    // (whether it is enabled depends on the data: the fixture has no unanchored reactions; full map adds no reason of its own)
    if ((await item.getAttribute("aria-disabled")) !== "true")
      await item.click();
    else await page.keyboard.press("Escape");
    await stays(page);
    // shift-click a second family: the multi-selection (its actions are in the bar, at its end)
    await clickNode(page, page.locator(`svg [data-node-id="${FAMILY_ONE}"]`));
    await page
      .locator('svg [data-node-id="cls_family-02"]')
      .click({ modifiers: ["Shift"] });
    await stays(page);
    await page.screenshot({ path: "test-results/full-map-studio-multi.png" });
  });
});

const { defaultBrowserType: _p, ...PIXEL } = devices["Pixel 7"];

test.describe("the interaction table, in full map (phone, Pixel 7 portrait)", () => {
  test.use({ ...PIXEL, actionTimeout: 60_000 });

  test("STAYS rows by touch: the bar (chapter, Find, From A to B), Fit, pinch, Key, Select; a tap on a box; a sheet over the map", async ({
    page,
  }) => {
    test.setTimeout(400_000);
    await openMapPhone(page);
    await page.getByRole("button", { name: "Full map", exact: true }).tap();
    await expect(full(page)).toHaveCount(1);
    await page.waitForTimeout(1200);
    const bar = page.locator("[data-phone-map-bar]");
    const chapter = bar.getByRole("combobox", { name: "Chapter" });
    const options = await chapter
      .locator("option")
      .evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));
    await chapter.selectOption(options[1] as string);
    await page.waitForTimeout(900);
    await chapter.selectOption(options[0] as string);
    await page.waitForTimeout(900);
    await bar.getByRole("button", { name: "Find a family" }).tap();
    await page
      .getByRole("combobox", { name: "Find a family" })
      .fill("Family 08");
    await expect(
      page.getByRole("combobox", { name: "Find a family" }),
    ).toHaveCount(0); // a choice focuses the family and closes the box
    await stays(page);
    await bar.getByRole("button", { name: "From A to B" }).tap();
    await expect(page.locator("[data-right-pane]")).toBeVisible();
    await bar.getByRole("button", { name: "From A to B" }).tap();
    await expect(page.locator("[data-right-pane]")).toHaveCount(0);
    // Fit, and a pinch (Chromium's touch pinch through the protocol)
    const fitted = await scaleOf(page);
    const cdp = await page.context().newCDPSession(page);
    const area = (await drawing(page).boundingBox()) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    await cdp.send("Input.synthesizePinchGesture", {
      x: area.x + area.width / 2,
      y: area.y + area.height / 2,
      scaleFactor: 1.6,
      relativeSpeed: 400,
    });
    await expect.poll(() => scaleOf(page)).toBeGreaterThan(fitted * 1.05);
    await page.getByRole("button", { name: "Fit", exact: true }).tap();
    await expect
      .poll(async () => Math.abs((await scaleOf(page)) - fitted))
      .toBeLessThan(0.02);
    // Key (the Legend dialog), Select (Studio)
    await page.getByRole("button", { name: "Legend" }).tap();
    await expect(page.getByRole("dialog", { name: "Legend" })).toBeVisible();
    await page
      .getByRole("dialog", { name: "Legend" })
      .getByRole("button", { name: /close/i })
      .first()
      .tap();
    await expect(page.getByRole("dialog", { name: "Legend" })).toHaveCount(0);
    const select = page.getByRole("button", { name: /^Select/ }).first();
    if ((await select.count()) > 0) {
      await select.tap();
      await select.tap();
    }
    await stays(page);
    await page.locator('svg [data-node-id="cls_family-08"]').tap();
    await expect(page.locator("aside[data-sheet]:not([hidden])")).toBeVisible();
    await stays(page);
  });
});
