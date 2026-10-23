/**
 * The reaction's outcomes as recipes over the draft, and the view the editor reads (step 6.4b decision D1). Same rules as the other models:
 * text is stored exactly as typed (INV-24); an EMPTY optional input means the field is ABSENT; a schema problem is a finding, not a fix.
 * A NEW outcome starts with selectivity "unspecified" and holds under all conditions (an empty `conditionVariantIds`); a NEW product has NO role
 * (the schema has no default; L1 refuses Save until the person chooses one, as for the scope and the class kind). Nothing is guessed. The
 * selectivities, roles and stereo outcomes come from the schema's own lists. No chemistry here.
 */
import type { DraftRecipe } from '@/core/editing';
import type { PHASES, PRODUCT_ROLES, SELECTIVITIES, STEREO_OUTCOMES } from '@/core/schema';

export type SelectivityValue = (typeof SELECTIVITIES)[number];
export type ProductRoleValue = (typeof PRODUCT_ROLES)[number];
export type StereoValue = (typeof STEREO_OUTCOMES)[number];
export type ProductPhaseValue = (typeof PHASES)[number];
export type ProductKind = 'species' | 'class';

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const listOf = (draft: Fields, field: string): unknown[] => {
  if (!Array.isArray(draft[field])) draft[field] = [];
  return draft[field] as unknown[];
};
const outcomeAt = (draft: Fields, index: number): Fields | undefined => {
  const item = listOf(draft, 'outcomes')[index];
  return isBag(item) ? item : undefined;
};
const productAt = (draft: Fields, outcome: number, product: number): Fields | undefined => {
  const found = outcomeAt(draft, outcome);
  const item = found === undefined ? undefined : listOf(found, 'products')[product];
  return isBag(item) ? item : undefined;
};
function setOrDelete(target: Fields, key: string, value: unknown): void {
  if (value === undefined || value === '') Reflect.deleteProperty(target, key);
  else target[key] = value;
}

/** A new outcome: the ID is given; "unspecified", all conditions, no product yet (RXN-003 says so until one is added). */
export const addOutcome =
  (id: string): DraftRecipe =>
  (draft) => {
    listOf(draft, 'outcomes').push({
      id,
      conditionVariantIds: [],
      selectivity: 'unspecified',
      products: [],
      conceptIds: [],
    });
  };
export const removeOutcome =
  (index: number): DraftRecipe =>
  (draft) => {
    const items = listOf(draft, 'outcomes');
    if (index >= 0 && index < items.length) items.splice(index, 1);
  };
/** Swaps the outcome with its neighbour: the array stays a permutation of the same outcomes. */
export const moveOutcome =
  (index: number, by: -1 | 1): DraftRecipe =>
  (draft) => {
    const items = listOf(draft, 'outcomes');
    const to = index + by;
    if (index < 0 || index >= items.length || to < 0 || to >= items.length) return;
    const moved = items[index];
    items[index] = items[to];
    items[to] = moved;
  };
export const setSelectivity =
  (index: number, value: SelectivityValue): DraftRecipe =>
  (draft) => {
    const outcome = outcomeAt(draft, index);
    if (outcome !== undefined) outcome.selectivity = value;
  };
/** "All conditions": the list is emptied. */
export const holdUnderAll =
  (index: number): DraftRecipe =>
  (draft) => {
    const outcome = outcomeAt(draft, index);
    if (outcome !== undefined) outcome.conditionVariantIds = [];
  };
/** Names (`on`) or releases one variant; the variants keep the reaction's order, and an empty list means all conditions. */
export const holdUnderVariant =
  (index: number, variantId: string, on: boolean): DraftRecipe =>
  (draft) => {
    const outcome = outcomeAt(draft, index);
    if (outcome === undefined) return;
    const was = listOf(outcome, 'conditionVariantIds').filter((id): id is string => typeof id === 'string');
    const order = listOf(draft, 'conditionVariants').map((variant) => (isBag(variant) ? text(variant.id) : ''));
    const next = new Set(was);
    if (on) next.add(variantId);
    else next.delete(variantId);
    const known = order.filter((id) => next.has(id));
    const unknown = [...next].filter((id) => !order.includes(id));
    outcome.conditionVariantIds = [...known, ...unknown];
  };
export const setIsomerGroup =
  (index: number, value: string): DraftRecipe =>
  (draft) => {
    const outcome = outcomeAt(draft, index);
    if (outcome !== undefined) setOrDelete(outcome, 'isomerGroup', value);
  };
