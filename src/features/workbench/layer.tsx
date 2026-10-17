/**
 * The workbench's lazy layer: everything the window loads on demand (the drafts list now, the editors in step 6.1a part 4). The window
 * imports this file only through `React.lazy`, so none of it is in the entry chunk.
 */
export { DraftsDialog } from './drafts-dialog';
export type { DraftsDialogProps } from './drafts-dialog';
