/**
 * Step 8.4f, L1 (STUDIO build, Chromium; the demo): the exam control is the reference chip ("JEE Main" with a chevron, accent) that opens a Menu of the same
 * choices, on the desktop top bar and on the phone top bar. A menu button for the keyboard: Enter / Space open it, the arrows move, Enter picks, Esc closes and
 * returns focus to the chip. Picking an exam changes the scope (the id on the chip) (the reload memory is held by exam-first-run.spec, which now reads the chip).
 */
import { devices } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  chooseExam,
  examChip,
  examChoices,
  expectExamId,
  loadDemo,
  openApp,
  openPhoneApp,
} from "./kit";

const { defaultBrowserType: _p, ...PIXEL } = devices["Pixel 7"];

test.describe("the exam chip (desktop)", () => {
  test("a chip in the accent look; Enter opens, arrows move, Enter picks, Esc returns focus", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await loadDemo(page);
    const chip = examChip(page);
    await expect(chip).toHaveText("All exams");
    const look = await chip.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        background: s.backgroundColor,
        radius: s.borderTopLeftRadius,
        height: el.getBoundingClientRect().height,
        tag: el.tagName,
      };
    });
    expect(look.tag).toBe("BUTTON");
    expect(look.background, "the accent-soft background").not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(Number.parseFloat(look.radius), "a pill").toBeGreaterThan(12);
    expect(look.height, "32 px high").toBeLessThanOrEqual(34);
    expect(await examChoices(page)).toEqual([
      "All exams",
      "JEE Advanced",
      "JEE Main",
    ]);
    await expect(chip, "Esc returned focus to the chip").toBeFocused();
    // the keyboard: Enter opens, ArrowDown moves, Enter picks
    await chip.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(
      page.getByRole("menuitemradio", { name: "All exams" }),
    ).toBeFocused(); // the open menu starts at the exam in use
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByRole("menuitemradio", { name: "JEE Advanced" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(chip).toHaveText("JEE Advanced");
    await expectExamId(page, "exm_jee-advanced");
    await chip.press("Space");
    await expect(
      page.getByRole("menuitemradio", { name: "JEE Advanced" }),
    ).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(chip).toBeFocused();
    await chooseExam(page, "JEE Main");
    await expectExamId(page, "exm_jee-main");
  });
});

test.describe("the exam chip (phone top bar)", () => {
  test.use({ ...PIXEL, actionTimeout: 60_000 });
  test("the chip sits in the top bar between the page name and Search; More is a quiet icon; picking works by tap", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openPhoneApp(page);
    await loadDemo(page);
    const bar = page.getByRole("banner");
    const chip = bar.getByRole("button", { name: /^Exam: / });
    await expect(chip).toBeVisible();
    const boxes = await Promise.all([
      bar.getByRole("heading", { level: 1 }).boundingBox(),
      chip.boundingBox(),
      bar.getByRole("button", { name: "Search" }).boundingBox(),
      bar.getByRole("button", { name: "More" }).boundingBox(),
    ]);
    const [name, c, search, more] = boxes;
    if (!name || !c || !search || !more)
      throw new Error("a top-bar part has no box");
    expect(c.x, "the chip is right of the page name").toBeGreaterThanOrEqual(
      name.x + name.width - 1,
    );
    expect(search.x, "Search is right of the chip").toBeGreaterThanOrEqual(
      c.x + c.width - 1,
    );
    expect(more.x, "More is the last").toBeGreaterThanOrEqual(
      search.x + search.width - 1,
    );
    expect(
      more.x + more.width,
      "nothing runs off the screen",
    ).toBeLessThanOrEqual(412);
    await chip.tap();
    await page
      .getByRole("menuitemradio", { name: "JEE Main", exact: true })
      .tap();
    await expect(chip).toHaveText("JEE Main");
    await expectExamId(page, "exm_jee-main");
  });
});
