/**
 * A drawing with the positions of its mapped atoms (step 8.5, ADR-038 "As built 8.5"). The structure is read WITH its explicit
 * hydrogens (a proton transfer names a mapped hydrogen, which RDKit's default read removes), written as RDKit's own SMILES, the map
 * numbers are recorded by atom index from THAT SMILES (token order = atom index for a molecule built from it), then removed in the
 * text and the molecule is read again, so the picture has no map labels and atom k of the drawing is token k. The shown drawing and a
 * highlighted copy of it are made at one fixed scale; `svg-positions.ts` reads the atom centres from the copy. Failure values only:
 * a structure that is not a line notation, a repeated map number, an atom count that does not line up, or a drawing whose classes
 * RDKit changed is `refused`, with the reason in words, so the step is shown as "No drawing" and never as a partial arrow.
 */
import type { StructureRep } from '@/core/schema';
import type { DepictedAtom, DepictedBond, DepictedGlyph } from '../contracts';
import type { DrawDetails } from '../depiction-options';
import { svgOf } from './draw';
import { withHandle } from './scope';
import { smilesAtoms } from './smiles-atoms';
import { turnedBlock } from './turned';
import { labelGlyphsOf, readPositions } from './svg-positions';
import type { RdkitMol, RdkitModule } from './types';

export type PositionedDrawing =
  | { readonly ok: true; readonly svg: string; readonly atoms: readonly DepictedAtom[]; readonly bonds: readonly DepictedBond[]; readonly glyphs: readonly DepictedGlyph[] }
  | { readonly ok: false; readonly reason: 'refused'; readonly error: string };

const refuse = (why: string): PositionedDrawing => ({ ok: false, reason: 'refused', error: `no atom positions: ${why}` });
const KEEP_HYDROGENS = '{"removeHs":false}';
const withoutCisTrans = (smiles: string): string => smiles.replace(/[/\\]/g, '');

/** The bonds (pairs of atom indexes) of RDKit's JSON of a molecule; `undefined` when the JSON is not of the expected shape. */
function bondPairs(mol: RdkitMol): readonly (readonly [number, number])[] | undefined {
  const root: unknown = JSON.parse(mol.get_json());
  const molecule = (root as { molecules?: unknown[] } | null)?.molecules?.[0] as { bonds?: { atoms?: unknown }[] } | undefined;
  if (molecule === undefined) return undefined;
  const pairs: (readonly [number, number])[] = [];
  for (const bond of molecule.bonds ?? []) {
    const ends = bond.atoms;
    if (!Array.isArray(ends) || ends.length !== 2 || !ends.every((n) => Number.isInteger(n))) return undefined;
    pairs.push([ends[0] as number, ends[1] as number]);
  }
  return pairs;
}

export function drawWithPositions(module: RdkitModule, structure: StructureRep, mol: RdkitMol, details: DrawDetails): PositionedDrawing {
  if (structure.format === 'molfile') return refuse('a molfile has no atom map numbers');
  const kept = withHandle(
    () => module.get_mol(structure.value, KEEP_HYDROGENS),
    (full) => full.get_smiles(),
  );
  if (!kept.opened) return refuse('the structure could not be read with its hydrogens');
  const tokens = smilesAtoms(kept.value);
  if (tokens === undefined) return refuse('the map numbers of the structure could not be located');
  const maps = tokens.flatMap((token, index) => (token.map === undefined ? [] : [{ index, map: token.map }]));
  if (new Set(maps.map((m) => m.map)).size !== maps.length) return refuse('a map number is written more than once');
  if (maps.length === 0) {
    const none = svgOf(module, mol, details, []);
    return none.ok ? { ok: true, svg: none.svg, atoms: [], bonds: [], glyphs: labelGlyphsOf(none.svg) } : refuse(none.error);
  }
  const plain = withHandle(
    () => module.get_mol(kept.value.replace(/:\d+\]/g, ']'), KEEP_HYDROGENS),
    (plainMol): PositionedDrawing => {
      const drawnFrom = (unmapped: RdkitMol): PositionedDrawing => {
        if (unmapped.get_num_atoms(false) !== tokens.length) return refuse('the atoms of the drawing are not the atoms of the structure');
        const shown = svgOf(module, unmapped, details, []);
        const lit = svgOf(module, unmapped, details, maps.map((m) => m.index));
        if (!shown.ok) return refuse(shown.error);
        if (!lit.ok) return refuse(lit.error);
        const read = readPositions(shown.svg, lit.svg, maps.map((m) => m.index));
        if (!read.ok) return refuse(read.error);
        const mapOf = new Map(maps.map((m) => [m.index, m.map]));
        const atoms = read.atoms.map((a): DepictedAtom => ({ map: mapOf.get(a.index) as number, x: a.x, y: a.y, rx: a.rx, ry: a.ry }));
        const pairs = bondPairs(unmapped);
        if (pairs === undefined) return refuse('the bonds of the structure could not be read');
        const bonds = pairs.flatMap(([i, j]): DepictedBond[] => {
          const a = mapOf.get(i);
          const b = mapOf.get(j);
          return a === undefined || b === undefined ? [] : [{ a: Math.min(a, b), b: Math.max(a, b) }];
        });
        bonds.sort((p, q) => p.a - q.a || p.b - q.b);
        return { ok: true, svg: shown.svg, atoms, bonds, glyphs: labelGlyphsOf(shown.svg) };
      };
      // every drawing (turn 0 too) is made from the molblock's coordinates: a molecule from a SMILES is drawn at another angle than the
      // coordinates it reports, and a turn must start from the picture that was shown unturned
      const block = turnedBlock(plainMol.get_molblock?.(), details.turn);
      const turned =
        block === undefined
          ? undefined
          : withHandle(
              () => module.get_mol(block, KEEP_HYDROGENS),
              // the same SMILES: the copy is the same molecule, atom for atom, with the same configuration (cis/trans marks are left out of the
              // comparison: a copy states them from its coordinates, which a turn or a mirror image keeps)
              (copy) => (withoutCisTrans(copy.get_smiles()) === withoutCisTrans(plainMol.get_smiles()) ? drawnFrom(copy) : undefined),
            );
      if (turned?.opened === true && turned.value !== undefined) return turned.value;
      return details.turn === 0 ? drawnFrom(plainMol) : refuse('the structure may not be drawn turned this way');
    },
  );
  return plain.opened ? plain.value : refuse('the structure could not be drawn without its map numbers');
}
