/**
 * Drawing options and the drawing itself for the RDKit adapter. RDKit draws atom map numbers as part of the atom label and has
 * no option to hide them, so a depiction without them is drawn from RDKit's own canonical SMILES with the `:n` removed (the
 * atom order is the SMILES order, so a highlight by map number still finds its atoms). A molfile's coordinates are lost in
 * that case: it is drawn again from the SMILES. Highlights are by atom map number (`highlightAtomMaps`), found from the
 * canonical SMILES and RDKit's `_smilesAtomOutputOrder`; a map number that is not in the structure highlights nothing.
 */
import { FIXED_SCALE_BOND_UNITS, FIXED_SCALE_FACTOR, FULL_BOND_FACTOR, LABEL_GLYPH_PX } from '../contracts';
import type { DrawDetails } from '../depiction-options';
import { isTrap } from './errors';
import { drawAllAtoms } from './full-mode';
import { condensedLabels, groupLabels } from './modes';
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

const GLYPH_PER_FONT = 0.73;
const fontFor = (bondPx: number): number => Math.round((LABEL_GLYPH_PX / GLYPH_PER_FONT) * FIXED_SCALE_BOND_UNITS / bondPx);

/** `allAtoms`: only for an all-atom request with a bond standard (`Depiction.allAtoms`). */
export type DrawResult = { readonly ok: true; readonly svg: string; readonly allAtoms?: boolean } | { readonly ok: false; readonly error: string };

/**
 * One drawing of `mol`, in the mode of `details` (the molecule is never changed: Condensed adds `atomLabels` to the drawing options,
 * Full draws a copy that has its hydrogens). `modes.ts` explains the two.
 */
export function svgOf(module: RdkitModule, mol: RdkitMol, details: DrawDetails, atoms: readonly number[]): DrawResult {
  // a fixed scale: the canvas fits the molecule (-1 x -1) and `scalingFactor` gives every drawing the same bond length
  // `bondPx`: labels set apart from the bond length: the font is fixed in SVG units so that, shown at `bondPx` per bond, a capital letter is LABEL_GLYPH_PX high (glyph = 0.73 of the font; RDKit reads `fixedFontSize` as a whole number, a fraction is ignored)
  const font = details.bondPx > 0 ? { fixedFontSize: fontFor(details.bondPx) } : {};
  const size = details.fixedScale ? { width: -1, height: -1, scalingFactor: FIXED_SCALE_FACTOR, clearBackground: false, ...font } : { width: details.width, height: details.height };
  const base = atoms.length === 0 ? size : { ...size, atoms };
  if (details.mode === 'full') {
    const atomLabels = groupLabels(mol);
    const options = Object.keys(atomLabels).length === 0 ? base : { ...base, atomLabels };
    const drawn = drawAllAtoms(module, mol, JSON.stringify(options));
    if (drawn === undefined) return { ok: false, error: 'the structure could not be drawn with all its hydrogens' };
    if (details.bondPx === 0) return { ok: true, svg: drawn.svg };
    if (drawn.score === 0) return { ok: true, svg: drawn.svg, allAtoms: true };
    // too crowded: Condensed, drawn for the standard without the Full factor, and the answer says so
    const plain = svgOf(module, mol, { ...details, mode: 'condensed', bondPx: Math.round(details.bondPx / FULL_BOND_FACTOR) }, atoms);
    return plain.ok ? { ...plain, allAtoms: false } : plain;
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
