/**
 * The whole row of a full equation shrinks together before it wraps (step 8.5e, E2 a). A wrapping row is measured after layout: its parts' widths and its
 * drawings' widths give the row at scale 1 (`naturalRowWidth`), `rowScale` gives the scale (down to FLOOR; beyond it the row wraps, as flex does), and every
 * drawing of the row is shown at that one scale (`RowScaleContext`). Bounded: a measurement reads the children of one row; a change under 1 % is no change.
 */
import { createContext, useContext, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { naturalRowWidth, rowScale } from './size-rule';

export const RowScaleContext = createContext(1);
export const useRowScaleValue = (): number => useContext(RowScaleContext);

const MIN_CHANGE = 0.01;

export function useRowScale(available: number | undefined, enabled: boolean, watch: unknown): readonly [RefObject<HTMLDivElement | null>, number] {
  const row = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const current = useRef(1);
  useLayoutEffect(() => {
    const node = row.current;
    if (!enabled || node === null || available === undefined) {
      current.current = 1;
      setScale(1);
      return undefined;
    }
    const measure = (): void => {
      const parts = [...node.children].map((child) => child.getBoundingClientRect().width);
      const drawings = [...node.querySelectorAll('img')].reduce((sum, img) => sum + img.getBoundingClientRect().width, 0);
      const gap = Number.parseFloat(getComputedStyle(node).columnGap) || 0;
      const total = naturalRowWidth({ parts, drawings, gap }, current.current);
      const next = total <= 0 ? 1 : rowScale(total, available).scale;
      if (Math.abs(next - current.current) < MIN_CHANGE) return;
      current.current = next;
      setScale(next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
    return () => observer.disconnect();
  }, [available, enabled, watch]);
  return [row, scale];
}
