/**
 * The workbench's lazy layer: everything the window loads on demand (the drafts list and the editors). The window imports this file only
 * through `React.lazy`, so none of it is in the entry chunk (ADR-040).
 */
export { DraftsDialog } from './drafts-dialog';
export type { DraftsDialogProps } from './drafts-dialog';
export { EditorHost } from './editor-host';
export { nameSeed } from './create-new';
export type { EditorHostProps } from './editor-host';
export { StructurePanel, STRUCTURE_PARSE_DEBOUNCE_MS } from './structure-panel';
export type { StructurePanelProps } from './structure-panel';
export type { StructurePort } from './structure-contracts';
