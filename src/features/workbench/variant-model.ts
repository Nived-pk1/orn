/**
 * The reaction's condition variants as recipes over the draft, and their view (step 6.4a decisions D3 and D4). A variant is a label, the stage
 * it overrides (`stageId`; absent = the first stage of kind reaction, as the arrow reads it) and ONLY the parameters it overrides; the parameters
 * are edited with the same recipes as a stage's (`condition-model.ts`, `variantLoc`). A new variant starts empty: its label is required (the
 * form asks for it) and its stage is the only stage when there is exactly one, else the person's choice. Removing a variant an outcome names is
 * refused in words (its 'Holds under' is edited in the Outcomes section); one no outcome names is removed after a question, and the participants it lists (present
 * only under it) are named, because they become common. No chemistry here.
 */
import { conditionPartsOf } from '@/core/graph';
import type { DraftRecipe } from '@/core/editing';
import { hasField, parametersOf, validParametersOf, variantLoc } from './condition-model';

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const listOf = (draft: Fields, field: string): unknown[] => {
  if (!Array.isArray(draft[field])) draft[field] = [];
  return draft[field] as unknown[];
};
const variantAt = (draft: Fields, index: number): Fields | undefined => {
  const item = listOf(draft, 'conditionVariants')[index];
  return isBag(item) ? item : undefined;
};

/** A new variant: the ID is given; no overrides yet, no participants. `stageId` is absent only when the reaction has no stage. */
export const addVariant = (id: string, label: string, stageId: string | undefined): DraftRecipe => (draft) => {
  listOf(draft, 'conditionVariants').push({ id, label, ...(stageId === undefined || stageId === '' ? {} : { stageId }), participantIds: [], parameters: { solventCharacter: [], activation: [], other: [], parsedFields: [] } });
};
export const setVariantLabel = (index: number, value: string): DraftRecipe => (draft) => {
  const variant = variantAt(draft, index);
  if (variant !== undefined) variant.label = value;
};
/** '' removes the stage (the arrow then reads the first stage of kind reaction). */
export const setVariantStage = (index: number, stageId: string): DraftRecipe => (draft) => {
  const variant = variantAt(draft, index);
  if (variant === undefined) return;
  if (stageId === '') Reflect.deleteProperty(variant, 'stageId');
  else variant.stageId = stageId;
};
/** The variant's note (mini-markup); empty = absent. */
export const setVariantNote = (index: number, value: string): DraftRecipe => (draft) => {
  const variant = variantAt(draft, index);
  if (variant === undefined) return;
  if (value === '') Reflect.deleteProperty(variant, 'note');
  else variant.note = value;
};
/** Lists the participant as present only under this variant, or takes it off the list. The participant stays in the reaction and in its stage. */
export const setVariantParticipant = (index: number, participantId: string, listed: boolean): DraftRecipe => (draft) => {
  const variant = variantAt(draft, index);
  if (variant === undefined) return;
  const ids = listOf(variant, 'participantIds');
  const at = ids.indexOf(participantId);
  if (listed && at < 0) ids.push(participantId);
  if (!listed && at >= 0) ids.splice(at, 1);
};
export const removeVariant = (index: number): DraftRecipe => (draft) => {
  const variants = listOf(draft, 'conditionVariants');
  if (index >= 0 && index < variants.length) variants.splice(index, 1);
};
export const moveVariant = (index: number, by: -1 | 1): DraftRecipe => (draft) => {
  const variants = listOf(draft, 'conditionVariants');
  const to = index + by;
  if (index < 0 || index >= variants.length || to < 0 || to >= variants.length) return;
  const moved = variants[index];
  variants[index] = variants[to];
  variants[to] = moved;
};

export interface VariantView {
  readonly id: string;
  readonly label: string;
  readonly stageId: string;
  readonly participantCount: number;
  readonly participantIds: readonly string[];
  readonly note: string;
}

export function variantsViewOf(draft: unknown): readonly VariantView[] {
  const variants = isBag(draft) && Array.isArray(draft.conditionVariants) ? draft.conditionVariants : [];
  return variants.map((item): VariantView => {
    const row = isBag(item) ? item : {};
    return { id: text(row.id), label: text(row.label), stageId: text(row.stageId), participantCount: Array.isArray(row.participantIds) ? row.participantIds.length : 0, participantIds: Array.isArray(row.participantIds) ? row.participantIds.filter((id): id is string => typeof id === 'string') : [], note: text(row.note) };
  });
}

/** The outcomes that name this variant, as the refusal says them: "Outcome 2 holds only under '443 K'; change the outcome's 'Holds under' first." or undefined. */
export function outcomeNaming(draft: unknown, variantId: string, label: string): string | undefined {
  const outcomes = isBag(draft) && Array.isArray(draft.outcomes) ? draft.outcomes : [];
  const naming = outcomes.flatMap((item, at) => {
    const ids = isBag(item) && Array.isArray(item.conditionVariantIds) ? item.conditionVariantIds : [];
    return ids.includes(variantId) ? [{ n: at + 1, only: ids.length === 1 }] : [];
  });
  if (naming.length === 0) return undefined;
  const words = naming.map((one) => `Outcome ${one.n} ${one.only ? 'holds only under' : 'names'} '${label}'`);
  return `${words.join('; ')}; change ${naming.length === 1 ? "the outcome's" : "the outcomes'"} 'Holds under' first.`;
}

