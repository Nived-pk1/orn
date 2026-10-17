/**
 * The textbook equation's ports and sizes (equation step, part 5). The scheme is laid out here from data and chem facts that are GIVEN to
 * it: no chemistry is decided in these components (`core/graph/equation-term.ts` decides what each term shows).
 */
import type { StructureRep } from '@/core/schema';

/** What the chem worker says about one structure, as far as the equation uses it. `ok: false`: the engine could not say (nothing is guessed). */
export type StructureFactsAnswer = { readonly ok: true; readonly heavyAtomCount?: number; readonly carbonCount?: number } | { readonly ok: false };

export interface StructureFactsPort {
  factsOf(structure: StructureRep): Promise<StructureFactsAnswer>;
}

/**
 * Every drawing of one equation is asked at the fixed scale of the chem module (one bond length); `width` and `height` are not used for it
 * but the service still wants valid ones.
 */
export const EQUATION_AREA = { width: 220, height: 220, fixedScale: true } as const;

/** The length of one bond on the page, in px: a methyl group is not blown up beside a long chain. */
export const EQUATION_BOND_PX = 32;
/** A drawing wider than this is scaled down WHOLE (the bond length then shrinks with it, as the whole drawing does). */
export const MAX_DRAWING_WIDTH = 220;
/** The tallest a drawing is shown: the height of a representation row, so the symbols stay on the middle line of every term. */
export const MAX_DRAWING_HEIGHT = 112;
