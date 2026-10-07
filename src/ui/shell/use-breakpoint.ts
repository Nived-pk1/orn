import { useEffect, useState } from 'react';

/** UI_ARCHITECTURE §2: three panes from 1280 px; the inspector as an overlay drawer from 900 px; below that one pane. */
export type Breakpoint = 'wide' | 'medium' | 'narrow';
export const WIDE_MIN = 1280;
export const MEDIUM_MIN = 900;

const WIDE = `(min-width: ${WIDE_MIN}px)`;
const MEDIUM = `(min-width: ${MEDIUM_MIN}px)`;

function read(): Breakpoint {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'wide';
  if (window.matchMedia(WIDE).matches) return 'wide';
  return window.matchMedia(MEDIUM).matches ? 'medium' : 'narrow';
}

/** The current breakpoint, following the window. Without `matchMedia` (a test environment) the wide layout. */
export function useBreakpoint(): Breakpoint {
  const [value, setValue] = useState<Breakpoint>(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const lists = [window.matchMedia(WIDE), window.matchMedia(MEDIUM)];
    const update = (): void => setValue(read());
    for (const list of lists) list.addEventListener('change', update);
    update();
    return () => {
      for (const list of lists) list.removeEventListener('change', update);
    };
  }, []);
  return value;
}
