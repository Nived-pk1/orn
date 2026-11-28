/**
 * The "Structures" control (equation step, part 4; moved here from the navigator in step 8.5h B1 so that every page can carry it):
 * Skeletal | Condensed | Full, a radio group that follows the setting and changes it. On a phone the same choice is one compact button,
 * "Structures: Skeletal", that opens a menu of the three. How structures are drawn is the chem worker's business; this only chooses.
 */
import { useSyncExternalStore } from 'react';
import { STRUCTURE_MODES, type StructureMode } from '@/chem/contracts';
import { Menu, SegmentedControl } from '@/ui/primitives';
import type { StructuresSetting } from './context';

const WORDS: Readonly<Record<StructureMode, string>> = { skeletal: 'Skeletal', condensed: 'Condensed', full: 'Full' };
const OPTIONS = STRUCTURE_MODES.map((value) => ({ value, label: WORDS[value] }));

export function StructuresControl(props: { readonly structures: StructuresSetting }) {
  const { structures } = props;
  const mode = useSyncExternalStore(structures.subscribe, structures.mode, structures.mode);
  return <SegmentedControl label="Structures" options={OPTIONS} value={mode} onChange={structures.setMode} />;
}

export function StructuresMenu(props: { readonly structures: StructuresSetting }) {
  const { structures } = props;
  const mode = useSyncExternalStore(structures.subscribe, structures.mode, structures.mode);
  const items = STRUCTURE_MODES.map((value) => ({ id: value, label: WORDS[value], onSelect: () => structures.setMode(value) }));
  return <Menu label={`Structures: ${WORDS[mode]}`} items={items} chosen={mode} />;
}
