/**
 * The "Structures" control of the family page header (equation step, part 4): Skeletal | Condensed | Full, a radio group that follows the
 * setting and changes it through the port. How structures are drawn is the chem worker's business; this only chooses.
 */
import { useSyncExternalStore } from 'react';
import { STRUCTURE_MODES, type StructureMode } from '@/chem/contracts';
import { SegmentedControl } from '@/ui/primitives';
import type { NavigatorStructures } from './contracts';

const WORDS: Readonly<Record<StructureMode, string>> = { skeletal: 'Skeletal', condensed: 'Condensed', full: 'Full' };
const OPTIONS = STRUCTURE_MODES.map((value) => ({ value, label: WORDS[value] }));

export function StructuresControl(props: { readonly structures: NavigatorStructures }) {
  const { structures } = props;
  const mode = useSyncExternalStore(structures.subscribe, structures.mode, structures.mode);
  return <SegmentedControl label="Structures" options={OPTIONS} value={mode} onChange={structures.setMode} />;
}
