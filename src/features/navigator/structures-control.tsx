/**
 * The "Structures" control of the family page toolbar (equation step, part 4): Skeletal | Condensed | Full, a radio group that follows the
 * setting and changes it through the port. On a phone (part 6) the same choice is one compact button, "Structures: Skeletal", that opens a menu
 * of the three. How structures are drawn is the chem worker's business; this only chooses.
 */
import { useSyncExternalStore } from 'react';
import { STRUCTURE_MODES, type StructureMode } from '@/chem/contracts';
import { Menu, SegmentedControl } from '@/ui/primitives';
import type { NavigatorStructures } from './contracts';

const WORDS: Readonly<Record<StructureMode, string>> = { skeletal: 'Skeletal', condensed: 'Condensed', full: 'Full' };
const OPTIONS = STRUCTURE_MODES.map((value) => ({ value, label: WORDS[value] }));

export function StructuresControl(props: { readonly structures: NavigatorStructures }) {
  const { structures } = props;
  const mode = useSyncExternalStore(structures.subscribe, structures.mode, structures.mode);
  return <SegmentedControl label="Structures" options={OPTIONS} value={mode} onChange={structures.setMode} />;
}

export function StructuresMenu(props: { readonly structures: NavigatorStructures }) {
  const { structures } = props;
  const mode = useSyncExternalStore(structures.subscribe, structures.mode, structures.mode);
  const items = STRUCTURE_MODES.map((value) => ({ id: value, label: WORDS[value], onSelect: () => structures.setMode(value) }));
  return <Menu label={`Structures: ${WORDS[mode]}`} items={items} chosen={mode} />;
}
