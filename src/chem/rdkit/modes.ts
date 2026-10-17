/**
 * The structures modes of a drawing (equation step, part 4). The mode changes the DRAWING OPTIONS and a copy of the molecule only; the
 * stored structure is never touched (INV-11). Facts below were proved against RDKit MinimalLib 2026.03.6 (docs/PROGRESS.md, "Equation
 * step, part 3"):
 *   skeletal   RDKit's own skeletal drawing (the default).
 *   condensed  every chain carbon is labelled with its hydrogens (CH3, CH2, CH, C; the digit is a subscript through `<sub>` in the
 *              drawing option `atomLabels`). A carbon that is part of a ring is left alone, so a ring stays a ring (benzene, cyclohexane).
 *              A charged, radical or isotope-labelled carbon is left to RDKit's own label (it already says more than "CHn").
 *   full       every hydrogen is its own atom with its own bond: the molblock RDKit writes after `add_hs()` (it carries 2D coordinates for
 *              the new hydrogens) is read again and drawn. Heavy atoms keep their indexes, so a highlight by atom index still finds them.
 */
import { withHandle } from './scope';
import type { RdkitMol, RdkitModule } from './types';

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/** The indexes of the atoms that are in a ring (SMARTS `[R]`); `undefined` when RDKit could not say. */
function ringAtomsOf(module: RdkitModule, mol: RdkitMol): ReadonlySet<number> | undefined {
  if (mol.get_substruct_matches === undefined) return undefined;
  const matched = withHandle(
    () => module.get_qmol('[R]'),
    (query) => mol.get_substruct_matches?.(query),
  );
  if (!matched.opened || matched.value === undefined) return undefined;
  const parsed: unknown = JSON.parse(matched.value); // no match at all answers `{}`
  if (!Array.isArray(parsed)) return new Set();
  return new Set(parsed.flatMap((match) => (isRecord(match) && Array.isArray(match.atoms) ? match.atoms.filter((a): a is number => typeof a === 'number') : [])));
}

/** `atomLabels` for the condensed mode: atom index -> "CH3", "CH2", "CH" or "C". `undefined`: RDKit could not give what is needed. */
export function condensedLabels(module: RdkitModule, mol: RdkitMol): Readonly<Record<number, string>> | undefined {
  const root: unknown = JSON.parse(mol.get_json());
  const molecule = isRecord(root) && Array.isArray(root.molecules) ? (root.molecules[0] as unknown) : undefined;
  const defaults = isRecord(root) && isRecord(root.defaults) && isRecord(root.defaults.atom) ? root.defaults.atom : undefined;
  if (!isRecord(molecule) || !Array.isArray(molecule.atoms) || defaults === undefined) return undefined;
  const rings = ringAtomsOf(module, mol);
  if (rings === undefined) return undefined;
  const labels: Record<number, string> = {};
  molecule.atoms.forEach((atom: unknown, index: number) => {
    if (!isRecord(atom) || rings.has(index)) return;
    const z = finite(atom.z) ?? finite(defaults.z);
    const hydrogens = finite(atom.impHs) ?? finite(defaults.impHs);
    const odd = (finite(atom.chg) ?? finite(defaults.chg) ?? 0) !== 0 || (finite(atom.nRad) ?? finite(defaults.nRad) ?? 0) !== 0 || (finite(atom.isotope) ?? finite(defaults.isotope) ?? 0) !== 0;
    if (z !== 6 || hydrogens === undefined || odd) return;
    labels[index] = hydrogens === 0 ? 'C' : hydrogens === 1 ? 'CH' : `CH<sub>${hydrogens}</sub>`;
  });
  return labels;
}

/**
 * Draws a COPY of the molecule with every hydrogen explicit: `run` is given it and it is freed afterwards. `{ opened: false }`: RDKit
 * could not add the hydrogens or read the result back.
 */
export function withExplicitHydrogens<R>(module: RdkitModule, mol: RdkitMol, run: (withH: RdkitMol) => R): { readonly opened: true; readonly value: R } | { readonly opened: false } {
  if (mol.add_hs === undefined) return { opened: false };
  const block = mol.add_hs();
  if (block === '') return { opened: false };
  return withHandle(() => module.get_mol(block), run);
}
