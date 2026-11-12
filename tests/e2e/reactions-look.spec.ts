/**
 * Step 8.4f, L3 (STUDIO build, Chromium, the demo, 1280 x 800): the Reactions view to the design reference: cards are LINK cards (a pointer, hover lifts,
 * the selected one has the accent ring, the name is plain text not a boxed button); compact rows are LIST ROWS in one hairline list (the review mark first,
 * the name, a sub line with the equation, chips, a chevron; the whole row selects); the filters are chips (pills). Same data, same behaviour: the
 * behaviour of selecting, folding and filtering is held by reaction-explorer.spec, examples-fold.spec and reaction-counts.spec.
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { loadDemo, openApp } from "./kit";

const view = (page: Page) =>
  page.getByRole("region", { name: "Reactions", exact: true });

test("Reactions: link cards, list rows, filter chips", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await page
    .getByRole("navigation", { name: "Modes" })
    .getByRole("button", { name: "Reactions", exact: true })
    .click();
  const card = view(page).locator("article[data-reaction-id]").first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  // the filters are chips: a pill, not a box
  const filter = view(page).getByRole("button", { name: /^Type/ });
  expect(
    Number.parseFloat(
      await filter.evaluate((el) => getComputedStyle(el).borderTopLeftRadius),
    ),
    "a pill",
  ).toBeGreaterThanOrEqual(12);
  // link cards
  expect(
    await card.evaluate((el) => getComputedStyle(el).cursor),
    "a link card shows the pointer",
  ).toBe("pointer");
  const resting = await card.evaluate((el) => getComputedStyle(el).boxShadow);
  await card.hover();
  await page.waitForTimeout(400);
  const hovered = await card.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(hovered, "hover lifts the card").not.toBe(resting);
  const name = card.getByRole("button").first();
  const plain = await name.evaluate((el) => {
    const s = getComputedStyle(el);
    return { border: s.borderTopWidth, background: s.backgroundColor };
  });
  expect(plain, "the card's name is plain text, not a boxed button").toEqual({
    border: "0px",
    background: "rgba(0, 0, 0, 0)",
  });
  await card.click({ position: { x: 20, y: 60 } });
  await expect(card).toHaveAttribute("data-selected", "");
  const ring = await card.evaluate((el) => getComputedStyle(el).boxShadow);
  const accent = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--accent)";
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });
  expect(ring, "the selected card has the 2 px accent ring").toContain(accent);
  // compact rows are list rows
  await view(page).getByRole("radio", { name: "Compact" }).check();
  const row = view(page).locator("li[data-reaction-id]").first();
  await expect(row).toBeVisible();
  const look = await row.evaluate((el) => {
    const list = el.parentElement as HTMLElement;
    const l = getComputedStyle(list);
    const r = el.getBoundingClientRect();
    const mark = el
      .querySelector("[data-review-mark]")
      ?.getBoundingClientRect();
    const nameButton = el.querySelector("button") as HTMLElement;
    const n = getComputedStyle(nameButton);
    return {
      listBorder: l.borderTopWidth,
      listRadius: Number.parseFloat(l.borderTopLeftRadius),
      height: r.height,
      markBeforeName:
        mark === undefined
          ? "none"
          : mark.left <= nameButton.getBoundingClientRect().left,
      nameBorder: n.borderTopWidth,
      nameBackground: n.backgroundColor,
      chevron: el.querySelector("[data-chevron]") !== null,
    };
  });
  expect(look.listBorder).toBe("1px");
  expect(look.listRadius).toBeGreaterThanOrEqual(8);
  expect(look.height).toBeGreaterThanOrEqual(40);
  expect(
    look.markBeforeName === true || look.markBeforeName === "none",
    "the review mark leads the row",
  ).toBe(true);
  expect(
    { border: look.nameBorder, background: look.nameBackground },
    "no boxed name button",
  ).toEqual({ border: "0px", background: "rgba(0, 0, 0, 0)" });
  expect(look.chevron, "a chevron at the end").toBe(true);
  // the whole row selects (a click far right of the name)
  const box = await row.boundingBox();
  if (box === null) throw new Error("no row box");
  await page.mouse.click(box.x + box.width - 60, box.y + box.height / 2);
  await expect(row).toHaveAttribute("data-selected", "");
});
