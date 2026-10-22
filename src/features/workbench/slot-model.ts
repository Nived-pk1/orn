/**
 * Filling a slot (step 6.7a decision C3): the recipes that put the chosen species in place of the class and remove the draft-only marker
 * (`slotOfClassId`, see `core/editing/templates.ts`). One recipe is one edit, so one undo step. Reads: `slotClassOf`.
 */
import type { DraftRecipe } from '@/core/editing';
import { SLOT_KEY } from '@/core/editing';

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The class a participant or product slot stands for, or undefined when it is not a slot. */
export const slotClassOf = (row: unknown): string | undefined => (isBag(row) && typeof row[SLOT_KEY] === 'string' && row[SLOT_KEY] !== '' ? (row[SLOT_KEY] as string) : undefined);

function fill(row: unknown, speciesId: string): void {
  if (!isBag(row)) return;
  row.ref = { kind: 'species', id: speciesId };
  Reflect.deleteProperty(row, SLOT_KEY);
}

export const fillParticipantSlot = (index: number, speciesId: string): DraftRecipe => (draft) => {
  const list = (draft as Fields).participants;
  if (Array.isArray(list)) fill(list[index], speciesId);
};

export const fillProductSlot = (outcome: number, product: number, speciesId: string): DraftRecipe => (draft) => {
  const outcomes = (draft as Fields).outcomes;
  const one = Array.isArray(outcomes) ? outcomes[outcome] : undefined;
  const products = isBag(one) ? one.products : undefined;
  if (Array.isArray(products)) fill(products[product], speciesId);
};
