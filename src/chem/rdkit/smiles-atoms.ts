/**
 * Atom map numbers from a SMILES that RDKit itself wrote (`get_smiles()`). MinimalLib's JSON has no map numbers, so they are
 * read from the canonical SMILES: in RDKit's output an atom is either a bracket atom (`[CH3:1]`, the map number is the
 * `:n` before the closing bracket) or an organic-subset atom, in the order RDKit's `_smilesAtomOutputOrder` reports. Not a
 * general SMILES parser: it reads the output of one writer. Returns `undefined` for a string that does not tokenise (an
 * unclosed bracket), so the caller leaves the fact undefined instead of guessing. Pure; linear.
 */

export interface SmilesAtom {
  /** `undefined` for an atom without a map number. */
  readonly map: number | undefined;
}

const MAP_IN_BRACKET = /:(\d{1,9})$/;
const ORGANIC = /[BCNOPSFIbcnops*]/;

export function smilesAtoms(smiles: string): readonly SmilesAtom[] | undefined {
  const atoms: SmilesAtom[] = [];
  const n = smiles.length;
  let i = 0;
  while (i < n) {
    const c = smiles.charAt(i);
    if (c === '[') {
      const close = smiles.indexOf(']', i + 1);
      if (close === -1) return undefined;
      const map = MAP_IN_BRACKET.exec(smiles.slice(i + 1, close));
      atoms.push({ map: map === null ? undefined : Number(map[1]) });
      i = close + 1;
      continue;
    }
    if ((c === 'C' && smiles.charAt(i + 1) === 'l') || (c === 'B' && smiles.charAt(i + 1) === 'r')) {
      atoms.push({ map: undefined });
      i += 2;
      continue;
    }
    if (ORGANIC.test(c)) atoms.push({ map: undefined });
    i += 1;
  }
  return atoms;
}

/** Every map number in the SMILES, ascending, repeats kept (a repeated number is something a check may want to report). */
export function atomMapsOf(atoms: readonly SmilesAtom[]): number[] {
  return atoms.flatMap((atom) => (atom.map === undefined ? [] : [atom.map])).sort((a, b) => a - b);
}

/** `_smilesAtomOutputOrder` (`[0,1,2,3]`): the atom index of the k-th atom in the written SMILES. */
export function outputOrder(prop: string): readonly number[] | undefined {
  const numbers = prop.match(/\d+/g);
  return numbers === null ? undefined : numbers.map(Number);
}

/**
 * The atom INDEXES (in the molecule RDKit holds) of the atoms carrying any of `maps`, or `undefined` when the SMILES and the
 * order do not line up. `positions` maps a token position to a molecule index: the identity for a molecule built from this
 * very SMILES, the output order for the molecule the SMILES was written from.
 */
export function indexesOfMaps(atoms: readonly SmilesAtom[], maps: readonly number[], positions: readonly number[] | undefined): number[] | undefined {
  if (positions !== undefined && positions.length !== atoms.length) return undefined;
  const wanted = new Set(maps);
  const indexes: number[] = [];
  for (let k = 0; k < atoms.length; k += 1) {
    const map = atoms[k]?.map;
    if (map === undefined || !wanted.has(map)) continue;
    const index = positions === undefined ? k : positions[k];
    if (index === undefined) return undefined;
    indexes.push(index);
  }
  return indexes;
}
