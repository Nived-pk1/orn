/**
 * Drawing options and the drawing itself for the RDKit adapter. RDKit draws atom map numbers as part of the atom label and has
 * no option to hide them, so a depiction without them is drawn from RDKit's own canonical SMILES with the `:n` removed (the
 * atom order is the SMILES order, so a highlight by map number still finds its atoms). A molfile's coordinates are lost in
 * that case: it is drawn again from the SMILES. Highlights are by atom map number (`highlightAtomMaps`), found from the
 * canonical SMILES and RDKit's `_smilesAtomOutputOrder`; a map number that is not in the structure highlights nothing.
 */
import { FIXED_SCALE_FACTOR } from '../contracts';
import type { DrawDetails } from '../depiction-options';
import { isTrap } from './errors';
import { condensedLabels, withExplicitHydrogens } from './modes';
import { withHandle } from './scope';
import { indexesOfMaps, outputOrder, smilesAtoms } from './smiles-atoms';
import type { RdkitMol, RdkitModule } from './types';

/** The size RDKit gave a drawing in its viewBox ("0 0 W H"); `undefined` when there is none or it is not two positive numbers. */
export function viewBoxSize(svg: string): { readonly width: number; readonly height: number } | undefined {
  const found = /viewBox=["']\s*0[\s,]+0[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/.exec(svg);
  const width = found === null ? Number.NaN : Number(found[1]);
  const height = found === null ? Number.NaN : Number(found[2]);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : undefined;
}

export type DrawResult = { readonly ok: true; readonly svg: string } | { readonly ok: false; readonly error: string };

/**
 * One drawing of `mol`, in the mode of `details` (the molecule is never changed: Condensed adds `atomLabels` to the drawing options,
 * Full draws a copy that has its hydrogens). `modes.ts` explains the two.
 */
function svgOf(module: RdkitModule, mol: RdkitMol, details: DrawDetails, atoms: readonly number[]): DrawResult {
  // a fixed scale: the canvas fits the molecule (-1 x -1) and `scalingFactor` gives every drawing the same bond length
  const size = details.fixedScale ? { width: -1, height: -1, scalingFactor: FIXED_SCALE_FACTOR } : { width: details.width, height: details.height };
  const base = atoms.length === 0 ? size : { ...size, atoms };
  if (details.mode === 'full') {
    const drawn = withExplicitHydrogens(module, mol, (withH) => withH.get_svg_with_highlights(JSON.stringify(base)));
    return drawn.opened ? { ok: true, svg: drawn.value } : { ok: false, error: 'the structure could not be drawn with all its hydrogens' };
  }
  if (details.mode === 'condensed') {
    const atomLabels = condensedLabels(module, mol);
    if (atomLabels === undefined) return { ok: false, error: 'the structure could not be drawn with its carbons labelled' };
    return { ok: true, svg: mol.get_svg_with_highlights(JSON.stringify({ ...base, atomLabels })) };
  }
  return { ok: true, svg: mol.get_svg_with_highlights(JSON.stringify(base)) };
}

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
  if (details.showAtomMaps && details.highlightAtomMaps.length === 0) return svgOf(module, mol, details, []);

  const smiles = mol.get_smiles();
  const atoms = smilesAtoms(smiles);
  if (atoms === undefined) return NO_MAPS;
  if (!atoms.some((atom) => atom.map !== undefined)) return svgOf(module, mol, details, []); // nothing to hide or to highlight

  if (details.showAtomMaps) {
    const indexes = indexesOfMaps(atoms, details.highlightAtomMaps, orderOf(mol));
    return indexes === undefined ? NO_MAPS : svgOf(module, mol, details, indexes);
  }
  const plain = withHandle(
    () => module.get_mol(smiles.replace(/:\d+\]/g, ']')),
    (unmapped) => svgOf(module, unmapped, details, indexesOfMaps(atoms, details.highlightAtomMaps, undefined) ?? []),
  );
  return plain.opened ? plain.value : { ok: false, error: 'the structure could not be drawn without its atom map numbers' };
}