/** The index of the stage a variant overrides: the one it names, else the first stage of kind reaction; -1 when there is none. */
export function stageIndexOf(draft: unknown, stageId: string): number {
  const stages = isBag(draft) && Array.isArray(draft.stages) ? draft.stages : [];
  if (stageId !== '') return stages.findIndex((s) => isBag(s) && s.id === stageId);
  return stages.findIndex((s) => isBag(s) && s.kind === 'reaction');
}

/** The fields a variant overrides now (a measure or choice present, a list with members), in the form's order. */
export const OVERRIDE_ORDER = ['temperature', 'pressure', 'time', 'medium', 'light', 'atmosphere', 'anhydrous', 'solventCharacter', 'activation', 'other', 'text'] as const;
export type OverrideField = (typeof OVERRIDE_ORDER)[number];
export const overridesOf = (draft: unknown, index: number): readonly OverrideField[] => {
  const params = parametersOf(draft, variantLoc(index));
  return OVERRIDE_ORDER.filter((field) => hasField(params, field));
};

const MEASURED: readonly OverrideField[] = ['temperature', 'pressure', 'time'];
/** One override in words: the arrow's own text for the field alone, led by the field's name for a measure ("temperature 443 K"). */
function overrideText(params: Readonly<Fields>, field: OverrideField): string {
  const only = { [field]: params[field] };
  const parts = conditionPartsOf(validParametersOf(only)).map((part) => part.text);
  if (field === 'anhydrous') return params.anhydrous === false ? 'not anhydrous' : 'anhydrous';
  if (field === 'solventCharacter') return `solvent ${(Array.isArray(params[field]) ? (params[field] as unknown[]) : []).map((word) => String(word).replace(/_/g, ' ')).join(', ')}`;
  if (parts.length === 0) return `${field} (not complete)`;
  return MEASURED.includes(field) ? `${field} ${parts.join(', ')}` : parts.join(', ');
}

/** The participants a variant lists, by the name `nameOf` gives their substance (their number when there is no name): "Sodium hydroxide, participant 3". */
function onlyWith(draft: unknown, ids: readonly string[], nameOf: ((kind: string, id: string) => string | undefined) | undefined): string {
  const participants = isBag(draft) && Array.isArray(draft.participants) ? draft.participants : [];
  return ids
    .map((id) => {
      const at = participants.findIndex((p) => isBag(p) && p.id === id);
      const ref = at < 0 || !isBag(participants[at]) ? undefined : (participants[at] as Fields).ref;
      const name = isBag(ref) && typeof ref.kind === 'string' && typeof ref.id === 'string' ? nameOf?.(ref.kind, ref.id) : undefined;
      return name ?? (at < 0 ? id : `participant ${at + 1}`);
    })
    .join(', ');
}

/** The one summary line of a variant: "443 K, excess acid: stage 1 temperature 443 K"; "no stage to override" without a stage; "no overrides yet"; then " · only with <participants>" when it lists any. */
export function variantSummary(draft: unknown, index: number, nameOf?: (kind: string, id: string) => string | undefined): string {
  const view = variantsViewOf(draft)[index];
  if (view === undefined) return '';
  const params = parametersOf(draft, variantLoc(index));
  const stage = stageIndexOf(draft, view.stageId);
  const fields = overridesOf(draft, index);
  const where = stage < 0 ? 'no stage to override' : `stage ${stage + 1}`;
  const what = fields.length === 0 ? 'no overrides yet' : fields.map((field) => overrideText(params, field)).join(', ');
  const label = view.label === '' ? `Variant ${index + 1}` : view.label;
  const line = stage < 0 ? `${label}: ${where}${fields.length === 0 ? '' : `, ${what}`}` : `${label}: ${where} ${what}`;
  return view.participantIds.length === 0 ? line : `${line} · only with ${onlyWith(draft, view.participantIds, nameOf)}`;
}

/** The fields a new override may start with: every structured field the variant does not already have. The solvent character is stored chemistry even though the arrow never writes it. */
export const ADDABLE_OVERRIDES: readonly { readonly field: OverrideField; readonly title: string }[] = [
  { field: 'temperature', title: 'Temperature' },
  { field: 'pressure', title: 'Pressure' },
  { field: 'time', title: 'Time' },
  { field: 'medium', title: 'Medium' },
  { field: 'light', title: 'Light' },
  { field: 'atmosphere', title: 'Atmosphere' },
  { field: 'anhydrous', title: 'Anhydrous' },
  { field: 'solventCharacter', title: 'Solvent character' },
  { field: 'activation', title: 'Activation' },
  { field: 'other', title: 'Other qualifiers' },
  { field: 'text', title: 'Free text' },
];
