/**
 * The ONE interface the inspector needs from outside (step 5.6a, as the navigator's ports): the canonical store, the full indexes,
 * the findings and the L4 checks (read only), the depiction service, the UI stores it reads and writes, timers and a log. `src/app/window`
 * fills it from `AppServices`; the feature imports no `src/app` and no other feature. Nothing here lets the inspector change a record.
 */
import type { ChangeSet } from '@/core/dataset/contracts';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { Finding } from '@/core/validation';
import type { StructureFactsPort } from '@/render/equation';
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
  /** What the chem worker says about a structure (the textbook equation decides formula or drawing from it). Absent: the facts are unavailable. */
  readonly facts?: StructureFactsPort;
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
  /** Opens a chapter's page in the Chapters view (step 7.3b D4; the "In chapters" links). Absent: the chapters are named without links. */
  openChapter?(chapterId: string): void;
  /** Opens the Reactions view filtered by this record (step 7.1b E3; species, class, reagent, named reaction). Absent: no "Show its reactions" button. */
  showReactions?(ref: RecordRef): void;
  /** Opens the Precursors view for this record (step 7.2a D7; species, class). Absent: no "How to make it" button. */
  showPrecursors?(ref: RecordRef): void;
  /** Opens the Reactions view for an overview arrow: From = its from family, To = its to family (a self-loop: the same family twice). Absent: no such button. */
  showArrowReactions?(ends: { readonly from: string; readonly to: string }): void;
  /** True while the navigator is the view on the canvas (a record can then have a place in it). */
  readonly navigatorShown: boolean;
  /** True while an explorer (Reactions, Precursors, later Reagents) is the view: the "no place in this view" line is about the navigator map and is not shown there (7.3a A3). */
  readonly explorerShown?: boolean;
  /** Opens the names editor of a record (ADR-040, step 6.1a part 4). Absent: no "Edit names" button. `unavailable` is the reason it cannot be used now (a read-only tab). The inspector knows no editor: this is the whole port. */
  readonly editNames?: { readonly unavailable: string | undefined; open(ref: RecordRef): void; /** Kinds that open the full editor: their button says "Edit" (step 6.2a); the others say "Edit names". */ readonly fullEditorKinds?: readonly string[]; /** Kinds with the shared Names type, supplied by the editors (the inspector imports no editing module, H2). */ readonly namesKinds?: readonly string[]; /** Duplicate a reaction or start a specific one from a generic one (step 6.7a); absent: no such buttons. */ startFrom?(mode: 'duplicate' | 'specific', ref: RecordRef): void; /** Delete (step 6.8a): shows the impact dialog; absent: no Delete button. */ remove?(ref: RecordRef): void };
}
