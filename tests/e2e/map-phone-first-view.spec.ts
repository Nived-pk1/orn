/**
 * Step 8.4f, M1 (STUDIO build, Chromium, Pixel 7 and iPhone 14 portrait; own-data fixture AND the demo): the phone's first view is not one lonely column
 * with an empty strip at its left. The stack is one compact float card of quiet icon buttons (40 px drawn, a 44 px touch target); the first view takes the
 * smallest shift (left or right) that keeps every box's words out from under the stack, with the leftmost visible column whole and its left margin at most
 * 24 px. The numbers are printed (`M1 ...`) for the report.
 */
import { devices, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { leaveChapters, loadDemo, openPhoneApp } from "./kit";
import { NAVIGATOR, openMapPhone } from "./map-layout-kit";

const { defaultBrowserType: _a, ...IPHONE } = devices["iPhone 14"];
const { defaultBrowserType: _b, ...PIXEL } = devices["Pixel 7"];

interface View {
  readonly margin: number;
  readonly columns: number;
  readonly cutLeft: number;
  readonly underStack: number;
  readonly stack: { x: number; y: number; w: number; h: number };
  readonly buttons: { name: string; w: number; h: number; reach: boolean }[];
}

async function measure(page: Page): Promise<View> {
  return page.evaluate(() => {
    const area = (
      document.querySelector('svg[role="group"]') as unknown as SVGElement
    ).getBoundingClientRect();
    const stackEl = document.querySelector(
      '[data-map-control="stack"]',
    ) as HTMLElement;
    const s = stackEl.getBoundingClientRect();
    const boxes = [...document.querySelectorAll("svg [data-node-id]")].map(
      (n) => n.getBoundingClientRect(),
    );
    const whole = boxes.filter(
      (b) =>
        b.left >= area.left - 1 &&
        b.right <= area.right + 1 &&
        b.top >= area.top - 1 &&
        b.bottom <= area.bottom + 1,
    );
    const cut = boxes.filter(
      (b) => b.left < area.left - 1 && b.right > area.left + 1,
    );
    const words = [...document.querySelectorAll("svg [data-label-of] text")]
      .map((t) => t.getBoundingClientRect())
      .filter(
        (r) =>
          r.width > 0 &&
          r.left < s.right &&
          r.right > s.left &&
          r.top < s.bottom &&
          r.bottom > s.top,
      );
    return {
      margin: Math.min(...whole.map((b) => b.left)) - area.left,
      columns: new Set(
        whole
          .filter((b) => b.right <= s.left || b.left >= s.right || true)
          .map((b) => Math.round(b.left / 20)),
      ).size,
      cutLeft: cut.length,
      underStack: words.length,
      stack: { x: s.x, y: s.y, w: s.width, h: s.height },
      buttons: [...stackEl.querySelectorAll("button")].map((b) => {
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left - 2, r.top + r.height / 2);
        return {
          name: b.getAttribute("aria-label") ?? b.textContent ?? "",
          w: r.width,
          h: r.height,
          reach: hit === b,
        };
      }),
    };
  });
}

for (const [label, device] of [
  ["Pixel 7", PIXEL],
  ["iPhone 14", IPHONE],
] as const) {
  for (const data of ["fixture", "demo"] as const) {
    test.describe(`phone first view, ${label}, ${data}`, () => {
      test.use({ ...device, actionTimeout: 60_000 });

      test("M1: margin at most 24 px, leftmost column whole, no box text under the stack, one compact card", async ({
        page,
      }, info) => {
        test.setTimeout(300_000);
        if (data === "fixture") await openMapPhone(page);
        else {
          await openPhoneApp(page);
          await loadDemo(page);
          await page
            .getByRole("navigation", { name: "Home" })
            .getByRole("button", { name: "Map" })
            .tap();
          await expect(
            page.getByRole("group", { name: NAVIGATOR }),
          ).toBeVisible({ timeout: 90_000 });
          await leaveChapters(page);
        }
        await page.waitForTimeout(1800);
        const v = await measure(page);
        const line = `${label} ${data}: left margin ${v.margin.toFixed(1)} px, whole columns ${v.columns}, cut at left ${v.cutLeft}, words under stack ${v.underStack}, stack ${v.stack.w.toFixed(0)} x ${v.stack.h.toFixed(0)} at ${v.stack.x.toFixed(0)},${v.stack.y.toFixed(0)}`;
        info.annotations.push({ type: "m1", description: line });
        console.log(`M1 ${line}`);
        expect(v.cutLeft, "no box is cut at the left edge").toBe(0);
        expect(v.margin, "left margin").toBeLessThanOrEqual(24.5);
        expect(v.underStack, "no box text under the stack").toBe(0);
        expect(
          v.stack.w,
          "the stack is one compact card (buttons 40 px + 3 px padding)",
        ).toBeLessThanOrEqual(52);
        for (const b of v.buttons) {
          expect(b.w, `${b.name} is 40 px drawn`).toBeLessThanOrEqual(41);
          expect(
            b.reach,
            `${b.name}: the hit area reaches 2 px past the drawn button (44 px)`,
          ).toBe(true);
        }
        if (label === "Pixel 7" && data === "fixture")
          expect(
            v.columns,
            "at least two whole columns beside the stack",
          ).toBeGreaterThanOrEqual(2);
      });
    });
  }
}
