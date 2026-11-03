/**
 * The layout guard shared by the phone specs (moved out of phone.spec.ts in step 8.1 so it has a test of its own: layout-guard.spec.ts).
 */
import type { Page } from '@playwright/test';

/** What is wrong with the page at this stop, as text (an empty list is a pass). */
export async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth) problems.push(`page scrolls sideways: scrollWidth ${doc.scrollWidth} > clientWidth ${doc.clientWidth}`);
    const shown = (el: Element): boolean => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const label = (el: Element): string => `${el.tagName.toLowerCase()}[${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}]`;
    // text cut off: a clipping box whose content is wider than it is, without an ellipsis saying so
    for (const el of document.body.querySelectorAll('*')) {
      if (!shown(el) || el.closest('svg') !== null) continue;
      if (el.clientWidth <= 1) continue; // visually hidden text (a 1 px clip), not text a visitor sees
      const style = getComputedStyle(el);
      const clips = style.overflowX === 'hidden' || style.overflowX === 'clip';
      if (clips && el.scrollWidth > el.clientWidth + 1 && style.textOverflow !== 'ellipsis' && (el.textContent ?? '').trim() !== '') {
        problems.push(`text cut off in ${label(el)}: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
      }
    }
    for (const row of document.body.querySelectorAll('[data-scroll-row]')) {
      if (!shown(row) || !['auto', 'scroll'].includes(getComputedStyle(row).overflowX)) continue;
      const box = row.getBoundingClientRect();
      if (box.right > doc.clientWidth + 1 || box.left < -1) problems.push(`scroll row outside the window sideways: ${label(row)} ${Math.round(box.left)}..${Math.round(box.right)}`);
    }
    // controls: reachable (inside the window sideways) and at least 24 x 24 px; none under the tab bar
    const bar = document.querySelector('nav[aria-label="Home"]');
    const barTop = bar === null ? Infinity : bar.getBoundingClientRect().top;
    for (const el of document.body.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [role="option"], [role="tab"]')) {
      if (!shown(el) || el.closest('svg') !== null || el.closest('[aria-hidden="true"]') !== null) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 24 || box.height < 24) problems.push(`control under 24 px: ${label(el)} ${Math.round(box.width)} x ${Math.round(box.height)}`);
      // 8.1: a marked horizontal scroll row (overflow-x auto or scroll) is checked as ONE box below; its children are not checked sideways
      const row = el.closest('[data-scroll-row]');
      const rowScrolls = row !== null && ['auto', 'scroll'].includes(getComputedStyle(row).overflowX);
      if (!rowScrolls && (box.right > doc.clientWidth + 1 || box.left < -1)) problems.push(`control outside the window sideways: ${label(el)} ${Math.round(box.left)}..${Math.round(box.right)}`);
      const insideBar = bar !== null && bar.contains(el);
      const topLayer = el.closest('dialog, [role="menu"], aside') !== null || el.closest('main') !== null; // main scrolls: what is below its edge is scrolled out, not behind the bar
      if (!insideBar && !topLayer && box.bottom > barTop + 1 && box.top < window.innerHeight) problems.push(`control behind the tab bar: ${label(el)} bottom ${Math.round(box.bottom)} > ${Math.round(barTop)}`);
    }
    return problems;
  });
}

