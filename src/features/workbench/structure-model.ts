/**
 * The structure panel's edits and words (step 6.2a, part 3), without any chemistry: which notation a typed text is, the limits in words
 * (the schema's own `LIMITS`), and the recipes over the draft. Text is stored exactly as typed (INV-24); an empty field means the
 * structure is ABSENT. The chem worker, not this file, decides whether a structure can be read.
 */
import type { DraftRecipe } from '@/core/editing';
import { LIMITS, type StructureRep } from '@/core/schema';

export type StructureFormat = StructureRep['format'];

/** The notation of a typed text: a molfile has its "M  END" line, a CXSMILES has its `|...|` extension after the SMILES, else SMILES. */
export function formatOf(text: string): StructureFormat {
  if (/(^|\n)M {2}END/.test(text)) return 'molfile';
  return /\s\|[^|]*\|\s*$/.test(text) ? 'cxsmiles' : 'smiles';
}

/** The refusal in words when `text` is over the limit of its notation; undefined when it fits. Nothing is ever cut. */
export function limitProblem(text: string): string | undefined {
  const format = formatOf(text);
  const limit = format === 'molfile' ? LIMITS.molfile : LIMITS.inlineStructure;
  if (text.length <= limit) return undefined;
  const kind = format === 'molfile' ? 'A molfile' : 'A SMILES or CXSMILES line';
  return `${kind} can have at most ${limit.toLocaleString('en-US')} characters; this one has ${text.length.toLocaleString('en-US')}. It was not accepted and nothing was cut.`;
}

export const setStructureText = (text: string): DraftRecipe => (draft) => {
  if (text === '') Reflect.deleteProperty(draft, 'structure');
  else draft.structure = { format: formatOf(text), value: text };
};

export const setDerivedFormula = (formula: string): DraftRecipe => (draft) => {
  draft.formula = formula;
};

/** What the draft holds of the structure, formula, charge and stereo, as plain values for the panel. */
export interface StructureView {
  readonly text: string;
  readonly structure: StructureRep | undefined;
  readonly formula: string | undefined;
  readonly charge: number | undefined;
  readonly stereoKind: string | undefined;
  readonly descriptors: readonly string[];
}

export function structureViewOf(draft: unknown): StructureView {
  const fields = (typeof draft === 'object' && draft !== null ? draft : {}) as Record<string, unknown>;
  const rep = fields['structure'] as { format?: unknown; value?: unknown } | undefined;
  const structure = typeof rep?.value === 'string' && rep.value !== '' && (rep.format === 'smiles' || rep.format === 'cxsmiles' || rep.format === 'molfile') ? ({ format: rep.format, value: rep.value } as StructureRep) : undefined;
  const stereo = fields['stereo'] as { kind?: unknown; descriptors?: unknown } | undefined;
  return {
    text: typeof rep?.value === 'string' ? rep.value : '',
    structure,
    formula: typeof fields['formula'] === 'string' ? fields['formula'] : undefined,
    charge: typeof fields['charge'] === 'number' ? fields['charge'] : undefined,
    stereoKind: typeof stereo?.kind === 'string' ? stereo.kind : undefined,
    descriptors: Array.isArray(stereo?.descriptors) ? stereo.descriptors.filter((d): d is string => typeof d === 'string') : [],
  };
}
