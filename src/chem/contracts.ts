/**
 * Chemistry toolkit adapter — docs/ARCHITECTURE_DECISIONS.md ADR-009.
 * RDKit.js (MinimalLib, WASM) runs in the chem worker behind this interface; nothing else imports
 * RDKit. Derived facts are cached by (input hash, toolkit, version) and never stored canonically.
 */
import type { Species, StructureRep } from '@/core/schema';
import type { FindingDraft } from '@/core/validation/contracts';

export interface StructureFacts {
  readonly canonicalSmiles?: string;
  readonly formula?: string;
  readonly charge?: number;
  readonly heavyAtomCount?: number;
  readonly specifiedStereocentres?: number;
  readonly unspecifiedStereocentres?: number;
  readonly hasDoubleBondStereo?: boolean;
  readonly aromatic?: boolean;
  readonly atomMaps: readonly number[];
  readonly warnings: readonly string[];
}

export type ParseOutcome =
  | { readonly ok: true; readonly facts: StructureFacts }
  | { readonly ok: false; readonly error: string };

export interface DepictionOptions {
  readonly width: number;
  readonly height: number;
  readonly showAtomMaps: boolean;
  readonly highlightAtomMaps?: readonly number[];
}

export interface Depiction {
  /** hash(format, value, options, toolkit, toolkitVersion). */
  readonly key: string;
  /** Sanitised SVG document text. Displayed only via <img>/<image> data/blob URLs, never inlined. */
  readonly svg: string;
  readonly width: number;
  readonly height: number;
}

export interface StructureToolkit {
  readonly name: string;
  readonly version: string;
  ready(): Promise<void>;
  parse(structure: StructureRep): Promise<ParseOutcome>;
  depict(structure: StructureRep, options: DepictionOptions): Promise<Depiction>;
  matchesSmarts(structure: StructureRep, smarts: string): Promise<boolean | 'invalid_smarts'>;
}

/** L4 checks (CHEM-*) produced in the chem worker. Never blocking; never modify data. */
export interface ChemistryChecks {
  checkSpecies(species: Species): Promise<readonly (FindingDraft & { readonly ruleId: string })[]>;
  checkReactionBalance(request: {
    readonly reactants: readonly { readonly structure: StructureRep; readonly coefficient: number }[];
    readonly products: readonly { readonly structure: StructureRep; readonly coefficient: number }[];
  }): Promise<{ readonly balanced: boolean | 'unknown'; readonly differences: Readonly<Record<string, number>> }>;
}
