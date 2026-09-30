/**
 * The RDKit adapter behind `StructureToolkit` (ADR-009, SECURITY §3). The module is loaded lazily on the first call through the
 * injected `load` (the real loader is `loader.ts`; tests give a fake). Every input is checked BEFORE RDKit sees it: the size
 * caps (SMILES and CXSMILES 20,000 characters, molfile 1 MB) and the declared format (RDKit's `get_mol` sniffs its input, so a
 * "SMILES" that is a molblock or JSON would otherwise be read as one). Every RDKit object is opened and freed through
 * `withHandle`. Failure values, never exceptions: `invalid` (RDKit cannot read the structure; the only reason that means the
 * structure is bad), `unavailable` (no module, or it trapped: it is dropped and reloaded on the next call), and, for a drawing
 * the sanitiser refused, `refused`. A `timeout` is the RPC client's: RDKit is synchronous, so a call that hangs is stopped by
 * terminating the worker (ADR-034).
 */
import { LIMITS, STRUCTURE_FORMATS, type StructureRep } from '@/core/schema';
import { hashParts } from '@/core/hash';
import type { DepictionOptions, DepictOutcome, ParseOutcome, SmartsOutcome, StructureToolkit } from '../contracts';
import { sanitizeSvg } from '../svg/sanitize';
import { describe, isTrap } from './errors';
import { factsOf } from './facts';
import { depictionDetails } from '../depiction-options';
import { drawMol } from './draw';
import { mapsKeepingHydrogens } from './mapped-hydrogens';
import { withHandle } from './scope';
import type { RdkitLoad, RdkitModule } from './types';

export const TOOLKIT_NAME = 'rdkit-minimallib';

type Loaded = { readonly ok: true; readonly module: RdkitModule } | { readonly ok: false; readonly error: string };

