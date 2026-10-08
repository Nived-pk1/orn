/**
 * The ONE interface the navigator feature needs from outside (step 5.5a, note E1): the canonical store (state and subscribe), the full
 * indexes (a handle is asked for at every build and never kept), the layout service, the text measurer, the UI stores, timers and a log.
 * `src/app/window` fills it from `AppServices`; the feature imports no `src/app` and the engines as types only (step 5.0 rules).
 * Later steps add the depiction and URL functions here.
 */
import type { ChangeSet } from '@/core/dataset/contracts';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState } from '@/core/schema';
import type { TextMeasurer } from '@/render/scene';
import type { StoreApi } from 'zustand/vanilla';
import type { NavigatorUiStatus, NavigatorUiStores } from '@/ui/state';
import type { LayoutService } from '@/workers/layout';

export interface NavigatorMeasurer {
  readonly measure: TextMeasurer;
  /** Resolves when measuring is trustworthy (the bundled fonts are loaded, or the bounded wait is over). Never rejects. */
  ready(): Promise<void>;
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
