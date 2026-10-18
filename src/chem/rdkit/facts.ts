/**
 * `StructureFacts` from an RDKit molecule. Every fact comes from RDKit's own output (its canonical SMILES, its JSON, its
 * stereo tags); a fact RDKit does not give for this structure is LEFT UNDEFINED and a warning says so, never guessed
 * (CLAUDE.md §1.5). Definitions, so a check can rely on them:
 *   canonicalSmiles  RDKit's canonical isomeric SMILES, atom map numbers included.
 *   formula          Hill formula of everything in the structure (all components summed, implicit hydrogens included, no
 *                    charge, no isotopes); undefined if an atom is a dummy or an unknown element.
 *   charge           sum of formal charges.
 *   heavyAtomCount   atoms other than hydrogen.
 *   carbonCount      the atoms of atomic number 6 in RDKit's JSON (an atom with no `z` has the default element); undefined when RDKit gave
 *                    no default element and an atom has no `z`.
 *   specified/unspecifiedStereocentres, hasDoubleBondStereo   from RDKit's stereo tags (`(?)` = not specified).
 *   aromatic         any aromatic atom after RDKit's own sanitisation.
 *   atomMaps         the map numbers in the canonical SMILES, ascending, repeats kept.
 * A trap (see errors.ts) is NOT caught here: it propagates so the adapter can drop the module.
 */
import type { CipCounts, StructureFacts } from '../contracts';
import { describe, isTrap } from './errors';
import { symbolOf } from './elements';
import { atomMapsOf, smilesAtoms } from './smiles-atoms';
import type { RdkitMol } from './types';

const MAX_WARNINGS = 10;

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

interface AtomDefaults {
  readonly z: number;
  readonly impHs: number;
  readonly chg: number;
}
interface MolJson {
  readonly atoms: readonly Json[];
  readonly defaults: AtomDefaults | undefined;
  /** `undefined` when the representation extension is absent (RDKit did not say). */
  readonly aromaticAtoms: number | undefined;
  /** `undefined` when an atom has no `z` and RDKit gave no default. */
  readonly carbonCount: number | undefined;
}

function carbonCountOf(atoms: readonly Json[], defaultZ: number | undefined): number | undefined {
  let carbons = 0;
  for (const atom of atoms) {
    const z = finite(atom.z) ?? defaultZ;
    if (z === undefined) return undefined;
    if (z === 6) carbons += 1;
  }
  return carbons;
}

function readMolJson(text: string): MolJson | undefined {
  const root: unknown = JSON.parse(text);
  const molecules = isRecord(root) ? root.molecules : undefined;
  const molecule = Array.isArray(molecules) ? (molecules[0] as unknown) : undefined;
  if (!isRecord(molecule) || !Array.isArray(molecule.atoms)) return undefined;
  const raw = isRecord(root) && isRecord(root.defaults) && isRecord(root.defaults.atom) ? root.defaults.atom : undefined;
  const z = finite(raw?.z);
  const impHs = finite(raw?.impHs);
  const chg = finite(raw?.chg);
  const extension = Array.isArray(molecule.extensions) ? molecule.extensions.find((e: unknown) => isRecord(e) && e.name === 'rdkitRepresentation') : undefined;
  const aromatic = isRecord(extension) ? (Array.isArray(extension.aromaticAtoms) ? extension.aromaticAtoms.length : 0) : undefined;
  const atoms = molecule.atoms.filter(isRecord);
  return { atoms, defaults: z === undefined || impHs === undefined || chg === undefined ? undefined : { z, impHs, chg }, aromaticAtoms: aromatic, carbonCount: carbonCountOf(atoms, z) };
}

function hillFormula(json: MolJson): string | undefined {
  const { defaults } = json;
  if (defaults === undefined) return undefined;
  const counts = new Map<string, number>();
  const add = (symbol: string, n: number): void => void counts.set(symbol, (counts.get(symbol) ?? 0) + n);
  for (const atom of json.atoms) {
    const symbol = symbolOf(finite(atom.z) ?? defaults.z);
    if (symbol === undefined) return undefined;
    add(symbol, 1);
    const hydrogens = finite(atom.impHs) ?? defaults.impHs;
    if (hydrogens > 0) add('H', hydrogens);
  }
  const symbols = [...counts.keys()].sort();
  const ordered = counts.has('C') ? ['C', ...(counts.has('H') ? ['H'] : []), ...symbols.filter((s) => s !== 'C' && s !== 'H')] : symbols;
  return ordered.map((symbol) => `${symbol}${counts.get(symbol) === 1 ? '' : String(counts.get(symbol))}`).join('');
}

