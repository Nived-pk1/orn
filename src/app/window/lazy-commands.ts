/**
 * The palette's command registry as a lazy chunk (step 8.4d, size rule: what is used only after a click is lazy). `palette-commands.ts` is 7 kB
 * of command definitions that matter only once the palette is asked for, so the window loads it when the first view is drawn and the browser is
 * idle, and `openSearch` waits for it if the palette is asked for sooner. A chunk that fails to load is not an error here: the palette still opens
 * (search works), with no commands until a later try loads it.
 */
import { createChunkCache } from '@/app/services/lazy-chunk';
import type { buildCommands } from './palette-commands';

type Build = typeof buildCommands;

const chunk = createChunkCache<Build>(() => import('./palette-commands').then((m) => m.buildCommands), 'The commands');

/** Starts loading the commands (a failure is a value, nothing throws). */
export const prefetchCommands = (): Promise<unknown> => chunk.get();

/** The loaded `buildCommands`, or undefined before it has loaded. */
export const loadedCommands = (): Build | undefined => chunk.peek();