/** Why this structure is not even offered to RDKit (`undefined`: it is). */
export function inputProblem(structure: StructureRep): string | undefined {
  const { format, value } = structure;
  if (!STRUCTURE_FORMATS.includes(format) || typeof value !== 'string') return 'the structure has no known format or value';
  if (value.length === 0) return 'the structure is empty';
  const limit = format === 'molfile' ? LIMITS.molfile : LIMITS.inlineStructure;
  if (value.length > limit) return `the ${format} has ${value.length} characters; the limit is ${limit}`;
  if (format === 'molfile') return /^\s*\{/.test(value) || !value.includes('M  END') ? 'this is not a molfile (no "M  END" line)' : undefined;
  return /[\r\n{]/.test(value) ? `this is not a ${format} (it has a line break or a brace)` : undefined;
}

const open = (module: RdkitModule, structure: StructureRep): ReturnType<RdkitModule['get_mol']> => module.get_mol(structure.value);

/** How many atoms the first match has (`{}` = none), or `undefined` if RDKit's answer is not JSON of that shape. */
function matchedAtoms(text: string): number | undefined {
  try {
    const match: unknown = JSON.parse(text);
    if (typeof match !== 'object' || match === null) return undefined;
    const atoms = (match as { atoms?: unknown }).atoms;
    return atoms === undefined ? 0 : Array.isArray(atoms) ? atoms.length : undefined;
  } catch {
    return undefined;
  }
}

export interface RdkitToolkitOptions {
  readonly load: RdkitLoad;
}

export function createRdkitToolkit(options: RdkitToolkitOptions): StructureToolkit {
  let rdkit: RdkitModule | undefined;
  let loading: Promise<Loaded> | undefined;

  function acquire(): Promise<Loaded> {
    if (rdkit !== undefined) return Promise.resolve({ ok: true, module: rdkit });
    loading ??= options
      .load()
      .then((loaded): Loaded => {
        rdkit = loaded;
        return { ok: true, module: loaded };
      })
      .catch((error: unknown): Loaded => ({ ok: false, error: describe(error) }))
      .finally(() => {
        loading = undefined;
      });
    return loading;
  }

  const unavailable = (error: string): { readonly ok: false; readonly reason: 'unavailable'; readonly error: string } => ({ ok: false, reason: 'unavailable', error: `the structure toolkit is not available (${error})` });

  /** A trap drops the module (the next call loads a fresh one) and says so; anything else is not a trap (`undefined`). */
  function crashed(error: unknown): { readonly ok: false; readonly reason: 'unavailable'; readonly error: string } | undefined {
    if (!isTrap(error)) return undefined;
    rdkit = undefined;
    return { ok: false, reason: 'unavailable', error: `the structure toolkit crashed on this input (${describe(error)}); it will be loaded again` };
  }

  /**
   * An exception that is not a trap, by where it came from. RDKit refusing to READ the structure (or the SMARTS) is `invalid`
   * (`invalid_smarts`); the same kind of exception while WORKING on a structure it did read (drawing, matching) says nothing
   * against the structure, so it is `unavailable`, never `invalid`.
   */
  const refused = (error: unknown, stage: 'structure' | 'work'): { readonly ok: false; readonly reason: 'invalid' | 'unavailable'; readonly error: string } =>
    stage === 'structure'
      ? { ok: false, reason: 'invalid', error: `RDKit could not read this structure (${describe(error)})` }
      : { ok: false, reason: 'unavailable', error: `RDKit could not process this structure (${describe(error)})` };

  const invalid = (error: string): { readonly ok: false; readonly reason: 'invalid'; readonly error: string } => ({ ok: false, reason: 'invalid', error });
  const unreadableParse = (error: string): ParseOutcome => ({ ok: false, reason: 'invalid', problem: 'unreadable', error });
  const unreadable = (structure: StructureRep): string => `RDKit cannot read this ${structure.format}`;

  return {
    name: TOOLKIT_NAME,
    get version(): string {
      return rdkit?.version() ?? 'not loaded';
    },

    async ready(): Promise<void> {
      await acquire();
    },

    async parse(structure): Promise<ParseOutcome> {
      const problem = inputProblem(structure);
      if (problem !== undefined) return unreadableParse(problem);
      const loaded = await acquire();
      if (!loaded.ok) return unavailable(loaded.error);
      const at: { stage: 'structure' | 'work' } = { stage: 'structure' };
      try {
        const parsed = withHandle(
          () => loaded.module.get_mol(structure.value),
          (mol) => {
            at.stage = 'work';
            return factsOf(mol);
          },
        );
        if (parsed.opened) {
          const maps = mapsKeepingHydrogens(loaded.module, structure.format, structure.value);
          return { ok: true, facts: maps === undefined ? parsed.value : { ...parsed.value, atomMaps: maps } };
        }
        // RDKit would not open it. Reading it WITHOUT sanitising says whether the notation is bad (CHEM-001) or only the chemistry
        // is (valence, another sanitisation step: CHEM-002).
        const bare = withHandle(
          () => loaded.module.get_mol(structure.value, '{"sanitize":false}'),
          () => true,
        );
        return bare.opened
          ? { ok: false, reason: 'invalid', problem: 'sanitisation', error: `RDKit reads this ${structure.format} but it does not sanitise (valence or another chemistry check fails)` }
          : unreadableParse(unreadable(structure));
      } catch (error) {
        const trapped = crashed(error);
        if (trapped !== undefined) return trapped;
        return at.stage === 'structure'
          ? unreadableParse(`RDKit could not read this structure (${describe(error)})`)
          : { ok: false, reason: 'unavailable', error: `RDKit could not process this structure (${describe(error)})` };
      }
    },

    async depict(structure, drawing: DepictionOptions): Promise<DepictOutcome> {
      const details = depictionDetails(drawing); // a caller's bad options are a programmer error: this throws
      const problem = inputProblem(structure);
      if (problem !== undefined) return invalid(problem);
      const loaded = await acquire();
      if (!loaded.ok) return unavailable(loaded.error);
      const at: { stage: 'structure' | 'work' } = { stage: 'structure' };
      try {
        const module_ = loaded.module;
        const drawn = withHandle(
          () => open(module_, structure),
          (mol) => {
            at.stage = 'work';
            return drawMol(module_, mol, details);
          },
        );
        if (!drawn.opened) return invalid(unreadable(structure));
        if (!drawn.value.ok) return unavailable(drawn.value.error);
        const clean = sanitizeSvg(drawn.value.svg);
        if (!clean.ok) return { ok: false, reason: 'refused', error: `the drawing was refused: ${clean.message}` };
        const key = hashParts(['depict', structure.format, structure.value, JSON.stringify(details), TOOLKIT_NAME, module_.version()]);
        return { ok: true, depiction: { key, svg: clean.svg, width: drawing.width, height: drawing.height } };
      } catch (error) {
        return crashed(error) ?? refused(error, at.stage);
      }
    },

    async matchesSmarts(structure, smarts): Promise<SmartsOutcome> {
      const problem = inputProblem(structure);
      if (problem !== undefined) return invalid(problem);
      if (smarts.length === 0 || smarts.length > LIMITS.inlineStructure) return { ok: false, reason: 'invalid_smarts', error: `the SMARTS must have 1 to ${LIMITS.inlineStructure} characters` };
      const loaded = await acquire();
      if (!loaded.ok) return unavailable(loaded.error);
      const at: { stage: 'structure' | 'smarts' | 'work' } = { stage: 'structure' };
      try {
        const module_ = loaded.module;
        const outer = withHandle(
          () => open(module_, structure),
          (mol) => {
            at.stage = 'smarts';
            return withHandle(
              () => module_.get_qmol(smarts),
              (query) => {
                at.stage = 'work';
                return mol.get_substruct_match(query);
              },
            );
          },
        );
        if (!outer.opened) return invalid(unreadable(structure));
        if (!outer.value.opened) return { ok: false, reason: 'invalid_smarts', error: 'RDKit cannot read this SMARTS' };
        const atoms = matchedAtoms(outer.value.value);
        return atoms === undefined ? unavailable('RDKit answered an unreadable match') : { ok: true, matches: atoms > 0 };
      } catch (error) {
        const trapped = crashed(error);
        if (trapped !== undefined) return trapped;
        return at.stage === 'smarts' ? { ok: false, reason: 'invalid_smarts', error: `RDKit could not read this SMARTS (${describe(error)})` } : refused(error, at.stage);
      }
    },
  };
}
