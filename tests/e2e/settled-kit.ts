/**
 * Waits on STATE, not on time (step T, T1.4): "the map has stopped moving" is the map area's size and the world's zoom and offset being
 * identical for N animation frames in a row, and so are the boxes of the floating map controls (`[data-map-control]`: bars, stack, hint pill). It replaces the fixed sleeps that stood for "the layout and the refit have happened": a sleep
 * that is enough in Chromium is not in WebKit (the pane there opens a moment later). Bounded: gives up with a message after MAX_FRAMES.
 */
import type { Page } from '@playwright/test';

const MAX_FRAMES = 900;

export async function viewSettled(page: Page, frames = 8): Promise<void> {
  const ok = await page.evaluate(
    ([still, limit]) =>
      new Promise<boolean>((resolve) => {
        const key = (): string => {
          const area = document.querySelector('svg[role="group"]')?.getBoundingClientRect();
          const world = document.querySelector('svg [data-world]') as SVGGraphicsElement | null;
          const m = world?.getScreenCTM();
          const controls = [...document.querySelectorAll('[data-map-control]')].map((el) => {
            const r = el.getBoundingClientRect();
            return `${r.x},${r.y},${r.width},${r.height}`;
          });
          return `${area?.width}x${area?.height}|${m?.a}|${m?.e}|${m?.f}|${controls.join(';')}`;
        };
        let last = key();
        let same = 0;
        let seen = 0;
        const tick = (): void => {
          const now = key();
          same = now === last ? same + 1 : 0;
          last = now;
          seen += 1;
          if (same >= (still as number)) resolve(true);
          else if (seen > (limit as number)) resolve(false);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    [frames, MAX_FRAMES] as const,
  );
  if (!ok) throw new Error(`the map did not settle in ${MAX_FRAMES} frames`);
}

/**
 * "Nothing is animating": no CSS animation or transition with an end is running for N frames in a row (a looping one, like a loading shimmer, is not
 * waited for). It stands for the short sleeps that let a menu, a colour-scheme switch or a toast finish before a screenshot or a measurement.
 */
export async function paintSettled(page: Page, frames = 3): Promise<void> {
  const ok = await page.evaluate(
    ([still, limit]) =>
      new Promise<boolean>((resolve) => {
        let quiet = 0;
        let seen = 0;
        const tick = (): void => {
          const running = document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity).length;
          quiet = running === 0 ? quiet + 1 : 0;
          seen += 1;
          if (quiet >= (still as number)) resolve(true);
          else if (seen > (limit as number)) resolve(false);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    [frames, MAX_FRAMES] as const,
  );
  if (!ok) throw new Error(`the page kept animating for ${MAX_FRAMES} frames`);
}