const charge = (json: MolJson): number | undefined =>
  json.defaults === undefined ? undefined : json.atoms.reduce((sum: number, atom) => sum + (finite(atom.chg) ?? json.defaults?.chg ?? 0), 0);

interface StereoCounts {
  readonly specified: number;
  readonly unspecified: number;
  readonly doubleBond: boolean;
  readonly cip: CipCounts;
}

const LABELS: readonly (keyof CipCounts)[] = ['R', 'S', 'r', 's', 'E', 'Z'];

/** `(?)` marks an element with no configuration given; any other label ((R), (S), (r), (s), (E), (Z)) is a configuration. */
function readStereo(text: string): StereoCounts | undefined {
  const root: unknown = JSON.parse(text);
  if (!isRecord(root) || !Array.isArray(root.CIP_atoms) || !Array.isArray(root.CIP_bonds)) return undefined;
  const labelOf = (entry: unknown): string => (Array.isArray(entry) ? String(entry[entry.length - 1]) : '');
  const atoms = root.CIP_atoms.map(labelOf);
  const bonds = root.CIP_bonds.map(labelOf);
  const count = (label: string): number => atoms.filter((l) => l === `(${label})`).length + bonds.filter((l) => l === `(${label})`).length;
  const cip = Object.fromEntries(LABELS.map((label) => [label, count(label)])) as unknown as CipCounts;
  return { specified: atoms.filter((l) => l !== '(?)').length, unspecified: atoms.filter((l) => l === '(?)').length, doubleBond: bonds.some((l) => l !== '(?)'), cip };
}

export function factsOf(mol: RdkitMol): StructureFacts {
  const warnings: string[] = [];
  const note = (message: string): void => void (warnings.length < MAX_WARNINGS && warnings.push(message));
  /** One fact: a refusal by RDKit becomes a warning and an undefined fact; a trap passes through. */
  const attempt = <T>(fact: string, read: () => T | undefined): T | undefined => {
    try {
      const value = read();
      if (value === undefined) note(`${fact}: RDKit did not give it for this structure`);
      return value;
    } catch (error) {
      if (isTrap(error)) throw error;
      note(`${fact}: ${describe(error)}`);
      return undefined;
    }
  };

  const smiles = attempt('canonicalSmiles', () => mol.get_smiles() || undefined);
  const atoms = smiles === undefined ? undefined : smilesAtoms(smiles);
  if (smiles !== undefined && atoms === undefined) note('atomMaps: the canonical SMILES could not be read for map numbers');
  const heavy = attempt('heavyAtomCount', () => finite(mol.get_num_atoms(true)));
  const json = attempt('formula, charge, aromatic', () => readMolJson(mol.get_json()));
  const stereo = attempt('stereo counts', () => readStereo(mol.get_stereo_tags()));
  const formula = json === undefined ? undefined : hillFormula(json);
  const total = json === undefined ? undefined : charge(json);
  if (json !== undefined && formula === undefined) note('formula: an atom is a dummy or not an element in the table');
  if (json !== undefined && total === undefined) note('charge: RDKit gave no default atom values');
  if (json !== undefined && json.aromaticAtoms === undefined) note('aromatic: RDKit did not report its representation');
  if (json !== undefined && json.carbonCount === undefined) note('carbonCount: an atom has no atomic number and RDKit gave no default');

  return {
    ...(smiles === undefined ? {} : { canonicalSmiles: smiles }),
    ...(formula === undefined ? {} : { formula }),
    ...(total === undefined ? {} : { charge: total }),
    ...(heavy === undefined ? {} : { heavyAtomCount: heavy }),
    ...(json?.carbonCount === undefined ? {} : { carbonCount: json.carbonCount }),
    ...(stereo === undefined ? {} : { specifiedStereocentres: stereo.specified, unspecifiedStereocentres: stereo.unspecified, hasDoubleBondStereo: stereo.doubleBond, cipCounts: stereo.cip }),
    ...(json?.aromaticAtoms === undefined ? {} : { aromatic: json.aromaticAtoms > 0 }),
    atomMaps: atoms === undefined ? [] : atomMapsOf(atoms),
    warnings,
  };
}
