/**
 * The workbench feature's entry-chunk surface: ONLY types and the small pure word functions. Components are in `layer.tsx`, which the
 * window loads with `React.lazy` (ADR-040: only the button, its port, the start-up line, the drafts menu item and the session manager are
 * in the entry chunk).
 */
export type { DraftSaveView, DraftsListPort, DraftsViewModel, DraftListItemView, UnreadableDraftView } from './contracts';
export { draftStatusText, draftsLabel, editingUnavailableReason, shortTime } from './draft-text';
export type { EditorEntryView, EditorCommitResult, EditorPort } from './editor-contracts';
export type { ClassSuggestion, DraftChecksPort, DryRunAnswer, StructureChecksAnswer } from './check-contracts';
export type { SmartsCheck, StructurePort } from './structure-contracts';
export type { PickKind, RecordChoice, RecordPickerPort } from './record-picker-contracts';
export type { DuplicateCheckPort, DuplicateMatch, DuplicateOutcome, DuplicatePort } from './duplicate-contracts';
