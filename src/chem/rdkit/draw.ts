/**
 * Drawing options and the drawing itself for the RDKit adapter. RDKit draws atom map numbers as part of the atom label and has
 * no option to hide them, so a depiction without them is drawn from RDKit's own canonical SMILES with the `:n` removed (the
 * atom order is the SMILES order, so a highlight by map number still finds its atoms). A molfile's coordinates are lost in
 * that case: it is drawn again from the SMILES. Highlights are by atom map number (`highlightAtomMaps`), found from the
 * canonical SMILES and RDKit's `_smilesAtomOutputOrder`; a map number that is not in the structure highlights nothing.
 */
import type { DrawDetails } from '../depiction-options';
import { isTrap } from './errors';
import { withHandle } from './scope';
import { indexesOfMaps, outputOrder, smilesAtoms } from './smiles-atoms';
import type { RdkitMol, RdkitModule } from './types';

export type DrawResult = { readonly ok: true; readonly svg: string } | { readonly ok: false; readonly error: string };

const svgOf = (mol: RdkitMol, width: number, height: number, atoms: readonly number[]): DrawResult => ({
  ok: true,
  svg: mol.get_svg_with_highlights(JSON.stringify(atoms.length === 0 ? { width, height } : { width, height, atoms })),
});

function orderOf(mol: RdkitMol): readonly number[] | undefined {
  try {
    return outputOrder(mol.get_prop('_smilesAtomOutputOrder'));
  } catch (error) {
    if (isTrap(error)) throw error;
    return undefined;
  }
}

const NO_MAPS: DrawResult = { ok: false, error: 'the atom map numbers of the structure could not be located' };

export function drawMol(module: RdkitModule, mol: RdkitMol, details: DrawDetails): DrawResult {
  const { width, height } = details;
  if (details.showAtomMaps && details.highlightAtomMaps.length === 0) return svgOf(mol, width, height, []);

  const smiles = mol.get_smiles();
  const atoms = smilesAtoms(smiles);
  if (atoms === undefined) return NO_MAPS;
  if (!atoms.some((atom) => atom.map !== undefined)) return svgOf(mol, width, height, []); // nothing to hide or to highlight

  if (details.showAtomMaps) {
    const indexes = indexesOfMaps(atoms, details.highlightAtomMaps, orderOf(mol));
    return indexes === undefined ? NO_MAPS : svgOf(mol, width, height, indexes);
  }
  const plain = withHandle(
    () => module.get_mol(smiles.replace(/:\d+\]/g, ']')),
    (unmapped) => svgOf(unmapped, width, height, indexesOfMaps(atoms, details.highlightAtomMaps, undefined) ?? []),
  );
  return plain.opened ? plain.value : { ok: false, error: 'the structure could not be drawn without its atom map numbers' };
}
