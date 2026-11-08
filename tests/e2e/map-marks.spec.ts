/**
 * Step 8.4b, the STUDIO build, own-data layout fixture: the marks people read or click are the same size on the SCREEN at every zoom (A), each
 * direction of a two-way pair can be chosen (B), a busy selection draws no hairball (C), and lines never run through text (D).
 */
import { expect, test } from './fixtures';
import { openMapDesktop, FAMILY_ONE } from './map-layout-kit';
import { BUCKET_DATA, marksProblems, measureMarks, PAIR_DATA } from './map-marks-kit';
import { showUnclassified } from './map-focus-kit';
import { cornerLabel } from './map-toolbar-kit';
import { shotsDir } from './editor-kit';

test.describe('map marks in screen pixels', () => {
  test.use({ actionTimeout: 60_000 });

  for (const size of [{ width: 1280, height: 800 }, { width: 1920, height: 1000 }]) {
    test(`a family's arrows: stroke 2 px or more, heads 10 px or more, chips 20 px and 12 px text or more (they grow with the map, 8.4c), nothing overlaps, at Fit and zoomed out (${size.width} x ${size.height})`, async ({ page }) => {
      test.setTimeout(300_000);
      await openMapDesktop(page);
      await page.setViewportSize(size);
      await page.waitForTimeout(800);
      await page.locator(`svg [data-node-id="${FAMILY_ONE}"]`).click();
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${shotsDir()}/map-marks-family-${size.width}x${size.height}.png` });
      const fit = await measureMarks(page);
      expect(fit.strokes.length).toBeGreaterThan(0);
      expect(marksProblems(fit)).toEqual([]);
      for (let i = 0; i < 2; i += 1) {
        await page.getByRole('button', { name: 'Zoom out' }).click();
        await page.waitForTimeout(900);
      }
      expect(marksProblems(await measureMarks(page))).toEqual([]);
    });
  }

  test('a two-way pair is two lines: each chip is a button for its own direction; a click on each line does the same (step 8.4c, C)', async ({ page }) => {
    test.setTimeout(300_000);
    await openMapDesktop(page, PAIR_DATA());
    await page.getByRole('combobox', { name: 'Chapter' }).selectOption('top_chapter-4');
    await page.waitForTimeout(900);
    const buttons = page.locator('svg [data-chip-button]');
    await expect(buttons).toHaveCount(2);
    const names = await buttons.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
    expect(names.every((n) => /^.+ to .+/.test(n))).toBe(true);
    const sizes = await buttons.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((b) => [b.width, b.height]));
    sizes.forEach(([w, h]) => {
      expect(w).toBeGreaterThanOrEqual(19.99);
      expect(h).toBeGreaterThanOrEqual(19.99);
    });
    for (const name of names) {
      await page.getByRole('button', { name }).click();
      await expect(cornerLabel(page)).toContainText('Selected:');
      await page.waitForTimeout(900);
    }
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${shotsDir()}/map-marks-pair-1280x800.png` });
    // a click on the middle of each line selects that line
    const ids = await page.locator('svg [data-layer="edges"] [data-edge-id][data-from="cls_family-08"][data-to="cls_family-13"], svg [data-layer="edges"] [data-edge-id][data-from="cls_family-13"][data-to="cls_family-08"]').evaluateAll((els) => els.map((el) => el.getAttribute('data-edge-id') ?? ''));
    expect(ids).toHaveLength(2);
    // the chip loop left one of them selected: a click on a selected arrow keeps it, so start with the one that is not
    const picked = await page.locator('svg [data-overlay="selected"]').evaluateAll((els) => els.map((el) => el.getAttribute('data-overlay-id') ?? ''));
    ids.sort((x, y) => Number(picked.includes(x)) - Number(picked.includes(y)));
    for (const id of ids) {
      await page.getByRole('button', { name: 'Fit', exact: true }).click();
      await page.waitForTimeout(900);
      // points of this line where this line is what is on top (another arrow may cross it): one of them must select it
      const spots = await page.evaluate((edge) => {
        const path = document.querySelector(`svg [data-layer="edges"] [data-edge-id="${edge}"] > path:not([data-hit])`) as unknown as SVGPathElement;
        const m = path.getScreenCTM() as DOMMatrix;
        const found: { x: number; y: number }[] = [];
        for (const f of [0.4, 0.5, 0.3, 0.6, 0.25, 0.7, 0.2, 0.8]) {
          const p = path.getPointAtLength(path.getTotalLength() * f);
          const x = p.x * m.a + p.y * m.c + m.e;
          const y = p.x * m.b + p.y * m.d + m.f;
          if (document.elementFromPoint(x, y)?.closest('[data-edge-id]')?.getAttribute('data-edge-id') === edge) found.push({ x, y });
        }
        return found;
      }, id);
      expect(spots.length, `a free point on ${id}`).toBeGreaterThan(0);
      const overlay = page.locator(`svg [data-overlay="selected"][data-overlay-id="${id}"]`);
      for (const at of spots.slice(0, 3)) {
        await page.mouse.click(at.x, at.y);
        await page.waitForTimeout(700);
        if ((await overlay.count()) === 1) break;
      }
      await expect(overlay).toHaveCount(1);
      await page.waitForTimeout(1200);
    }
  });

  test('a bucket with more than 15 arrows draws none, outlines the families and lists the arrows in the panel', async ({ page }) => {
    test.setTimeout(300_000);
    await openMapDesktop(page, BUCKET_DATA());
    await showUnclassified(page);
    await page.locator('svg [data-box="unclassified"]').click();
    await page.waitForTimeout(900);
    await expect(page.locator('svg [data-layer="edges"] [data-edge-id]')).toHaveCount(0);
    await expect(page.getByText(/^\d+ arrows: listed in the panel$/)).toBeVisible();
    const rows = page.getByRole('list', { name: 'Arrows of this selection' }).getByRole('button');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(15);
    await page.screenshot({ path: `${shotsDir()}/map-bucket-selected-1280x800.png` });
  });

  test('lines never run through text: a box is drawn over every line, opaque; the "↻ n" mark is inside its box', async ({ page }) => {
    test.setTimeout(300_000);
    await openMapDesktop(page);
    for (const id of ['cls_family-01', 'cls_family-02']) {
      await page.locator(`svg [data-node-id="${id}"]`).click();
      await page.waitForTimeout(900);
      const through = await page.evaluate(() => {
        const bad: string[] = [];
        for (const path of document.querySelectorAll('svg [data-layer="edges"] [data-edge-id] > path:not([data-hit])') as NodeListOf<SVGPathElement>) {
          const m = path.getScreenCTM() as DOMMatrix;
          const len = path.getTotalLength();
          for (let i = 0; i <= 40; i += 1) {
            const p = path.getPointAtLength((len * i) / 40);
            const x = p.x * m.a + p.y * m.c + m.e;
            const y = p.x * m.b + p.y * m.d + m.f;
            for (const node of document.querySelectorAll('svg [data-node-id]')) {
              const b = node.getBoundingClientRect();
              if (x < b.left + 3 || x > b.right - 3 || y < b.top + 3 || y > b.bottom - 3) continue; // the line meets the box at its border: only points well inside count
              // inside a box: the box must be what is on top, and drawn fully opaque
              const top = document.elementFromPoint(x, y);
              if (!(top instanceof SVGElement)) continue; // an HTML overlay (the hint, the key) is not the map's drawing
              const owner = top.closest('[data-node-id]');
              let opacity = 1;
              for (let el: Element | null = node; el !== null && el.tagName !== 'svg'; el = el.parentElement) opacity *= parseFloat(getComputedStyle(el).opacity);
              if (owner !== node || opacity < 1) {
                bad.push(`${path.parentElement?.getAttribute('data-edge-id')} in ${node.getAttribute('data-node-id')} opacity ${opacity} top ${top?.tagName} ${top?.getAttribute('data-layer') ?? top?.parentElement?.getAttribute('data-layer') ?? ''} ${top?.getAttribute('data-hit') ?? ''}`);
              }
            }
          }
        }
        return bad;
      });
      expect(through).toEqual([]);
    }
    const loops = await page.evaluate(() =>
      [...document.querySelectorAll('svg [data-loops-of]')].map((el) => {
        const box = document.querySelector(`svg [data-node-id="${el.getAttribute('data-loops-of')}"]`) as Element;
        const a = el.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        return { text: el.textContent, inside: a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom };
      }),
    );
    expect(loops.length).toBeGreaterThan(0);
    loops.forEach((l) => {
      expect(l.text).toMatch(/^↻ \d+$/);
      expect(l.inside).toBe(true);
    });
  });
});
