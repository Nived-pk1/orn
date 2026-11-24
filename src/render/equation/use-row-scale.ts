/**
 * The whole row of a full equation shrinks together before it wraps (step 8.5e, E2 a). A wrapping row is measured after layout, again when the row is
 * resized or a drawing loads: its parts' and drawings' widths give the row at scale 1 (`naturalRowWidth`), `rowScale` the scale (down to FLOOR; beyond it
 * the row wraps, as flex does), and every drawing of the row is shown at that one scale (`RowScaleContext`). A change under 1 % is no change.
 */
import { createContext, useContext, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { rowScale } from './size-rule';

export const RowScaleContext = createContext(1);
export const useRowScaleValue = (): number => useContext(RowScaleContext);

export function useRowScale(available: number | undefined, enabled: boolean): readonly [RefObject<HTMLDivElement | null>, number] {
  const row = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const node = row.current;
    if (!enabled || node === null || available === undefined) return setScale(1), undefined;
    const width = (el: Element): number => el.getBoundingClientRect().width;
    const measure = (): void =>
      setScale((now) => {
        // the row at scale 1: its parts and gaps, the drawings' share grown back
        const drawings = [...node.querySelectorAll('img')].reduce((sum, img) => sum + width(img), 0);
        const parts = [...node.children].map(width);
        const gap = (Number.parseFloat(getComputedStyle(node).columnGap) || 0) * (parts.length - 1);
        const next = rowScale(parts.reduce((sum, w) => sum + w, gap + drawings * (1 / now - 1)), available).scale;
        return Math.abs(next - now) < 0.01 ? now : next;
      });
    measure();
    node.addEventListener('load', measure, true);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(node);
    return () => (node.removeEventListener('load', measure, true), observer?.disconnect());
  }, [available, enabled]);
  return [row, scale];
}
