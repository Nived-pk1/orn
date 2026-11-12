/**
 * Step 8.4e, Part F (STUDIO build, own-data fixture, Chromium): fluid feel, MEASURED and reported (enforced in Phase 9). No app code is involved.
 *  - From the press on a family to the frame that shows its selection ring: the median of 10, on the Pixel 7 profile and at 1280 x 800 (target under 100 ms). The
 *    spec only fails above 1 s, a hang; the numbers go to the annotations and the console.
 *  - Long tasks (over 50 ms) during those ten presses are counted.
 *  - Rotating the phone keeps the selection, the open sheet or panel and the full-map state.
 */
import { devices, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { FAMILY_ONE, openMapDesktop, openMapPhone } from "./map-layout-kit";

const { defaultBrowserType: _a, ...PIXEL } = devices["Pixel 7"];

interface Fluid {
  __fluid?: Promise<number>;
  __long?: number[];
}

/** Arms a timer that starts at the next pointerdown and stops at the frame after the selection ring of `id` is in the DOM. */
async function arm(page: Page, id: string): Promise<void> {
  await page.evaluate((target) => {
    const w = window as unknown as Fluid;
    w.__fluid = new Promise<number>((resolve) => {
      const down = (event: Event): void => {
        document.removeEventListener("pointerdown", down, true);
        const t0 = event.timeStamp;
        const there = (): boolean =>
          document.querySelector(
            `[data-overlay="selected"][data-overlay-id="${target}"]`,
          ) !== null;
        const painted = (): void => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve(performance.now() - t0)),
          );
        };
        if (there()) return painted();
        const observer = new MutationObserver(() => {
          if (!there()) return;
          observer.disconnect();
          painted();
        });
        observer.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
        });
      };
      document.addEventListener("pointerdown", down, true);
    });
  }, id);
}

async function longTasks(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as Fluid;
    w.__long = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__long?.push(entry.duration);
    }).observe({ type: "longtask", buffered: false });
  });
}

/** Turns the phone: the device metrics change (a window resize is refused while the page is fullscreen). */
async function rotate(
  page: Page,
  width: number,
  height: number,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2.625,
    mobile: true,
  });
}

const median = (values: number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** Two families whose centres are free to press (no floating control over them), the first one FAMILY_ONE when it is free. */
async function pressable(page: Page): Promise<[string, string]> {
  const ids = await page.evaluate(() => {
    const free = (id: string): boolean => {
      const node = document.querySelector(`svg [data-node-id="${id}"]`);
      if (node === null) return false;
      const r = node.getBoundingClientRect();
      const at = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      return at !== null && node.contains(at);
    };
    return [...document.querySelectorAll("svg [data-node-id]")]
      .map((n) => n.getAttribute("data-node-id") ?? "")
      .filter(free);
  });
  const first = ids.includes(FAMILY_ONE) ? FAMILY_ONE : ids[0];
  const second = ids.find((id) => id !== first);
  if (first === undefined || second === undefined)
    throw new Error("fewer than two families can be pressed");
  return [first, second];
}

async function tenPresses(
  page: Page,
  press: (id: string) => Promise<void>,
): Promise<{ median: number; max: number; long: number[] }> {
  await longTasks(page);
  const pair = await pressable(page);
  const times: number[] = [];
  for (let i = 0; i < 10; i++) {
    const id = pair[i % 2] as string;
    await arm(page, id);
    await press(id);
    times.push(
      await page.evaluate(
        () => (window as unknown as Fluid).__fluid as Promise<number>,
      ),
    );
    await page.waitForTimeout(350);
  }
  const long = await page.evaluate(
    () => (window as unknown as Fluid).__long ?? [],
  );
  return { median: median(times), max: Math.max(...times), long };
}

test.describe("fluid feel: press to selection painted", () => {
  test("desktop 1280 x 800: the median of 10 presses", async ({
    page,
  }, info) => {
    test.setTimeout(300_000);
    await openMapDesktop(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(900);
    const result = await tenPresses(page, async (id) => {
      const box = (await page
        .locator(`svg [data-node-id="${id}"]`)
        .first()
        .boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    });
    const line = `desktop 1280 x 800: median ${result.median.toFixed(0)} ms, worst ${result.max.toFixed(0)} ms, ${result.long.length} long tasks`;
    info.annotations.push({ type: "fluid", description: line });
    console.log(`F ${line}`);
    expect(result.max, "no press hangs").toBeLessThan(1000);
  });

  test.describe("Pixel 7", () => {
    test.use({ ...PIXEL, actionTimeout: 60_000 });

    test("the median of 10 taps", async ({ page }, info) => {
      test.setTimeout(300_000);
      await openMapPhone(page);
      await page.waitForTimeout(900);
      const result = await tenPresses(page, async (id) => {
        await page.locator(`svg [data-node-id="${id}"]`).first().tap();
      });
      const line = `Pixel 7: median ${result.median.toFixed(0)} ms, worst ${result.max.toFixed(0)} ms, ${result.long.length} long tasks`;
      info.annotations.push({ type: "fluid", description: line });
      console.log(`F ${line}`);
      expect(result.max, "no tap hangs").toBeLessThan(1000);
    });

    test("rotating keeps the selection, the open sheet and full map", async ({
      page,
    }) => {
      test.setTimeout(300_000);
      await openMapPhone(page);
      await page.waitForTimeout(900);
      await page.locator(`svg [data-node-id="${FAMILY_ONE}"]`).first().tap();
      const sheet = page
        .getByRole("complementary")
        .filter({ has: page.getByRole("button", { name: "Close inspector" }) });
      await expect(sheet.first()).toBeVisible();
      const selected = page.locator(
        `[data-overlay="selected"][data-overlay-id="${FAMILY_ONE}"]`,
      );
      await expect(selected).toHaveCount(1);
      await rotate(page, 839, 412); // portrait to landscape
      await page.waitForTimeout(1200);
      await expect(selected, "the selection survives the rotation").toHaveCount(
        1,
      );
      await expect(sheet.first(), "the sheet is still open").toBeVisible();
      await page.getByRole("button", { name: "Close inspector" }).first().tap();
      await page.getByRole("button", { name: "Full map", exact: true }).tap();
      await expect(page.locator("[data-full-map]")).toHaveCount(1);
      await rotate(page, 412, 839); // and back
      await page.waitForTimeout(1200);
      await expect(
        page.locator("[data-full-map]"),
        "full map survives the rotation",
      ).toHaveCount(1);
      await expect(selected, "the selection survives in full map").toHaveCount(
        1,
      );
    });
  });
});
