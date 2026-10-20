/**
 * What the mechanism editor (and, in step 6.5a part 5, the reaction and outcome editors' mechanism links) need of the app: which outcomes of
 * which reactions use a mechanism variant, and whether a record a [[link]] names exists. Derived from the canonical state at the moment it is
 * asked; the editor decides nothing and stores nothing. The app fills it.
 */
import type { RecordRef } from '@/core/schema';

export interface VariantUse {
  readonly reactionId: string;
  readonly reactionName: string;
  /** 1-based position of the outcome in its reaction. */
  readonly outcomeNumber: number;
}

export interface MechanismLinksPort {
  /** The outcomes of any reaction (as saved) that link this variant of this mechanism. */
  variantUses(mechanismId: string, variantId: string): readonly VariantUse[];
  /** The variants (ID and label, in order) of a mechanism as saved; empty when it is not saved or has none. */
  variantsOf(mechanismId: string): readonly { readonly id: string; readonly label: string }[];
  /** Whether the record exists now, for the preview of a [[link]]. */
  exists(ref: RecordRef): boolean;
  /** The record's name as the inspector shows it, for a [[link]] with no label; undefined when the record is not there. */
  name(ref: RecordRef): string | undefined;
}
