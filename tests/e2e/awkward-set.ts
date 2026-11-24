/**
 * The awkward set of step 8.5d (a TEST fixture, never demo data): ten substances that stress the one size rule, each the reactant of its own
 * reaction in the Aldehydes family (cloned from the demo's ethanal oxidation in memory when the test runs; the demo files are never edited).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Awkward {
  readonly n: number;
  readonly label: string;
  readonly name: string;
  readonly smiles?: string;
  /** A substance with no structure: its formula as the text box shows it. */
  readonly formula?: string;
}

export const AWKWARD: readonly Awkward[] = [
  { n: 1, label: 'methane', name: 'Methane', smiles: 'C' },
  { n: 2, label: 'bromide', name: 'Bromide ion', smiles: '[Br-]' },
  { n: 3, label: 'C20 chain', name: 'Icosane', smiles: 'CCCCCCCCCCCCCCCCCCCC' },
  { n: 4, label: 'dimethyl hexanedioate', name: 'Dimethyl hexanedioate', smiles: 'COC(=O)CCCCC(=O)OC' },
  { n: 5, label: 'text formula', name: 'Ester as written', formula: 'CH3COO-CH2-CH2-R' },
  { n: 6, label: 'glucose', name: 'Glucose (open chain)', smiles: 'OCC(O)C(O)C(O)C(O)C=O' },
  { n: 7, label: 'cholesterol', name: 'Cholesterol', smiles: 'CC(C)CCCC(C)C1CCC2C1(CCC3C2CC=C4C3(CCC(C4)O)C)C' },
  { n: 8, label: 'three products', name: 'Propanal', smiles: 'CCC=O' },
  { n: 9, label: 'long name', name: '3-(4-hydroxy-2-methyl-3-oxocyclohexyl)-2,5-dimethylhexane-1,6-diol', smiles: 'CC(CO)C(C)CC(C)(CCO)C1CCC(O)C(C)C1=O' },
  { n: 10, label: 'ion pair', name: 'Sodium propan-2-olate', smiles: '[Na+].CC(C)[O-]' },
];

/** The reaction name the family page and the inspector show. */
export const reactionName = (item: Awkward): string => `AW${item.n} ${item.label} (test)`;
export const reactionId = (item: Awkward): string => `rxn_aw${item.n}`;

export function awkwardFile(): { name: string; mimeType: string; buffer: Buffer } {
  const doc = JSON.parse(readFileSync(resolve(process.cwd(), 'data/seed/demo.orn.json'), 'utf8')) as { records: Record<string, Record<string, unknown>[]> };
  const { species, reaction } = doc.records as { species: Record<string, unknown>[]; reaction: Record<string, unknown>[] };
  const baseSpecies = species.find((s) => s.id === 'spc_ethanal') as Record<string, unknown>;
  const baseReaction = reaction.find((r) => r.id === 'rxn_ethanal-to-ethanoic-acid') as Record<string, unknown>;
  for (const item of AWKWARD) {
    const id = `spc_aw${item.n}`;
    const made: Record<string, unknown> = { ...baseSpecies, id, names: { canonical: item.name, common: [], aliases: [] }, properties: [], classIds: ['cls_aldehydes'] };
    if (item.formula === undefined) made.structure = { format: 'smiles', value: item.smiles };
    else delete made.structure;
    made.formula = item.formula ?? 'CH4';
    species.push(made);
    const text = JSON.stringify(baseReaction).split('rxn_ethanal-to-ethanoic-acid').join(reactionId(item)).split('ethanal-to-ethanoic-acid').join(`aw${item.n}`).split('spc_ethanal').join(id);
    const clone = JSON.parse(text) as Record<string, unknown>;
    clone.name = reactionName(item);
    if (item.n === 8) {
      const outcome = (clone.outcomes as { products: Record<string, unknown>[] }[])[0] as { products: Record<string, unknown>[] };
      outcome.products.push({ id: 'pdt_aw8-2', ref: { kind: 'species', id: 'spc_water' }, role: 'byproduct' }, { id: 'pdt_aw8-3', ref: { kind: 'species', id: 'spc_ethene' }, role: 'byproduct' });
    }
    reaction.push(clone);
  }
  return { name: 'awkward-set.orn.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) };
}
