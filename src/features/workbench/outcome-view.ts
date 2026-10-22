/**
 * The outcomes editor's VIEW of the draft (step 6.4b decision D1): each outcome and product as plain values, the variants to hold under, the
 * isomer groups in use and the one summary line of an outcome. Reads only; the recipes are in `outcome-model.ts`. No chemistry here.
 */
import { selectivityWordOf } from '@/core/graph';
import { slotClassOf } from './slot-model';
import type { ProductKind, ProductRoleValue } from './outcome-model';

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export interface ProductView {
  readonly id: string;
  readonly substance: { readonly kind: ProductKind; readonly id: string } | undefined;
  readonly role: ProductRoleValue | undefined;
  readonly coefficient: number | undefined;
  readonly phase: string;
  readonly originalText: string;
  readonly note: string;
  /** The class an empty slot stands for (step 6.7a), or undefined. */
  readonly slotClassId?: string | undefined;
}
export interface OutcomeView {
  readonly id: string;
  readonly selectivity: string;
  /** The variants it names (empty = all conditions). */
  readonly variantIds: readonly string[];
  readonly products: readonly ProductView[];
  readonly isomerGroup: string;
  readonly regiochemistry: string;
  readonly stereo:
    | {
        readonly outcome: string;
        readonly descriptors: readonly string[];
        readonly note: string;
      }
    | undefined;
  readonly rationale: string;
  readonly mechanismId: string;
}

const ROLES: readonly string[] = ['main', 'coproduct', 'byproduct'];
function productViewOf(item: unknown): ProductView {
  const row = isBag(item) ? item : {};
  const ref = isBag(row.ref) ? row.ref : undefined;
  const kind = ref?.kind === 'species' || ref?.kind === 'class' ? ref.kind : undefined;
  return {
    id: text(row.id),
    substance: kind === undefined || typeof ref?.id !== 'string' ? undefined : { kind, id: ref.id },
    role: ROLES.includes(text(row.role)) ? (row.role as ProductRoleValue) : undefined,
    coefficient: typeof row.coefficient === 'number' ? row.coefficient : undefined,
    phase: text(row.phase),
    originalText: text(row.originalText),
    note: text(row.note),
    slotClassId: slotClassOf(row),
  };
}
export function outcomesViewOf(draft: unknown): readonly OutcomeView[] {
  const items = isBag(draft) && Array.isArray(draft.outcomes) ? draft.outcomes : [];
  return items.map((item): OutcomeView => {
    const row = isBag(item) ? item : {};
    const stereo = isBag(row.stereochemistry) ? row.stereochemistry : undefined;
    return {
      id: text(row.id),
      selectivity: text(row.selectivity),
      variantIds: Array.isArray(row.conditionVariantIds) ? row.conditionVariantIds.filter((id): id is string => typeof id === 'string') : [],
      products: (Array.isArray(row.products) ? row.products : []).map(productViewOf),
      isomerGroup: text(row.isomerGroup),
      regiochemistry: text(row.regiochemistry),
      stereo:
        stereo === undefined
          ? undefined
          : {
              outcome: text(stereo.outcome),
              descriptors: (Array.isArray(stereo.descriptors) ? stereo.descriptors : []).map(text),
              note: text(stereo.note),
            },
      rationale: text(row.rationale),
      mechanismId: isBag(row.mechanism) ? text(row.mechanism.mechanismId) : '',
    };
  });
}

/** The reaction's variants (ID and label), in order, for "Holds under". */
export function variantChoicesOf(draft: unknown): readonly { readonly id: string; readonly label: string }[] {
  const items = isBag(draft) && Array.isArray(draft.conditionVariants) ? draft.conditionVariants : [];
  return items.map((item) => ({
    id: isBag(item) ? text(item.id) : '',
    label: isBag(item) ? text(item.label) : '',
  }));
}

/** The isomer groups named in this reaction now, in first-use order, without repeats. */
export const isomerGroupsOf = (draft: unknown): readonly string[] => [
  ...new Set(
    outcomesViewOf(draft)
      .map((o) => o.isomerGroup)
      .filter((g) => g !== ''),
  ),
];

/** "All conditions", or the labels of the variants an outcome names ("443 K, excess acid"); a variant that is gone is named by its ID. */
export function holdsUnderWords(draft: unknown, variantIds: readonly string[]): string {
  if (variantIds.length === 0) return 'all conditions';
  const choices = variantChoicesOf(draft);
  return variantIds.map((id) => choices.find((c) => c.id === id)?.label || id).join(', ');
}

/**
 * The one summary line of an outcome: "1. exclusive · Propanal · Markovnikov · under all conditions". The selectivity word, the main
 * product names, the regiochemistry; a part that is not stated is left out. `nameOf` gives a product's name (the app's picker).
 */
export function outcomeSummary(draft: unknown, index: number, nameOf: (kind: ProductKind, id: string) => string): string {
  const outcome = outcomesViewOf(draft)[index];
  if (outcome === undefined) return '';
  const mains = outcome.products.filter((p) => p.role === 'main' && p.substance !== undefined).map((p) => nameOf(p.substance?.kind ?? 'species', p.substance?.id ?? ''));
  const parts = [
    selectivityWordOf(outcome.selectivity),
    mains.length === 0 ? null : mains.join(' + '),
    outcome.regiochemistry === '' ? null : outcome.regiochemistry,
    `under ${holdsUnderWords(draft, outcome.variantIds)}`,
  ];
  return `${index + 1}. ${parts.filter((part): part is string => part !== null).join(' · ')}`;
}
