/**
 * Step 8.4f, L2 (STUDIO build, Chromium, the demo, 1280 x 800): the palette is the reference menu pattern: rows 32 to 36 px high, an icon at the left of every
 * row, the key at the right where a key exists, group labels 12 px / 600. Same dialog, same results, same commands (palette specs elsewhere hold those).
 */
import { expect, test } from "./fixtures";
import { loadDemo, openApp } from "./kit";

test("palette rows: 32 to 36 px, an icon each, the key of Fit, group labels 12/600", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await page.keyboard.press("Control+K");
  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog.getByRole("option").first()).toBeVisible();
  const empty = await dialog.evaluate((root) => ({
    rows: [...root.querySelectorAll('[role="option"]')].map((o) => ({
      h: o.getBoundingClientRect().height,
      icon:
        o.querySelector("span[aria-hidden]")?.getBoundingClientRect().width ??
        0,
    })),
    label: (() => {
      const p = [...root.querySelectorAll("p")].find(
        (x) => x.textContent === "Go to",
      );
      const s = p === undefined ? null : getComputedStyle(p);
      return s === null ? null : { size: s.fontSize, weight: s.fontWeight };
    })(),
  }));
  expect(empty.rows.length).toBeGreaterThan(3);
  for (const row of empty.rows) {
    expect(row.h, "row height").toBeGreaterThanOrEqual(32);
    expect(row.h, "row height").toBeLessThanOrEqual(36.5);
    expect(row.icon, "an icon at the left").toBeGreaterThanOrEqual(16);
  }
  expect(empty.label).toEqual({ size: "12px", weight: "600" });
  await dialog.getByRole("combobox").fill("> fit");
  const fit = dialog.getByRole("option", { name: "Fit", exact: true });
  await expect(fit).toBeVisible();
  await expect(fit.locator("kbd")).toHaveText("0");
  await page.screenshot({ path: "test-results/palette-rows.png" });
});
