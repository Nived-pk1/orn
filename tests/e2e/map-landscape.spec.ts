/**
 * Step 8.4e, Part E (STUDIO build, own-data fixture, Chromium, Pixel 7 landscape 915 x 412 and iPhone 14 landscape 844 x 390): the phone held sideways.
 * One top row of at most 44 px (the notices live in it, not in a row of their own); the five tabs are a 56 px icon column at the left, each named;
 * the map's floating controls stay below the top row; the map area is at least 60% of the viewport height; the inspector opens as a panel at the
 * right (at most 60% of the width) with the map visible beside it (at least 40%). Before (session 4): map 174 / 154 px high with the frame, 113 / 91 px
 * with a sheet, family titles 6.1 px.
 */
import { devices, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { boxTitlePx } from "./box-text";
import { phoneFamily, openMapPhone } from "./map-layout-kit";

const { defaultBrowserType: _a, ...IPHONE } = devices["iPhone 14 landscape"];
const { defaultBrowserType: _b, ...PIXEL } = devices["Pixel 7 landscape"];

/** A value that must be there (a test line, never a guess). */
function need<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error("expected a value");
  return value;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const rectOf = (page: Page, selector: string): Promise<Rect> =>
  page.evaluate((query) => {
    const r = (
      document.querySelector(query) ?? document.body
    ).getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);

for (const [label, device] of [
  ["Pixel 7 landscape", PIXEL],
  ["iPhone 14 landscape", IPHONE],
] as const) {
  test.describe(`phone landscape (${label})`, () => {
    test.use({ ...device, actionTimeout: 60_000 });

    test("one top row, an icon column, floating controls below the row, a tall map, the inspector beside the map", async ({
      page,
    }, info) => {
      test.setTimeout(300_000);
      await openMapPhone(page);
      await page.waitForTimeout(1200);
      const view = need(page.viewportSize());
      const bar = await rectOf(page, "header");
      const main = await rectOf(page, "main");
      const area = await rectOf(page, 'svg[role="group"]');
      const title = await boxTitlePx(page);
      const tabs = await page.evaluate(() => {
        const nav = (
          document.querySelector('nav[aria-label="Home"]') ?? document.body
        ).getBoundingClientRect();
        return { x: nav.x, w: nav.width, h: nav.height };
      });
      const notes = `${label}: bar ${bar.h.toFixed(0)} px, map ${area.w.toFixed(0)} x ${area.h.toFixed(0)} (${((area.h / view.height) * 100).toFixed(0)}% of the height), title ${title.toFixed(1)} px, tabs ${tabs.w.toFixed(0)} wide`;
      info.annotations.push({ type: "landscape", description: notes });
      console.log(`E ${notes}`);

      // E1: one top row, at most 44 px; nothing between it and the page (the notices are in the row)
      expect(bar.h, "the top row is at most 44 px high").toBeLessThanOrEqual(
        44,
      );
      expect(
        main.y,
        "no notices row between the top row and the page",
      ).toBeLessThanOrEqual(bar.y + bar.h + 1);
      // E2: the five tabs are a 56 px icon column at the left, each named and reachable
      expect(tabs.x, "the column is at the left edge").toBeLessThanOrEqual(1);
      expect(tabs.w, "the column is 56 px wide").toBeLessThanOrEqual(56.5);
      for (const name of ["Chapters", "Families", "Map", "Explore", "Search"]) {
        const item = page
          .getByRole("navigation", { name: "Home" })
          .getByRole("button", { name, exact: true });
        await expect(item, `${name} is in the column`).toBeVisible();
        await expect(item, `${name} has a tooltip`).toHaveAttribute(
          "title",
          name,
        );
        const r = need(await item.boundingBox());
        expect(r.width, `${name} is inside the column`).toBeLessThanOrEqual(
          56.5,
        );
        expect(r.height, `${name} can be hit`).toBeGreaterThanOrEqual(44);
        expect(r.y + r.height, `${name} is on screen`).toBeLessThanOrEqual(
          view.height,
        );
      }
      await expect(
        page
          .getByRole("navigation", { name: "Home" })
          .getByRole("button", { name: "Map", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      // E1: the notices, when there are any, are one control inside the top row; opening them moves nothing
      const notices = page.getByRole("button", { name: /^\d+ notices?\b/ });
      const noticeCount = await notices.count();
      console.log(`E ${label} notices control: ${noticeCount}`);
      if (noticeCount > 0) {
        const n = need(await notices.first().boundingBox());
        expect(
          n.y + n.height,
          "the notices control is inside the top row",
        ).toBeLessThanOrEqual(bar.y + bar.h + 0.5);
        await notices.first().tap();
        await page.waitForTimeout(300);
        const after = await rectOf(page, "main");
        expect(
          after.y,
          "opening the notices does not move the page",
        ).toBeCloseTo(main.y, 0);
        await notices.first().tap();
      }
      // E3: no floating control over the top row; E: the map is most of the screen
      const controls = await page.evaluate(() =>
        [...document.querySelectorAll("[data-map-control]")].map(
          (el) => el.getBoundingClientRect().top,
        ),
      );
      expect(controls.length).toBeGreaterThan(0);
      for (const top of controls)
        expect(
          top,
          "a floating control is below the top row",
        ).toBeGreaterThanOrEqual(bar.y + bar.h - 0.5);
      expect(
        area.h / view.height,
        "the map area is at least 60% of the viewport height",
      ).toBeGreaterThanOrEqual(0.6);

      // E4: the inspector is a panel at the right, at most 60% of the width; the map stays visible beside it
      await page.locator(`svg [data-node-id="${await phoneFamily(page)}"]`).tap();
      const sheet = page
        .getByRole("complementary", { name: /./ })
        .filter({ has: page.getByRole("button", { name: "Close inspector" }) });
      await expect(sheet.first()).toBeVisible();
      await page.waitForTimeout(1200);
      const panel = need(await sheet.first().boundingBox());
      const beside = panel.x - area.x;
      console.log(
        `E ${label} panel: ${JSON.stringify(panel)} map beside it ${beside.toFixed(0)} px`,
      );
      info.annotations.push({
        type: "landscape inspector",
        description: `${label}: panel ${panel.width.toFixed(0)} x ${panel.height.toFixed(0)}, map visible beside it ${beside.toFixed(0)} px (${((beside / view.width) * 100).toFixed(0)}% of the width)`,
      });
      expect(
        panel.x + panel.width,
        "the panel sits at the right edge",
      ).toBeGreaterThanOrEqual(view.width - 1);
      expect(
        panel.width,
        "the panel is at most 60% of the width",
      ).toBeLessThanOrEqual(view.width * 0.6 + 1);
      expect(
        panel.height,
        "the panel is tall, not a strip",
      ).toBeGreaterThanOrEqual(view.height * 0.6);
      expect(
        panel.y,
        "the panel starts at or below the top row",
      ).toBeGreaterThanOrEqual(bar.y + bar.h - 1);
      expect(
        panel.x - area.x,
        "at least 40% of the width of the map stays visible",
      ).toBeGreaterThanOrEqual(view.width * 0.4 - 1);
      // the selected family is not under the panel
      const box = need(
        await page
          .locator(`svg [data-node-id="${await phoneFamily(page)}"]`)
          .first()
          .boundingBox(),
      );
      expect(
        box.x + box.width / 2,
        "the selected family is left of the panel",
      ).toBeLessThanOrEqual(panel.x);
      // with the panel open the map's own controls still do not overlap each other or the panel, and each is reachable
      const rects = await page.evaluate(() =>
        [...document.querySelectorAll("[data-map-control]")]
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              n: el.getAttribute("data-map-control") ?? "",
              x: r.x,
              y: r.y,
              r: r.right,
              b: r.bottom,
              v: getComputedStyle(el).visibility !== "hidden",
            };
          })
          .filter((r) => r.r > r.x && r.v),
      );
      for (const [i, a] of rects.entries()) {
        expect(
          a.r,
          `${label}: a ${a.n} control is not under the panel`,
        ).toBeLessThanOrEqual(panel.x + 1);
        for (const b of rects.slice(i + 1)) {
          const overlap =
            a.x < b.r - 0.5 &&
            b.x < a.r - 0.5 &&
            a.y < b.b - 0.5 &&
            b.y < a.b - 0.5;
          expect(
            overlap,
            `${label}: ${a.n} and ${b.n} controls overlap beside the panel`,
          ).toBe(false);
        }
      }
      const mapNow = await rectOf(page, 'svg[role="group"]');
      info.annotations.push({
        type: "landscape map",
        description: `${label}: map area with the panel open ${mapNow.w.toFixed(0)} x ${mapNow.h.toFixed(0)}`,
      });

      // E5: the other pages use the same top row and icon column (Chapters, Families, Explore, a family page)
      await page.getByRole("button", { name: "Close inspector" }).first().tap();
      const nav = page.getByRole("navigation", { name: "Home" });
      const framed = async (what: string): Promise<void> => {
        await page.waitForTimeout(700);
        const f = await page.evaluate(() => {
          const h = (
            document.querySelector("header") ?? document.body
          ).getBoundingClientRect();
          const m = (
            document.querySelector("main") ?? document.body
          ).getBoundingClientRect();
          return {
            header: h.height,
            mainTop: m.y,
            mainLeft: m.x,
            mainHeight: m.height,
            over: document.documentElement.scrollWidth - window.innerWidth,
          };
        });
        expect(
          f.header,
          `${what}: the top row is at most 44 px`,
        ).toBeLessThanOrEqual(44);
        expect(
          f.mainTop,
          `${what}: the page starts under the top row`,
        ).toBeLessThanOrEqual(45);
        expect(
          f.mainLeft,
          `${what}: the page is beside the icon column`,
        ).toBeGreaterThanOrEqual(55);
        expect(
          f.mainHeight,
          `${what}: the page has room`,
        ).toBeGreaterThanOrEqual(view.height * 0.6);
        expect(f.over, `${what}: no sideways scroll`).toBeLessThanOrEqual(0);
      };
      for (const name of ["Chapters", "Families", "Explore"]) {
        await nav.getByRole("button", { name, exact: true }).tap();
        await framed(name);
      }
      await nav.getByRole("button", { name: "Families", exact: true }).tap();
      await page.locator("main button[class*=card]").first().tap();
      await framed("Family page");
    });
  });
}
