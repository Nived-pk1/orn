/**
 * Step 8.4e, C2 (STUDIO build, Pixel 7): on a touch screen the marks scale with the box. A line is at most a quarter of the box title's height
 * (but not under 1.5 px), a chip at most twice the title's height (but not under 18 px). The desktop's marks are unchanged (map-marks.spec).
 */
import { devices } from "@playwright/test";
import { expect, test } from "./fixtures";
import { boxTitlePx } from "./box-text";
import { measureMarks } from "./map-marks-kit";
import { FAMILY_ONE, openMapPhone } from "./map-layout-kit";

const { defaultBrowserType: _pixel, ...PIXEL } = devices["Pixel 7"];

test.describe("marks on a phone", () => {
  test.use({ ...PIXEL, actionTimeout: 60_000 });

  test("lines and chips are sized from the box title (Pixel 7)", async ({ page }) => {
    test.setTimeout(300_000);
    await openMapPhone(page);
    await page.locator(`svg [data-node-id="${FAMILY_ONE}"]`).tap();
    await page.waitForTimeout(1500);
    const title = await boxTitlePx(page);
    const marks = await measureMarks(page);
    expect(marks.strokes.length, "arrows are drawn").toBeGreaterThan(0);
    expect(marks.chips.length, "chips are drawn").toBeGreaterThan(0);
    const strokeMax = Math.max(1.5, 0.25 * title);
    for (const stroke of marks.strokes) expect(stroke, `a line at a title of ${title.toFixed(1)} px`).toBeLessThanOrEqual(strokeMax + 0.05);
    const chipMax = Math.max(18, 2 * title);
    for (const chip of marks.chips) expect(chip.right - chip.left, `a chip at a title of ${title.toFixed(1)} px`).toBeLessThanOrEqual(chipMax + 0.6);
  });
});
