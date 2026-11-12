/**
 * Step 8.4e, resume 4 item 6 (STUDIO build, own-data fixture, Chromium): two motions, CSS only. Full map enter and exit run 200 ms (opacity and transform of
 * the drawing, in the lazy full-map stylesheet; entering and leaving name different animations so each one plays); a box has a 120 ms press state on a touch
 * layout (`:active`). Neither runs under reduced motion. The computed styles are the test.
 */
import { devices, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { FAMILY_ONE, openMapDesktop, openMapPhone } from "./map-layout-kit";

const { defaultBrowserType: _a, ...PIXEL } = devices["Pixel 7"];

const drawing = (page: Page) => page.locator('svg[role="group"]');

const animationOf = (page: Page): Promise<{ name: string; duration: string }> =>
  drawing(page).evaluate((el) => ({
    name: getComputedStyle(el).animationName,
    duration: getComputedStyle(el).animationDuration,
  }));

/** The duration of the transition of `opacity` on a family box, "" when it has none. */
async function pressDuration(page: Page): Promise<string> {
  return page.evaluate((id) => {
    const node = document.querySelector(`svg [data-node-id="${id}"]`);
    if (node === null) return "no node";
    const style = getComputedStyle(node);
    const names = style.transitionProperty.split(",").map((s) => s.trim());
    const durations = style.transitionDuration.split(",").map((s) => s.trim());
    const at = names.indexOf("opacity");
    return at < 0 ? "" : (durations[at % durations.length] ?? "");
  }, FAMILY_ONE);
}

test.describe("full map: enter and exit are 200 ms", () => {
  test.use({ actionTimeout: 60_000 });

  test("desktop: the drawing animates in and out; reduced motion has none", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openMapDesktop(page);
    await page.getByRole("button", { name: "Full map", exact: true }).click();
    await expect(page.locator("[data-full-map]")).toHaveCount(1);
    expect(await animationOf(page), "entering").toEqual({
      name: "orn-full-map-in",
      duration: "0.2s",
    });
    await page
      .getByRole("button", { name: "Exit full map", exact: true })
      .click();
    await expect(page.locator("[data-full-map]")).toHaveCount(0);
    expect(await animationOf(page), "leaving").toEqual({
      name: "orn-full-map-out",
      duration: "0.2s",
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect((await animationOf(page)).name, "reduced motion: leaving").toBe(
      "none",
    );
    await page.getByRole("button", { name: "Full map", exact: true }).click();
    await expect(page.locator("[data-full-map]")).toHaveCount(1);
    expect((await animationOf(page)).name, "reduced motion: entering").toBe(
      "none",
    );
  });
});

test.describe("the press state of a box", () => {
  test.describe("touch (Pixel 7)", () => {
    test.use({ ...PIXEL, actionTimeout: 60_000 });

    test("a box eases its opacity over 120 ms; none with reduced motion", async ({
      page,
    }) => {
      test.setTimeout(300_000);
      await openMapPhone(page);
      expect(await pressDuration(page), "touch: 120 ms").toBe("0.12s");
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(await pressDuration(page), "reduced motion: none").not.toBe(
        "0.12s",
      );
    });
  });

  test("a mouse has no press transition", async ({ page }) => {
    test.setTimeout(300_000);
    await openMapDesktop(page);
    expect(await pressDuration(page)).not.toBe("0.12s");
  });
});
