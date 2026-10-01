/**
 * The values that cross between the L4 service (main thread) and the chem worker for CHEM-001 to CHEM-009 (Phase 4 contract
 * decisions Q2, step 4.3b). The worker holds no state: every request carries the structures it needs, every answer is plain data
 * (`structuredClone` safe). A request names its subject by `id`/`path` only; the service turns drafts into findings.
 */
import type { StructureRep } from '@/core/schema';
import type { FindingDraft } from '@/core/validation/contracts';
import type { SmartsOutcome } from '../contracts';

/** A finding without a subject: the rule that raised it and the draft (path, message, related, data). */
export interface CheckDraft extends FindingDraft {
  readonly ruleId: string;
}

/** Something a check could not compare, said out loud (never silent): which rule and why. */
export interface NotCompared {
  readonly ruleId: string;
  readonly reason: string;
}

/**
 * `checked`: every check that could run did (`notCompared` lists what could not). `not_checked`: the toolkit did not answer
 * for this input (`unavailable`: it crashed on it or is not loaded; `timeout`: the worker was stopped after its limit). It says
 * nothing against the structure: no CHEM-001.
 */
export type CheckStatus =
  | { readonly state: 'checked'; readonly notCompared: readonly NotCompared[] }
  | { readonly state: 'not_checked'; readonly reason: 'unavailable' | 'timeout'; readonly message: string };

export interface ToolkitIdentity {
  readonly name: string;
  readonly version: string;
}

/** The most items one call may carry (the worker refuses more with `BAD_REQUEST`); the service sends fewer. */
export const MAX_CHECK_BATCH = 64;

// ---- species: CHEM-001 to 004 and 006 -------------------------------------------------------------------------------------

export interface SpeciesCheckRequest {
  readonly id: string;
  readonly structure: StructureRep;
  /** The formula as entered, if any. */
  readonly formula?: string;
  /** The charge as entered, if any. */
  readonly charge?: number;
  /** The species' stereo descriptors as entered (CHEM-006); absent when it has none. */
  readonly stereoDescriptors?: readonly string[];
}

export interface SpeciesCheckResult {
  readonly id: string;
  readonly status: CheckStatus;
  readonly drafts: readonly CheckDraft[];
  /** RDKit's canonical SMILES (atom map numbers kept), when the structure was read: the key of CHEM-009's derived map. */
  readonly canonicalSmiles?: string;
}

export interface SpeciesChecksAnswer {
  readonly toolkit: ToolkitIdentity;
  readonly results: readonly SpeciesCheckResult[];
}

// ---- reactions: CHEM-005 --------------------------------------------------------------------------------------------------

export interface BalanceSide {
  /** A label for messages (a participant or product ID). */
  readonly label: string;
  readonly structure: StructureRep;
  readonly coefficient: number;
}

/** One balance problem: the atoms of the reactants against the atoms of the products of one outcome. */
export interface BalanceRequest {
  /** Where the finding goes in the reaction, e.g. `outcomes[1]`. */
  readonly path: string;
  readonly reactants: readonly BalanceSide[];
  readonly products: readonly BalanceSide[];
}

export interface BalanceResult {
  readonly path: string;
  readonly status: CheckStatus;
  readonly drafts: readonly CheckDraft[];
}

export interface BalanceAnswer {
  readonly toolkit: ToolkitIdentity;
  readonly results: readonly BalanceResult[];
}

// ---- mechanisms: CHEM-008 -------------------------------------------------------------------------------------------------

/** An atom-map use in a step: where it is (`variants[0].steps[1].bondsFormed[0]`) and the map numbers it names. */
export interface MapUse {
  readonly path: string;
  readonly maps: readonly number[];
}

export interface StepCheckRequest {
  /** The step's path, e.g. `variants[0].steps[1]`. */
  readonly path: string;
  /** Every structure of the step's species (the ones that have one). */
  readonly structures: readonly StructureRep[];
  readonly uses: readonly MapUse[];
}

export interface StepCheckResult {
  readonly path: string;
  readonly status: CheckStatus;
  readonly drafts: readonly CheckDraft[];
}

export interface StepChecksAnswer {
  readonly toolkit: ToolkitIdentity;
  readonly results: readonly StepCheckResult[];
}

// ---- SMARTS: CHEM-007 -----------------------------------------------------------------------------------------------------

export interface MatchProbe {
  readonly structure: StructureRep;
  readonly smarts: string;
}

export interface MatchesAnswer {
  readonly toolkit: ToolkitIdentity;
  /** One outcome per probe, in order. */
  readonly outcomes: readonly SmartsOutcome[];
}
