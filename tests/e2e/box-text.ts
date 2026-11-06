/**
 * How big a family box's title is drawn, in screen px (step 8.3b, Part D). The title is an SVG `<text>` in the labels layer
 * (`svg [data-label-of] text`, drawn from level of detail 1 on): its rendered size is its font size times the screen scale of its own
 * transform (`getScreenCTM().a`), not the CSS value. Test code only; reused by later map steps.
 */
import type { Page } from '@playwright/test';

/** The smallest box title on the map (every family box has one), in screen px; 0 when no title is drawn. `selector` is for the calibration test. */
export async function boxTitlePx(page: Page, selector = 'svg [data-label-of] text:first-of-type'): Promise<number> {
  return page.evaluate((query) => {
    const sizes = [...document.querySelectorAll<SVGTextElement>(query)].map((text) => {
      const matrix = text.getScreenCTM();
      const fontSize = Number.parseFloat(text.getAttribute('font-size') ?? getComputedStyle(text).fontSize);
      return fontSize * (matrix === null ? 1 : matrix.a);
    });
    return sizes.length === 0 ? 0 : Math.min(...sizes);
  }, selector);
}
