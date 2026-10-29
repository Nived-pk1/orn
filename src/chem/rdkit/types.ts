/**
 * The part of RDKit MinimalLib the adapter uses, as structural types: the adapter and its helpers depend on THESE, not on the
 * package, so a fake module can stand in for the real one in tests and only `loader.ts` imports `@rdkit/rdkit`.
 */

/** Every RDKit object lives in WASM memory and must be `delete()`d: see `scope.ts`. */
export interface RdkitHandle {
  delete(): void;
  isDeleted(): boolean;
}

export interface RdkitMol extends RdkitHandle {
  get_smiles(): string;
  /** RDKit's own JSON of the molecule (`rdkitjson`): atoms with `z`, `impHs`, `chg`, and the representation extension. */
  get_json(): string;
  /** `{"CIP_atoms":[[index,"(S)"],...],"CIP_bonds":[[a,b,"(E)"],...]}`; `(?)` marks a stereo element with no configuration given. */
  get_stereo_tags(): string;
  get_num_atoms(heavyOnly: boolean): number;
  get_prop(key: string): string;
  get_svg_with_highlights(details: string): string;
  /** `{"atoms":[...],"bonds":[...]}` for the first match, `{}` when there is none. */
  get_substruct_match(query: RdkitMol): string;
  /** A JSON array of every match (`{"atoms":[...],"bonds":[...]}` each), `{}` when there is none. Optional: only the structures modes use it. */
  get_substruct_matches?(query: RdkitMol): string;
  /** A molblock of a COPY with every hydrogen explicit (with 2D coordinates for the new ones). Optional: only the structures modes use it. */
  add_hs?(): string;
  /** The CXSMILES, with the atom labels (`|$R';;;$|`) a generic structure carries. Optional: only the structures modes use it. */
  get_cxsmiles?(): string;
}

export interface RdkitModule {
  version(): string;
  /** `null` for a structure RDKit cannot read. */
  get_mol(input: string, details?: string): RdkitMol | null;
  /** A query molecule from SMARTS; `null` for a pattern RDKit cannot read. */
  get_qmol(input: string): RdkitMol | null;
  /** RDKit writes its own warnings and errors to the console/stderr; the adapter switches that off. */
  disable_logging?(): void;
}

/** How the adapter gets a module. `loader.ts` is the real one; tests give a fake. */
export type RdkitLoad = () => Promise<RdkitModule>;
