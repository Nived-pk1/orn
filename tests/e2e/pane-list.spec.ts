/**
 * Step 8.4e, B4 (STUDIO build, own-data fixture, 1280 x 800): the A-to-B list is never clipped. It scrolls INSIDE its pane, and its last card is
 * fully reachable while the import toast is showing (the toast never lies over it).
 */
import { expect, test } from "./fixtures";
import { openMapDesktop } from "./map-layout-kit";
import { clickToolbar } from "./map-toolbar-kit";

test.describe("the A-to-B pane", () => {
  test.use({ actionTimeout: 60_000 });

  test("its last card is fully reachable at 1280 x 800 with a toast showing", async ({ page }) => {
    test.setTimeout(400_000);
    await openMapDesktop(page);
    await expect(page.getByText(/^Imported \d+ records/), "the import toast is showing").toBeVisible();
    await clickToolbar(page, "From A to B");
    const panel = page.getByRole("complementary", { name: "From A to B" });
    await expect(panel).toBeVisible();
    const from = page.getByRole("combobox", { name: "From" });
    const to = page.getByRole("combobox", { name: "To" });
    const values = await from.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ""));
    const cards = panel.getByRole("list", { name: "Chains" }).locator("> li");
    let most = 0;
    for (const a of values) {
      await from.selectOption(a);
      for (const b of values) {
        if (a === b) continue;
        await to.selectOption(b);
        most = Math.max(most, await cards.count());
        if (most >= 3) break;
      }
      if (most >= 3) break;
    }
    expect(most, "the fixture has a pair of families with several chains").toBeGreaterThanOrEqual(2);
    const last = cards.last();
    await last.scrollIntoViewIfNeeded();
    const pane = await panel.boundingBox();
    const card = await last.boundingBox();
    const toast = await page.getByText(/^Imported \d+ records/).boundingBox();
    if (pane === null || card === null || toast === null) throw new Error("no boxes");
    expect(card.y + card.height, "the last card ends inside the pane").toBeLessThanOrEqual(pane.y + pane.height + 1);
    expect(card.y, "and starts inside it").toBeGreaterThanOrEqual(pane.y - 1);
    expect(card.y + card.height, "and above the viewport edge").toBeLessThanOrEqual(800);
    const overlaps = card.x < toast.x + toast.width && toast.x < card.x + card.width && card.y < toast.y + toast.height && toast.y < card.y + card.height;
    expect(overlaps, "the toast does not lie over the last card").toBe(false);
  });
});
