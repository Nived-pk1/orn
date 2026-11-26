/**
 * The drawing with all atoms (step 8.5g B1). The hydrogens are made explicit and RDKit lays the molecule out WITH them; when that drawing is
 * crowded (crowding.ts), CoordGen's layout of the same molecule is tried, its coordinates scaled to RDKit's bond length, and the one with the
 * lower crowding score is kept (a tie keeps RDKit's). When even that one is crowded and the picture is one with a bond standard (`bondPx`),
 * the answer says so (`crowded`) and the caller draws the structure condensed: never a tangled picture, never a silent switch. Same input,
 * same picture: neither layout is random.
 */
import { blockGeometry, crowdingOf, crowdingScore } from './crowding';
import { withExplicitHydrogens } from './modes';
import { withHandle } from './scope';
import type { RdkitMol, RdkitModule } from './types';

/** The bond length of RDKit's own coordinates, which the fixed scale of a drawing assumes. */
const BOND = 1.5;
const KEEP_HYDROGENS = '{"removeHs":false}';

export interface Drawn {
  readonly svg: string;
  readonly score: number;
}

/** The molblock with its x and y scaled so that its median bond is `BOND` long. */
function rescaled(block: string): string | undefined {
  const geometry = blockGeometry(block);
  if (geometry === undefined || !(geometry.bond > 0)) return undefined;
  const factor = BOND / geometry.bond;
  const lines = block.split('\n');
  const field = (value: number): string => value.toFixed(4).padStart(10);
  geometry.atoms.forEach(([x, y], i) => {
    lines[4 + i] = field(x * factor) + field(y * factor) + (lines[4 + i] ?? '').slice(20);
  });
  return lines.join('\n');
}

const drawn = (mol: RdkitMol, options: string): Drawn => {
  const svg = mol.get_svg_with_highlights(options);
  return { svg, score: crowdingScore(crowdingOf(svg, mol.get_molblock?.() ?? '')) };
};

/** CoordGen's drawing of the explicit-hydrogen molecule; `undefined` when it cannot be made or is not the same molecule. */
function coordGen(module: RdkitModule, withH: RdkitMol, options: string): Drawn | undefined {
  const block = withH.get_molblock?.();
  if (block === undefined) return undefined;
  const laidOut = withHandle(
    () => module.get_mol(block, KEEP_HYDROGENS),
    (copy) => {
      if (copy.set_new_coords === undefined) return undefined;
      const smiles = copy.get_smiles();
      copy.set_new_coords(true);
      const moved = rescaled(copy.get_molblock?.() ?? '');
      if (moved === undefined) return undefined;
      const read = withHandle(
        () => module.get_mol(moved, KEEP_HYDROGENS),
        (final) => (final.get_smiles() === smiles ? drawn(final, options) : undefined),
      );
      return read.opened ? read.value : undefined;
    },
  );
  return laidOut.opened ? laidOut.value : undefined;
}

/** The least crowded drawing of `mol` with all its atoms; `undefined`: the hydrogens could not be added. */
export function drawAllAtoms(module: RdkitModule, mol: RdkitMol, options: string): Drawn | undefined {
  const made = withExplicitHydrogens(module, mol, (withH) => {
    const own = drawn(withH, options);
    if (own.score === 0 || withH.get_molblock === undefined) return own;
    const other = coordGen(module, withH, options);
    return other !== undefined && other.score < own.score ? other : own;
  });
  return made.opened ? made.value : undefined;
}
