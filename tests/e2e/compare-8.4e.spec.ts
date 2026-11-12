/**
 * Step 8.4e, Part G4: pictures of the real app next to the matching part of the design reference (docs/design/ORN_DESIGN_REFERENCE.html, light theme) into
 * screenshots/compare-8.4e/, plus the landscape pictures and ONE test-only dark render (data-theme="dark" set in the test; dark is not switched on). Not an
 * assertion spec: it produces the pictures the reviewer compares. Chromium only, STUDIO build, own-data fixture.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { devices, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { FAMILY_ONE, openMapDesktop, openMapPhone } from "./map-layout-kit";
import { clickNode } from "./map-focus-kit";
import { clickToolbar } from "./map-toolbar-kit";

const OUT = resolve(process.cwd(), "screenshots", "compare-8.4e");
const REFERENCE = `file:///${resolve(process.cwd(), "docs", "design", "ORN_DESIGN_REFERENCE.html").split("\\").join("/")}`;
const { defaultBrowserType: _a, ...PIXEL } = devices["Pixel 7"];
const { defaultBrowserType: _b, ...PIXEL_L } = devices["Pixel 7 landscape"];
test.use({ actionTimeout: 60_000 });

const b64 = (path: string): string => readFileSync(path).toString("base64");

async function pair(
  page: Page,
  name: string,
  app: string,
  ref: string | undefined,
): Promise<void> {
  const other = await page.context().newPage();
  await other.setViewportSize({ width: 1500, height: 900 });
  const refPart =
    ref === undefined
      ? ""
      : `<div><div>REFERENCE</div><img src="data:image/png;base64,${b64(ref)}"></div>`;
  await other.setContent(
    `<body style="margin:0;padding:12px;font:12px sans-serif;background:#ddd"><div style="display:flex;gap:12px;align-items:flex-start"><div><div>APP</div><img src="data:image/png;base64,${b64(app)}"></div>${refPart}</div></body>`,
  );
  await other.screenshot({ path: resolve(OUT, `${name}.png`), fullPage: true });
  await other.close();
}

async function referenceShot(
  page: Page,
  selector: string,
  nth: number,
  name: string,
): Promise<string> {
  const ref = await page.context().newPage();
  await ref.setViewportSize({ width: 1280, height: 900 });
  await ref.goto(REFERENCE);
  const path = resolve(OUT, `ref-${name}.png`);
  await ref.locator(selector).nth(nth).screenshot({ path });
  await ref.close();
  return path;
}

async function shot(
  page: Page,
  name: string,
  selector?: string,
  nth = 0,
): Promise<void> {
  const app = resolve(OUT, `app-${name}.png`);
  await page.screenshot({ path: app });
  await pair(
    page,
    name,
    app,
    selector === undefined
      ? undefined
      : await referenceShot(page, selector, nth, name),
  );
}

test.describe("desktop 1280 x 800", () => {
  test("map with nothing selected, a family and its panel, an arrow, From A to B, and one dark render", async ({
    page,
  }) => {
    test.setTimeout(480_000);
    mkdirSync(OUT, { recursive: true });
    await openMapDesktop(page);
    await shot(page, "desktop-map-nothing-selected", ".app", 0);
    await clickNode(page, page.locator(`svg [data-node-id="${FAMILY_ONE}"]`));
    if (
      (await page.getByRole("button", { name: "Hide inspector" }).count()) === 0
    )
      await page.getByRole("button", { name: "Show inspector" }).click();
    await page.waitForTimeout(1200);
    await shot(page, "desktop-map-family-and-panel", ".app", 0);
    // the one dark render: the same view, data-theme="dark" set here only
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-theme", "dark"),
    );
    await page.waitForTimeout(500);
    await page.screenshot({
      path: resolve(OUT, "dark-desktop-map-family-and-panel.png"),
    });
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-theme", "light"),
    );
    // From A to B with a chain
    await clickToolbar(page, "From A to B");
    const panel = page.getByRole("complementary", { name: "From A to B" });
    await expect(panel).toBeVisible();
    const from = page.getByRole("combobox", { name: "From" });
    const to = page.getByRole("combobox", { name: "To" });
    const values = await from
      .locator("option")
      .evaluateAll((os) =>
        os.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ""),
      );
    const cards = panel.getByRole("list", { name: "Chains" }).locator("> li");
    let found = false;
    for (const a of values) {
      await from.selectOption(a);
      for (const b of values) {
        if (a === b) continue;
        await to.selectOption(b);
        if ((await cards.count()) >= 1) {
          found = true;
          break;
        }
      }
      if (found) break;
    }
    expect(found, "a pair with a chain").toBe(true);
    await page.waitForTimeout(800);
    await shot(page, "desktop-a-to-b-pane", ".panel", 1);
    // an arrow of the chain: its pane (with 16 arrows the map draws none, the chain draws its own)
    await page
      .locator("svg [data-edge-id] [data-hit]")
      .first()
      .click({ force: true });
    await page.waitForTimeout(1000);
    await shot(page, "desktop-arrow-pane", ".panel", 1);
  });
});

test.describe("phone portrait (Pixel 7)", () => {
  test.use({ ...PIXEL });
  test("map with nothing selected, then a family with the peek", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    await openMapPhone(page);
    await page.waitForTimeout(1200);
    await shot(page, "phone-portrait-map-nothing-selected", ".phone", 0);
    await page.locator(`svg [data-node-id="${FAMILY_ONE}"]`).first().tap();
    await page.waitForTimeout(1500);
    await shot(page, "phone-portrait-map-family-and-peek", ".phone", 0);
  });
});

test.describe("phone landscape (Pixel 7)", () => {
  test.use({ ...PIXEL_L });
  test("map, panel beside the map, full map, a family page", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    await openMapPhone(page);
    await page.waitForTimeout(1200);
    await shot(page, "phone-landscape-map", ".phone", 0);
    await page.locator(`svg [data-node-id="${FAMILY_ONE}"]`).first().tap();
    await page.waitForTimeout(1500);
    await shot(page, "phone-landscape-panel-beside-map", ".phone", 0);
    await page.getByRole("button", { name: "Close inspector" }).first().tap();
    await page.getByRole("button", { name: "Full map", exact: true }).tap();
    await expect(page.locator("[data-full-map]")).toHaveCount(1);
    await page.waitForTimeout(1500);
    await shot(page, "phone-landscape-full-map");
    await page
      .getByRole("button", { name: "Exit full map", exact: true })
      .tap();
    await page.locator(`svg [data-node-id="${FAMILY_ONE}"]`).first().dblclick();
    await page.waitForTimeout(2000);
    await shot(page, "phone-landscape-family-page");
  });
});
