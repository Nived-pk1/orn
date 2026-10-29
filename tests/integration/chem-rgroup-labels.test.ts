/**
 * 7.2b A7: a class's generic structure drawn with the textbook labels R, R', R'', X and Ar (CXSMILES atom labels) is drawn WITH THAT
 * LABEL in Skeletal and in Show all atoms, by real RDKit MinimalLib. RDKit sets labels as glyph paths, so the proof is that each label's
 * drawing is its own: it differs from the drawing of every other label and from the same structure with no label. Before this step
 * Show all atoms drew every label as R (the hydrogens-added copy passes through a molblock, which keeps no label).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createRdkitToolkit, loadRdkit, type StructureToolkit } from '@/chem';
import { STRUCTURE_MODES } from '@/chem';

const LABELS = ['R', "R'", "R''", 'X', 'Ar'] as const;
let toolkit: StructureToolkit;

beforeAll(async () => {
  const module = await loadRdkit();
  toolkit = createRdkitToolkit({ load: async () => module });
  await toolkit.ready();
}, 60_000);

async function draw(label: string | undefined, mode: (typeof STRUCTURE_MODES)[number]): Promise<string> {
  const value = label === undefined ? '*C(=O)O' : `*C(=O)O |$${label};;;$|`;
  const out = await toolkit.depict({ format: 'cxsmiles', value } as never, { width: 300, height: 200, showAtomMaps: true, mode });
  if (!out.ok) throw new Error(`${label ?? 'no label'} / ${mode}: ${out.reason} ${out.error}`);
  return out.depiction.svg;
}

describe.each(STRUCTURE_MODES)('mode %s', (mode) => {
  it.each(LABELS)('the label %s is drawn as its own label', async (label) => {
    const mine = await draw(label, mode);
    const unlabelled = await draw(undefined, mode);
    // Show all atoms draws an unlabelled generic atom as "R" (RDKit's molblock), so only R itself may equal the unlabelled drawing there
    if (!(mode === 'full' && label === 'R')) expect(mine, 'same as the drawing with no label').not.toBe(unlabelled);
    for (const other of LABELS) {
      if (other !== label) expect(mine, `same as the drawing of ${other}`).not.toBe(await draw(other, mode));
    }
  });
});
