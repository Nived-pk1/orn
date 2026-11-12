/**
 * Step 8.4f, L6 (STUDIO build, Chromium, the demo, 1280 x 800): the rail's weights. The active item's label is weight 500 (the others 400); the group labels are
 * the quiet --text-2 colour at 12 px / 600, lighter than the item labels in colour.
 */
import { expect, test } from "./fixtures";
import { loadDemo, openApp } from "./kit";

test("rail: the active label is 500, the others 400; group labels are --text-2 12/600", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  const rail = page.getByRole("navigation", { name: "Modes" });
  const data = await rail.evaluate((nav) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--text-2)";
    document.body.append(probe);
    const quiet = getComputedStyle(probe).color;
    probe.remove();
    const buttons = [
      ...nav.querySelectorAll("button[aria-current], button"),
    ].filter((b) => b.querySelector("span"));
    const label = (b: Element) => {
      const text = [...b.querySelectorAll("span")].find(
        (s) =>
          (s.textContent ?? "").trim() !== "" &&
          s.children.length === 0 &&
          getComputedStyle(s).position !== "absolute",
      );
      return text === undefined ? null : getComputedStyle(text);
    };
    const active = buttons
      .filter((b) => b.getAttribute("aria-current") === "page")
      .map((b) => label(b)?.fontWeight);
    const others = buttons
      .filter((b) => b.getAttribute("aria-current") !== "page")
      .map((b) => `${(b.textContent ?? "").trim()}=${label(b)?.fontWeight}`);
    const groups = [...nav.querySelectorAll("p, h2, h3")].map((g) => {
      const s = getComputedStyle(g);
      return {
        text: g.textContent,
        size: s.fontSize,
        weight: s.fontWeight,
        color: s.color,
      };
    });
    return { quiet, active, others, groups };
  });
  expect(data.active, "the active item's label weight").toEqual(["500"]);
  for (const w of data.others) expect(w, "the other labels").toMatch(/=400$/);
  expect(data.groups.length).toBeGreaterThan(0);
  for (const g of data.groups)
    expect(
      { size: g.size, weight: g.weight, color: g.color },
      g.text ?? "",
    ).toEqual({ size: "12px", weight: "600", color: data.quiet });
});
