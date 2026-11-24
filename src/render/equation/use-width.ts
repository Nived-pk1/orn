/**
 * The width a drawing may use (step 8.5d): the client width of an element (or of its parent), read after layout and again when it changes.
 * A width that moved by a few px (a scrollbar's edge, a rounding) is the same width (`settledWidth`). Undefined until measured: the
 * drawing is then shown at its standard, as the first paint of a measured box is.
 */
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { settledWidth } from './hero-fit';

export const AvailableWidthContext = createContext<number | undefined>(undefined);
export const useAvailableWidth = (): number | undefined => useContext(AvailableWidthContext);

export function useMeasuredWidth(of: 'self' | 'parent'): readonly [(node: HTMLElement | null) => void, number | undefined] {
  const [width, setWidth] = useState<number | undefined>(undefined);
  const seen = useRef(0);
  const stop = useRef<(() => void) | null>(null);
  const ref = useCallback(
    (node: HTMLElement | null): void => {
      stop.current?.();
      stop.current = null;
      const target = node === null ? null : of === 'parent' ? node.parentElement : node;
      if (target === null) return;
      const read = (): void => {
        const now = target.clientWidth;
        if (now <= 0) return;
        seen.current = settledWidth(seen.current, now);
        setWidth(seen.current);
      };
      read();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(read);
      observer.observe(target);
      stop.current = () => observer.disconnect();
    },
    [of],
  );
  return [ref, width];
}
