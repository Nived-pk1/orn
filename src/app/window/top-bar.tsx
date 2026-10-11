/**
 * The top bar's controls (UI_ARCHITECTURE §2): what exists is enabled; what does not exist yet is listed, disabled, with the step that
 * brings it (note E8). The file menu's import and export are the full import and export screens (5.9a, 5.9b): until then the
 * first-run screen is the only way in.
 */
import { IconButton, Menu } from '@/ui/primitives';

const FILE_ITEMS = [
  { id: 'import', label: 'Import a file', unavailable: 'step 5.9a (use the first-run screen until then)' },
  { id: 'export', label: 'Export', unavailable: 'step 5.9b' },
  { id: 'undo_import', label: 'Undo import', unavailable: 'step 5.9a' },
] as const;

export function TopBar(props: { readonly onSearch: () => void }) {
  return (
    <>
      <Menu label="File" items={FILE_ITEMS} />
      <IconButton label="Search" icon="search" onClick={props.onSearch} aria-keyshortcuts="Control+K Meta+K" />
      <IconButton label="Undo" icon="undo" unavailable="step 5.9a" />
      <IconButton label="Redo" icon="redo" unavailable="step 5.9a" />
    </>
  );
}
