/**
 * The map model's state and shape (split out of pipeline.ts, step 8.4m R2): the always-loaded code needs these, the pipeline itself is
 * a lazy chunk. `IDLE_NAVIGATOR_STATE` is "not computed yet": no Scene, no numbers.
 */
import type { LayoutResult } from '@/layout/contracts';
import type { Scene } from '@/render/scene';
import type { NavigatorError } from './contracts';

export interface NavigatorState {
  readonly scene: Scene | null;
  readonly error: NavigatorError | null;
  /** True when there is no Scene yet and `SKELETON_DELAY_MS` have passed. */
  readonly skeleton: boolean;
  /** A new Scene is being computed (the previous one, if any, stays on screen). */
  readonly working: boolean;
  /** The admitted hubs (real hubs and Unclassified) of the current projection, sorted. */
  readonly hubIds: readonly string[];
  /** Which layout drew the current Scene (step 5.5c): `grid` for an arranged overview, `elk` or `fallback` otherwise; null before the first Scene. */
  readonly layout: LayoutResult['engine'] | null;
  /** The reactions no family holds (the projection's `unanchoredReactionIds`, sorted: step 5.5d, item f). All of them are here, none cut. */
  readonly unanchored: readonly string[];
  /** How many reactions the dataset holds (the empty states, step 5.5d item j). */
  readonly reactions: number;
  /** The chapter the current Scene was built for (null: all chapters, or the "From A to B" panel is open). The map fits its view again when it changes (step 8.2b). */
  readonly chapterId: string | null;
}

export interface PipelineStats {
  readonly projections: number;
  readonly sizes: number;
  readonly requests: number;
  readonly layoutCalls: number;
  readonly scenes: number;
}

export interface NavigatorModel {
  getState(): NavigatorState;
  subscribe(listener: () => void): () => void;
  /** Subscribes to the inputs and runs the first build once the measurer is ready. Safe to call again after `stop`. */
  start(): void;
  stop(): void;
  stats(): PipelineStats;
}

export const IDLE_NAVIGATOR_STATE: NavigatorState = { scene: null, error: null, skeleton: false, working: false, hubIds: [], layout: null, unanchored: [], reactions: 0, chapterId: null };
