/**
 * The navigator's drawing limits, in a module of their own so a test of the browser (Playwright loads it without a CSS loader) can import
 * them without the screen.
 */
/**
 * Drawn hub pairs the navigator asks for by default (review decision 6 (1)). Measured in step 5.5a part 2 (item l): ELK mean at design
 * dense, 60 anchored hubs, unexpanded: 3,325 ms at 800, 990 ms at 400, 377 ms at 240, 86 ms at 120; the largest under 300 ms is 120.
 */
export const NAVIGATOR_MAX_EDGES = 120;
export const NAVIGATOR_MAX_NODES = 400;
