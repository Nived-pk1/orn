/**
 * Atom-map numbers RDKit's default read throws away. `get_mol` removes explicit hydrogens, mapped ones included (`[H:2][OH:1]`
 * reads as a water whose only map is 1), so the map of a hydrogen is gone from the canonical SMILES the facts are read from. A
 * mechanism step names exactly those hydrogens (a proton transfer), and CHEM-008 must not call them absent. So a line notation that
 * has map numbers is read a second time WITHOUT removing hydrogens, and the maps are taken from that. `undefined`: there was no
 * second read (no map in the text, a molfile, or RDKit would not open it), and the facts keep the maps they already have.
 */
import { withHandle } from './scope';
import { atomMapsOf, smilesAtoms } from './smiles-atoms';
import type { RdkitModule } from './types';

const HAS_MAP = /:\d+\]/;

export function mapsKeepingHydrogens(module: RdkitModule, format: string, value: string): readonly number[] | undefined {
  if (format === 'molfile' || !HAS_MAP.test(value)) return undefined;
  const kept = withHandle(
    () => module.get_mol(value, '{"removeHs":false}'),
    (mol) => mol.get_smiles(),
  );
  if (!kept.opened) return undefined;
  const atoms = smilesAtoms(kept.value);
  return atoms === undefined ? undefined : atomMapsOf(atoms);
}