export const setRegiochemistry =
  (index: number, value: string): DraftRecipe =>
  (draft) => {
    const outcome = outcomeAt(draft, index);
    if (outcome !== undefined) setOrDelete(outcome, 'regiochemistry', value);
  };
/** The outcome's one-line label; empty = absent. */
export const setOutcomeLabel =
  (index: number, value: string): DraftRecipe =>
  (draft) => {
    const outcome = outcomeAt(draft, index);
    if (outcome !== undefined) setOrDelete(outcome, 'label', value);
  };
export const setRationale =
  (index: number, value: string): DraftRecipe =>
  (draft) => {
    const outcome = outcomeAt(draft, index);
    if (outcome !== undefined) setOrDelete(outcome, 'rationale', value);
  };

/** Starts the stereochemistry (the schema needs an outcome value and a descriptor list). */
export const setStereoOutcome =
  (index: number, value: StereoValue): DraftRecipe =>
  (draft) => {
    const outcome = outcomeAt(draft, index);
    if (outcome === undefined) return;
    if (isBag(outcome.stereochemistry)) outcome.stereochemistry.outcome = value;
    else outcome.stereochemistry = { outcome: value, descriptors: [] };
  };
export const removeStereo =
  (index: number): DraftRecipe =>
  (draft) => {
    const outcome = outcomeAt(draft, index);
    if (outcome !== undefined) Reflect.deleteProperty(outcome, 'stereochemistry'); // hardcode-ok: the schema's field key (a dataset name shares the word); nothing branches on it
  };
export const addDescriptor =
  (index: number, value: string): DraftRecipe =>
  (draft) => {
    const outcome = outcomeAt(draft, index);
    if (outcome !== undefined && isBag(outcome.stereochemistry)) listOf(outcome.stereochemistry, 'descriptors').push(value);
  };
export const removeDescriptor =
  (index: number, at: number): DraftRecipe =>
  (draft) => {
    const outcome = outcomeAt(draft, index);
    if (outcome !== undefined && isBag(outcome.stereochemistry)) listOf(outcome.stereochemistry, 'descriptors').splice(at, 1);
  };
export const setStereoNote =
  (index: number, value: string): DraftRecipe =>
  (draft) => {
    const outcome = outcomeAt(draft, index);
    if (outcome !== undefined && isBag(outcome.stereochemistry)) setOrDelete(outcome.stereochemistry, 'note', value);
  };

/** A new product: the ID is given; it has NO role until the person chooses one. */
export const addProduct =
  (outcome: number, id: string, ref: { readonly kind: ProductKind; readonly id: string }): DraftRecipe =>
  (draft) => {
    const found = outcomeAt(draft, outcome);
    if (found !== undefined)
      listOf(found, 'products').push({
        id,
        ref: { kind: ref.kind, id: ref.id },
      });
  };
export const removeProduct =
  (outcome: number, product: number): DraftRecipe =>
  (draft) => {
    const found = outcomeAt(draft, outcome);
    if (found !== undefined) listOf(found, 'products').splice(product, 1);
  };
export const moveProduct =
  (outcome: number, product: number, by: -1 | 1): DraftRecipe =>
  (draft) => {
    const found = outcomeAt(draft, outcome);
    if (found === undefined) return;
    const items = listOf(found, 'products');
    const to = product + by;
    if (product < 0 || product >= items.length || to < 0 || to >= items.length) return;
    const moved = items[product];
    items[product] = items[to];
    items[to] = moved;
  };
export const setProductRole =
  (outcome: number, product: number, role: ProductRoleValue): DraftRecipe =>
  (draft) => {
    const found = productAt(draft, outcome, product);
    if (found !== undefined) found.role = role;
  };
export const setProductCoefficient =
  (outcome: number, product: number, value: number | undefined): DraftRecipe =>
  (draft) => {
    const found = productAt(draft, outcome, product);
    if (found !== undefined) setOrDelete(found, 'coefficient', value);
  };
export const setProductPhase =
  (outcome: number, product: number, value: ProductPhaseValue | ''): DraftRecipe =>
  (draft) => {
    const found = productAt(draft, outcome, product);
    if (found !== undefined) setOrDelete(found, 'phase', value);
  };
export const setProductText =
  (outcome: number, product: number, field: 'originalText' | 'note', value: string): DraftRecipe =>
  (draft) => {
    const found = productAt(draft, outcome, product);
    if (found !== undefined) setOrDelete(found, field, value);
  };
