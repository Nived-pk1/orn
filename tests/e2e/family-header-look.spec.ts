/**
 * Step 8.4f, L4 (STUDIO build, Chromium, the demo, 1280 x 800): the family page header is the reference page pattern: the label "Family", the title with
 * its formula, one summary line, then "Made from" and "Turns into" as two labelled groups of chips (a family dot, the name, the count). No tinted block with a
 * coloured left bar; a chip still takes the reader to that family's group.
 */
import { expect, test } from "./fixtures";
import { loadDemo, openApp } from "./kit";

test("family page header: label, title, summary, two labelled chip groups, no tinted block", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(page.getByRole("group", { name: /^Navigator:/ })).toBeVisible();
  await page.locator('svg [data-box="hub"]').first().dblclick();
  const pageRegion = page.getByRole("region", { name: /^Family page:/ });
  await expect(pageRegion).toBeVisible();
  const header = pageRegion.locator("h1").locator("xpath=..");
  const look = await header.evaluate((el) => {
    const s = getComputedStyle(el);
    const label = el.querySelector("p");
    const chips = [...el.querySelectorAll("button")].map((b) => {
      const c = getComputedStyle(b);
      const dot = getComputedStyle(b, "::before");
      return {
        radius: Number.parseFloat(c.borderTopLeftRadius),
        dot: dot.content,
        dotWidth: dot.width,
      };
    });
    return {
      background: s.backgroundColor,
      leftBar: s.borderLeftWidth,
      label: label?.textContent ?? "",
      labels: [...el.querySelectorAll("p")].map((p) => p.textContent ?? ""),
      chips,
    };
  });
  expect(look.background, "no tinted block").toBe("rgba(0, 0, 0, 0)");
  expect(look.leftBar, "no coloured left bar").toBe("0px");
  expect(look.label.startsWith("Family"), "the label says Family").toBe(true);
  expect(look.labels).toEqual(
    expect.arrayContaining(["Made from", "Turns into"]),
  );
  expect(look.chips.length).toBeGreaterThan(0);
  for (const chip of look.chips) {
    expect(chip.radius, "a pill chip").toBeGreaterThanOrEqual(12);
    expect(chip.dot, "with a family dot").not.toBe("none");
    expect(chip.dotWidth).toBe("8px");
  }
});
