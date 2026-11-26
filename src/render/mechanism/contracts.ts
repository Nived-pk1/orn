/**
 * What the step drawing (step 8.5, ADR-038) needs from outside: the structure tool's drawing WITH atom positions, and the browser's object
 * URLs (made and revoked by the app, never here). `src/app` fills it from the depiction service; the Study view, the inspector and the
 * Studio editor each hand it in. The drawing itself is derived: nothing here is stored.
 */
import type { DepictedAtom, DepictedBond, DepictedGlyph } from '@/chem/contracts';
import type { STEP_SPECIES_ROLES, StructureRep } from '@/core/schema';
import type { MovementInput } from './geometry';

type StepSpeciesRole = (typeof STEP_SPECIES_ROLES)[number];

export type StepDrawingAnswer =
  | { readonly ok: true; readonly svg: string; readonly width: number; readonly height: number; readonly atoms?: readonly DepictedAtom[]; readonly bonds?: readonly DepictedBond[]; readonly glyphs?: readonly DepictedGlyph[] }
  | { readonly ok: false; readonly reason: string; readonly message: string };

export interface StepDrawingPort {
  /** `positions`: the drawing with its atom positions and bonds by map number; false: the plain drawing at the same fixed scale. `turn` (with positions): the molecule turned, `DepictionOptions.turn`. */
  depict(structure: StructureRep, positions: boolean, turn?: number): Promise<StepDrawingAnswer>;
  createUrl(svg: string): string;
  revokeUrl(url: string): void;
  /** Loads the structure tool again (the Retry beside "did not load"). Absent: no Retry is offered. */
  retry?(): void;
  /** Says why a step could not be drawn (the words shown are the same for several reasons). */
  log?(type: string, message: string): void;
}

export interface DrawableSpecies {
  readonly role: StepSpeciesRole;
  /** Text for a species without a structure. */
  readonly label?: string;
  readonly structure?: StructureRep;
}

/** What a drawing needs of a step: the same shape for a stored step and for the Studio editor's draft. */
export interface DrawableStep {
  readonly number: number;
  readonly species: readonly DrawableSpecies[];
  readonly electronMovements: readonly MovementInput[];
  readonly reversible: boolean;
}
