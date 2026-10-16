import { useEffect, useState } from 'react';

/**
 * ADR-039 / UI_ARCHITECTURE §13: the layout is ONE value. A phone is a window under 700 px wide, or a coarse pointer under 500 px high (a
 * phone held sideways). Everything else, tablets included, is the desktop layout.
 */
export type LayoutMode = 'desktop' | 'phone';
export const PHONE_MAX_WIDTH = 699;
export const PHONE_LANDSCAPE_MAX_HEIGHT = 499;

export const PHONE_QUERIES: readonly string[] = [`(max-width: ${PHONE_MAX_WIDTH}px)`, `(pointer: coarse) and (max-height: ${PHONE_LANDSCAPE_MAX_HEIGHT}px)`];

export function readLayoutMode(): LayoutMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop';
  return PHONE_QUERIES.some((query) => window.matchMedia(query).matches) ? 'phone' : 'desktop';
}

/** The current layout mode, following the window. Without `matchMedia` (a test environment) the desktop layout. */
export function useLayoutMode(): LayoutMode {
  const [value, setValue] = useState<LayoutMode>(readLayoutMode);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const lists = PHONE_QUERIES.map((query) => window.matchMedia(query));
    const update = (): void => setValue(readLayoutMode());
    for (const list of lists) list.addEventListener('change', update);
    update();
    return () => {
      for (const list of lists) list.removeEventListener('change', update);
    };
  }, []);
  return value;
}
