/**
 * The workbench's lazy layer: everything the window loads on demand (the drafts list and the editors). The window imports this file only
 * through `React.lazy`, so none of it is in the entry chunk (ADR-040).
 */
export { DraftsDialog } from './drafts-dialog';
export type { DraftsDialogProps } from './drafts-dialog';
export { EditorHost } from './editor-host';
export type { EditorHostProps } from './editor-host';
