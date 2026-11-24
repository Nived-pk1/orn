/**
 * Step 8.5e: atom positions (what the curved arrows are laid on) are found for every mapped atom when the drawing's labels are set apart from the bond length
 * (`bondPx`), as they are without it.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createRdkitToolkit, loadRdkit, type StructureToolkit } from '@/chem';

let toolkit: StructureToolkit;
beforeAll(async () => {
  const shared = await loadRdkit();
  toolkit = createRdkitToolkit({ load: async () => shared });
  await toolkit.ready();
}, 60_000);

const SPECIES: readonly [string, readonly number[]][] = [
  ['[OH-:1]', [1]],
  ['[H:2][CH2:3][CH:4]=[O:5]', [2, 3, 4, 5]],
  ['[CH2:3]=[CH:4][O-:5]', [3, 4, 5]],
  ['[H:2][OH:1]', [1, 2]],
  ['[CH3:6][CH:7]=[O:8]', [6, 7, 8]],
  ['[Na+:3].[CH3:1][CH:2]([CH3:4])[O-:5]', [1, 2, 3, 4, 5]],
  ['[Na+:1]', [1]],
];

describe('atom positions with labels set apart from the bond (8.5e)', () => {
  it.each([undefined, 24, 28, 30, 32, 34, 36, 38, 40, 44, 50])('every mapped atom has a position (bondPx %s)', async (bondPx) => {
    for (const [smiles, maps] of SPECIES) {
      const out = await toolkit.depict({ format: 'smiles', value: smiles }, { width: 120, height: 80, showAtomMaps: false, fixedScale: true, atomPositions: true, ...(bondPx === undefined ? {} : { bondPx }) });
      if (!out.ok) throw new Error(`${smiles}: ${out.error}`);
      expect((out.depiction.atoms ?? []).map((a) => a.map).sort(), `${smiles} at bondPx ${bondPx}`).toEqual([...maps].sort());
    }
  }, 30_000);
});
