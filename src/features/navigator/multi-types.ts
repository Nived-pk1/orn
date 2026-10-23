/**
 * The types of the map's multi-selection (step 6.8b, R2 and Y1; Studio only), in one leaf file so that the context, the shell hook, the lazy
 * engine and the bulk bar can refer to each other without a cycle. Types only: nothing here is in any bundle.
 */
import type { ReactNode } from 'react';
import type { StoreApi } from 'zustand';
import type { Scene } from '@/render/scene';
import type { SceneHit } from '@/render/svg';
import type { Viewport, ViewportController } from '@/render/viewport';
import type { Selected, SelectionState } from '@/ui/state';
import type { Box } from './multi-select';

export interface MapBulk {
  /** Why the bulk actions cannot run in this tab (read-only); undefined when they can. */
  readonly unavailable: string | undefined;
  /** "Mark verified (n)": the review queue's path, with its refusals and confirm. */
  markVerified(reactionIds: readonly string[]): void;
  /** "Delete (n)": ONE aggregated impact dialog and one undo step. */
  remove(reactionIds: readonly string[]): void;
  /** The multi-selection shell (a hook): it lives in Studio's code only, so the Study build has none of it (step 6.8b, Y1). */
  readonly useMulti: (args: MultiArgs) => MultiSelect | null;
  /** The loader of the multi-selection engine, injected: it is called on the first Shift-click, marquee or Select tap. */
  readonly load: () => Promise<MultiEngine>;
  /** The engine when it is already loaded (the page has loaded it before). */
  readonly loaded: () => MultiEngine | undefined;
}

export interface MarqueeBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface MultiSelect {
  readonly bulk: MapBulk;
  readonly items: readonly Selected[];
  /** The phone's Select mode: a tap toggles. */
  readonly selectMode: boolean;
  setSelectMode(on: boolean): void;
  /** The phone's Select button, for the round buttons beside Fit and Legend. */
  readonly selectToggle: ReactNode;
  /** The rectangle being dragged, in pixels of the drawing; null when there is none. */
  readonly marquee: MarqueeBox | null;
  /** The selection in words ("2 families and 1 arrow selected (5 reactions)"); empty until the engine has loaded. */
  readonly line: string;
  readonly reactionIds: readonly string[];
  toggle(hit: SceneHit): void;
  toggleFocused(id: string | undefined): void;
  onMarquee(rect: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }, done: boolean): void;
  onMarqueeCancel(): void;
  clear(): void;
  /** The bulk bar (the toolbar's buttons, or the phone's bottom bar); null when nothing is selected. */
  actions(bar: boolean): ReactNode;
}

export interface MultiArgs {
  readonly scene: Scene | null;
  readonly svg: SVGSVGElement | null;
  readonly controller: ViewportController | null;
  readonly isHub: (id: string) => boolean;
  readonly announce: (message: string) => void;
}

type Selection = StoreApi<SelectionState>;
type Candidates = (hubId: string) => readonly { readonly reactionId: string; readonly toHub: string }[];

export interface MultiEngine {
  /** Adds or removes the hit; what to say ("3 selected"), or null when the hit is not selectable (a node that is not a family). */
  toggle(selection: Selection, hit: SceneHit, isHub: (id: string) => boolean): string | null;
  /** Shift+Space on the focused family (undefined: none yet); what to say. */
  toggleFocused(selection: Selection, id: string | undefined, isHub: (id: string) => boolean): string | null;
  /** A finished marquee: the families wholly inside are added to the multi-selection (the single selection comes in first); what to say. */
  addMarquee(selection: Selection, scene: Scene, origin: { readonly left: number; readonly top: number }, view: Viewport, rect: Box): string;
  describe(items: readonly Selected[], scene: Scene | null, candidatesFrom: Candidates): { readonly line: string; readonly reactionIds: readonly string[] };
  readonly Actions: (props: { readonly multi: MultiSelect; readonly bar?: boolean }) => ReactNode;
}
