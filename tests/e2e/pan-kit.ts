/**
 * Step 8.4e (resume 4): on a phone the first view shows the readable part of a wide map (titles of at least 10 px, slid clear of the buttons), so a named family can
 * lie off the screen. A test that taps one first drags the map until it is in view, as a person would (a mouse drag pans too). Test code only.
 */
import type { Page } from '@playwright/test';

export async function bringIntoView(page: Page, id: string): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    const where = await page.evaluate((key) => {
      const area = (document.querySelector('svg[role="group"]') as unknown as SVGElement).getBoundingClientRect();
      const r = document.querySelector(`svg [data-node-id="${key}"]`)?.getBoundingClientRect();
      if (r === undefined) return undefined;
      const inside = r.left >= area.left + 8 && r.right <= area.right - 8 && r.top >= area.top + 8 && r.bottom <= area.bottom - 8;
      return { inside, dx: area.left + area.width / 2 - (r.left + r.right) / 2, dy: area.top + area.height / 3 - (r.top + r.bottom) / 2, x: area.left + area.width / 2, y: area.top + area.height / 2, w: area.width };
    }, id);
    if (where === undefined || where.inside) return;
    const dx = Math.max(-where.w / 2, Math.min(where.w / 2, where.dx));
    await page.mouse.move(where.x, where.y);
    await page.mouse.down();
    await page.mouse.move(where.x + dx, where.y + Math.max(-200, Math.min(200, where.dy)), { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(250);
  }
}
