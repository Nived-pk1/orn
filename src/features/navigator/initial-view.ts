/** The view a reloaded map starts from (step 8.4b, E2a): a map that was still FITTED when it was saved is fitted again (the area may be another size now); one the person had panned or zoomed keeps its saved view. */
import type { Viewport } from '@/render/viewport';

export function initialViewOf(saved: Viewport | undefined, fitted: boolean): Viewport | undefined {
  return fitted ? undefined : saved;
}
