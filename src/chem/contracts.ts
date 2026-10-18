/**
 * Chemistry toolkit adapter — docs/ARCHITECTURE_DECISIONS.md ADR-009.
 * RDKit.js (MinimalLib, WASM) runs in the chem worker behind this interface; nothing else imports
 * RDKit. Derived facts are cached by (input hash, toolkit, version) and never stored canonically.
 */
import type { Species, StructureRep } from '@/core/schema';
import type { FindingDraft } from '@/core/validation/contracts';

/**
 * RDKit's CIP labels of the structure, as counts (step 4.3b follow-up, CHEM-006): atoms `R`, `S`, and the pseudo-asymmetric
 * lower-case `r`, `s`; double bonds `E`, `Z`. Unspecified elements are not counted here (see `unspecifiedStereocentres`); a
 * double bond whose geometry is not given is not listed by RDKit at all.
 */
export interface CipCounts {
  readonly R: number;
  readonly S: number;
  readonly r: number;
  readonly s: number;
  readonly E: number;
  readonly Z: number;
}

export interface StructureFacts {
  readonly canonicalSmiles?: string;
  readonly formula?: string;
  readonly charge?: number;
  readonly heavyAtomCount?: number;
  /** The number of carbon atoms (atomic number 6, isotopes and charges included; a dummy atom is not carbon), from RDKit's own atoms. */
  readonly carbonCount?: number;
  readonly specifiedStereocentres?: number;
  readonly unspecifiedStereocentres?: number;
  readonly hasDoubleBondStereo?: boolean;
  /** The CIP labels RDKit gave, counted; undefined when RDKit did not give stereo tags (a warning says so). */
  readonly cipCounts?: CipCounts;
  readonly aromatic?: boolean;
  readonly atomMaps: readonly number[];
  readonly warnings: readonly string[];
}

/**
 * Why a toolkit call did not answer (Phase 4 contract decisions Q7). ONLY `invalid` says the structure is bad (CHEM-001 fires
 * for it and for nothing else); `unavailable` (the toolkit did not load, crashed, or the worker is down) and `timeout` (the
 * worker was terminated after its per-call limit) say nothing about the structure and are shown as "check unavailable".
 */
export type ToolkitFailureReason = 'invalid' | 'unavailable' | 'timeout';

/**
 * `problem` says which way an `invalid` structure is bad (step 4.3b: CHEM-001 and CHEM-002): `unreadable` (RDKit cannot read the
 * notation, or the input was refused before RDKit saw it) or `sanitisation` (RDKit reads it without sanitising, but valence or
 * another sanitisation step fails). Present on every `invalid` outcome of `parse`; never on `unavailable` or `timeout`.
 */
export type InvalidProblem = 'unreadable' | 'sanitisation';

export type ParseOutcome =
  | { readonly ok: true; readonly facts: StructureFacts }
  | { readonly ok: false; readonly reason: 'invalid'; readonly problem: InvalidProblem; readonly error: string }
  | { readonly ok: false; readonly reason: Exclude<ToolkitFailureReason, 'invalid'>; readonly error: string };

/**
 * How a structure is drawn (equation step, part 4): `skeletal` (the default), `condensed` (every chain carbon labelled with its
 * hydrogens: CH3, CH2, CH, C; rings stay rings) or `full` (every hydrogen drawn with its own bond). A drawing option only: the stored
 * structure never changes, and the mode is part of every depiction key.
 */
export const STRUCTURE_MODES = ['skeletal', 'condensed', 'full'] as const;
export type StructureMode = (typeof STRUCTURE_MODES)[number];

/**
 * The fixed scale (equation step, part 5): a drawing made with `fixedScale: true` has the same bond length whatever the molecule, so a
 * methyl group is not blown up beside a long chain. RDKit draws it with `scalingFactor` `FIXED_SCALE_FACTOR` and the canvas fits the
 * molecule; the bond is then `FIXED_SCALE_BOND_UNITS` SVG units long (part 6: 37 gives 53.2 to 54.3 units, the bond of the card's own 128 x 80
 * drawing of ethanol, so a viewer shows it 1:1 with the card's line width and label size; measured over chains and rings in docs/PROGRESS.md
 * "Equation step, part 6"; part 5 used 100 and 147.5). A viewer scales the whole drawing by (the bond length it wants / `FIXED_SCALE_BOND_UNITS`).
 * A fixed-scale drawing also has no background rectangle (`clearBackground: false`), so it sits on the colour of its page.
 */
export const FIXED_SCALE_FACTOR = 37;
export const FIXED_SCALE_BOND_UNITS = 54;

export interface DepictionOptions {
  readonly width: number;
  readonly height: number;
  readonly showAtomMaps: boolean;
  readonly highlightAtomMaps?: readonly number[];
  /** Absent: `skeletal`. */
  readonly mode?: StructureMode;
  /**
   * Absent or false: the drawing fits `width` x `height`. True: the drawing has the fixed bond length of `FIXED_SCALE_BOND_UNITS`; `width` and
   * `height` are not used (they must still be valid) and the answer's `width` and `height` are the real size of the drawing.
   */
  readonly fixedScale?: boolean;
}

export interface Depiction {
  /** hash(format, value, options, toolkit, toolkitVersion). */
  readonly key: string;
  /** Sanitised SVG document text. Displayed only via <img>/<image> data/blob URLs, never inlined. */
  readonly svg: string;
  readonly width: number;
  readonly height: number;
}

/** `refused`: the toolkit drew it, but the sanitiser refused the drawing (over the size cap, or not an svg): nothing is shown. */
export type DepictOutcome =
  | { readonly ok: true; readonly depiction: Depiction }
  | { readonly ok: false; readonly reason: ToolkitFailureReason | 'refused'; readonly error: string };

/** `invalid_smarts`: the pattern does not parse. `invalid`: the STRUCTURE does not parse. */
export type SmartsOutcome =
  | { readonly ok: true; readonly matches: boolean }
  | { readonly ok: false; readonly reason: ToolkitFailureReason | 'invalid_smarts'; readonly error: string };

export interface StructureToolkit {
  readonly name: string;
  readonly version: string;
  /** Resolves when loading has finished, successfully or not (never rejects): a toolkit that did not load answers `unavailable`. */
  ready(): Promise<void>;
  parse(structure: StructureRep): Promise<ParseOutcome>;
  /** Always answers sanitised SVG (or a failure value); nothing else leaves the chem worker as markup. */
  depict(structure: StructureRep, options: DepictionOptions): Promise<DepictOutcome>;
  matchesSmarts(structure: StructureRep, smarts: string): Promise<SmartsOutcome>;
}

/** L4 checks (CHEM-*) produced in the chem worker. Never blocking; never modify data. */
export interface ChemistryChecks {
  checkSpecies(species: Species): Promise<readonly (FindingDraft & { readonly ruleId: string })[]>;
  checkReactionBalance(request: {
    readonly reactants: readonly { readonly structure: StructureRep; readonly coefficient: number }[];
    readonly products: readonly { readonly structure: StructureRep; readonly coefficient: number }[];
  }): Promise<{ readonly balanced: boolean | 'unknown'; readonly differences: Readonly<Record<string, number>> }>;
}
