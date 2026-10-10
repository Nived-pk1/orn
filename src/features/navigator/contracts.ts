/**
 * The ONE interface the navigator feature needs from outside (step 5.5a, note E1): the canonical store (state and subscribe), the full
 * indexes (a handle is asked for at every build and never kept), the layout service, the text measurer, the UI stores, timers and a log.
 * `src/app/window` fills it from `AppServices`; the feature imports no `src/app` and the engines as types only (step 5.0 rules).
 * Step 5.5a part 2 adds the depiction functions (optional: without them no node has a structure).
 */
import type { ChangeSet } from '@/core/dataset/contracts';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, StructureRep } from '@/core/schema';
import type { TextMeasurer } from '@/render/scene';
import type { StoreApi } from 'zustand/vanilla';
import type { NavigatorUiStatus, NavigatorUiStores } from '@/ui/state';
import type { LayoutService } from '@/workers/layout';

export interface NavigatorMeasurer {
  readonly measure: TextMeasurer;
  /** Resolves when measuring is trustworthy (the bundled fonts are loaded, or the bounded wait is over). Never rejects. */
  ready(): Promise<void>;
}

/** What the depiction service answers, as far as the navigator uses it (the service's `DepictionResult` fits). */
export type NavigatorDepictionAnswer =
  | { readonly ok: true; readonly svg: string }
  | { readonly ok: false; readonly reason: 'unavailable' | 'timeout' | 'invalid' | 'refused' | 'cancelled' | 'queue_full' | 'bad_options'; readonly message: string };

/** Structures (item i): the request key, the service call, and the object URLs, which are a browser API and so made by the app. */
export interface NavigatorDepictions {
  /** The request's name for a structure drawn at `size` (pure; the service's own key). */
  keyOf(structure: StructureRep, size: { readonly width: number; readonly height: number }): string;
  depict(structure: StructureRep, size: { readonly width: number; readonly height: number }): Promise<NavigatorDepictionAnswer>;
  cancel(key: string): void;
  /**
   * Calls the listener each time the chemistry engine has been retried successfully after it was unavailable (step 5.5d, item i);
   * answers the unsubscribe. Absent: nothing is forgotten (an unavailable structure stays a name until the page is reloaded).
   */
  recovered?(listener: () => void): () => void;
  /** SVG text to an object URL, and its revoking. */
  createUrl(svg: string): string;
  revokeUrl(url: string): void;
}

export interface NavigatorPorts {
  readonly store: {
    getState(): CanonicalState;
    subscribe(listener: (changes: ChangeSet) => void): () => void;
  };
  readonly indexes: { current(): ReadonlyIndexes };
  readonly layout: Pick<LayoutService, 'layout'>;
  readonly measurer: NavigatorMeasurer;
  readonly timers: { after(ms: number, run: () => void): () => void };
  /** Absent: no node has a depiction key and none is drawn. */
  readonly depictions?: NavigatorDepictions;
  readonly ui: NavigatorUiStores;
  /** What keeping the UI state is doing (saved, read-only, session-only, failed) and what was reset at start. */
  readonly uiStatus: StoreApi<NavigatorUiStatus>;
  /** One line to the app's event log (nothing silent). */
  readonly log: (type: string, message: string) => void;
}

/** A failure the screen shows in words: the code of the builder or of the layout service, and its message. */
export interface NavigatorError {
  readonly code: string;
  readonly message: string;
}
