/**
 * The ONE interface the inspector needs from outside (step 5.6a, as the navigator's ports): the canonical store, the full indexes,
 * the findings and the L4 checks (read only), the depiction service, the UI stores it reads and writes, timers and a log. `src/app/window`
 * fills it from `AppServices`; the feature imports no `src/app` and no other feature. Nothing here lets the inspector change a record.
 */
import type { ChangeSet } from '@/core/dataset/contracts';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { Finding } from '@/core/validation';
import type { DepictionPort } from '@/render/svg';
import type { ActiveExamStore, FamilyStore, InspectorStore, PanelsStore, SelectionStore } from '@/ui/state';
import type { SubjectStatus } from '@/workers/chem';

/** What an asset's bytes are, as an image address the page may use: a blob URL the caller must give back through `revoke`. */
export type AssetImage = { readonly ok: true; readonly url: string } | { readonly ok: false; readonly reason: 'missing' | 'unavailable'; readonly message: string };

export interface InspectorPorts {
  readonly store: {
    getState(): CanonicalState;
    subscribe(listener: (changes: ChangeSet) => void): () => void;
  };
  readonly indexes: { current(): ReadonlyIndexes };
  /** The findings of a record (all levels); `subscribe` is told when any finding changed. */
  readonly findings: {
    bySubject(ref: RecordRef): readonly Finding[];
    subscribe(listener: () => void): () => void;
  };
  /** The L4 chemistry checks: their status per record and the formula derived from a structure. Derived data, held in memory only. */
  readonly l4: {
    statusOf(ref: RecordRef): SubjectStatus;
    derivedFormulaOf(ref: RecordRef): string | undefined;
    subscribe(listener: () => void): () => void;
    subscribeFormulas(listener: (ids: readonly string[]) => void): () => void;
  };
  /** Absent: no structure is drawn (a species shows its formula). */
  readonly depictions?: DepictionPort;
  /** Asset bytes (step 5.6b, additive). Absent: images are not shown and the view says so. The URL is made and revoked here, never by the view. */
  readonly assets?: {
    open(assetId: string, mediaType: string): Promise<AssetImage>;
    revoke(url: string): void;
  };
  readonly timers: { after(ms: number, run: () => void): () => void };
  readonly ui: {
    readonly inspector: InspectorStore;
    readonly selection: SelectionStore;
    readonly family: FamilyStore;
    readonly panels: PanelsStore;
    /** The chosen exam scope (step 5.8, additive): the curriculum section marks the chosen version. Absent: none is chosen. */
    readonly exam?: ActiveExamStore;
  };
  /** One line to the app's event log (nothing silent). */
  readonly log: (type: string, message: string) => void;
}

/** What the window tells the inspector about the canvas (the inspector knows no other feature). */
export interface InspectorHost {
  /** Opens the inspector pane (or the drawer / sheet at the smaller breakpoints) if it is closed. */
  openPane(): void;
  /** Closes the phone's sheet after a main action that moved the page (Open family); absent: nothing to close (the pane and drawer stay as the user left them). */
  closePane?(): void;
  /** The two families an overview arrow joins; undefined when the arrow is not drawn now. */
  edgeEnds(edgeId: string): { readonly from: string; readonly to: string } | undefined;
  /** True while the navigator is the view on the canvas (a record can then have a place in it). */
  readonly navigatorShown: boolean;
}
