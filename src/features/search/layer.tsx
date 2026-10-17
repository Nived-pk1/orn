/**
 * The search feature's lazy layer: the command palette (cmdk and its Radix pieces). The window imports this file only through a dynamic
 * `import()` (`app/window/lazy-palette.tsx`), so none of it is in the entry chunk (step 6.1a, gate-e-packet section 8.1).
 */
export { Palette } from './palette';
