/**
 * Step 8.4e, C1: a click between the two lines of a two-way pair selects the NEARER line (the hit bands are at least 16 px wide, so near the middle
 * of a pair they overlap and the browser would give the click to whichever line is drawn last). STUDIO build, the pair fixture of map-marks.
 */
import { expect, test } from "./fixtures";
import { openMapDesktop } from "./map-layout-kit";
import { PAIR_DATA } from "./map-marks-kit";

const LINES =
  'svg [data-layer="edges"] [data-edge-id][data-from="cls_family-08"][data-to="cls_family-13"], svg [data-layer="edges"] [data-edge-id][data-from="cls_family-13"][data-to="cls_family-08"]';

test("a click 40% of the way from one line of a pair to the other selects the nearer line, for both lines", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await openMapDesktop(page, PAIR_DATA());
  await page
    .getByRole("combobox", { name: "Chapter" })
    .selectOption("top_chapter-4");
  await page.waitForTimeout(900);
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole("button", { name: "Zoom out" }).click();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(900);
  const ids = await page
    .locator(LINES)
    .evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-edge-id") ?? ""),
    );
  expect(ids).toHaveLength(2);
  // for each line a point where the pair is at most 14 px apart and nothing but the two lines is under it, and the point 40% of the way to the other line
  const spots = await page.evaluate((pair) => {
    const pathOf = (id: string) =>
      document.querySelector(
        `svg [data-layer="edges"] [data-edge-id="${id}"] > path:not([data-hit])`,
      ) as unknown as SVGPathElement;
    const at = (path: SVGPathElement, f: number) => {
      const m = path.getScreenCTM() as DOMMatrix;
      const p = path.getPointAtLength(path.getTotalLength() * f);
      return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
    };
    const [a, b] = pair.map(pathOf) as [SVGPathElement, SVGPathElement];
    const out: {
      gap: number;
      own: string;
      onA: { x: number; y: number };
      towardB: { x: number; y: number };
      onB: { x: number; y: number };
      towardA: { x: number; y: number };
    }[] = [];
    for (const f of [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65]) {
      const pa = at(a, f);
      const pb = at(b, 1 - f); // the other line runs the other way
      const gap = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      const mix = (
        from: { x: number; y: number },
        to: { x: number; y: number },
      ) => ({
        x: from.x + 0.4 * (to.x - from.x),
        y: from.y + 0.4 * (to.y - from.y),
      });
      const probe = [mix(pa, pb), mix(pb, pa)];
      const clear = probe.every(
        (p) =>
          document
            .elementFromPoint(p.x, p.y)
            ?.closest("[data-chip-button],[data-count-of],[data-node-id]") ===
          null,
      );
      if (clear)
        out.push({
          gap,
          own: pair[0] as string,
          onA: pa,
          towardB: mix(pa, pb),
          onB: pb,
          towardA: mix(pb, pa),
        });
    }
    return out;
  }, ids);
  expect(
    spots.length,
    "a place between the lines with no chip or box",
  ).toBeGreaterThan(0);
  const spot = spots[0] as (typeof spots)[number];
  expect(
    spot.gap,
    "the lines are close: their hit bands overlap",
  ).toBeLessThanOrEqual(16);
  const [idA, idB] = ids as [string, string];
  const overlay = (id: string) =>
    page.locator(`svg [data-overlay="selected"][data-overlay-id="${id}"]`);
  await page.mouse.click(spot.towardB.x, spot.towardB.y);
  await expect(overlay(idA), "nearer to line A").toHaveCount(1);
  await expect(overlay(idB)).toHaveCount(0);
  await page.mouse.click(spot.towardA.x, spot.towardA.y);
  await expect(overlay(idB), "nearer to line B").toHaveCount(1);
  await expect(overlay(idA)).toHaveCount(0);
});
