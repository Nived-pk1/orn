/**
 * Where the multi-selection engine is loaded from (step 6.8b, Y1; Studio only). The Studio host hands `loadMultiEngine` to the map as the
 * default loader; in Study nothing reads it, so the engine's chunk is not built at all. `warmMultiEngine` is what has been loaded so far (the
 * module is cached by the page): a test that wants the engine there from the first use awaits `loadMultiEngine()` first.
 */
import type { MultiEngine } from './multi-types';

let cached: MultiEngine | undefined;

export const loadMultiEngine = (): Promise<MultiEngine> => import('./multi-engine').then((module) => (cached = module.multiEngine));
export const warmMultiEngine = (): MultiEngine | undefined => cached;
