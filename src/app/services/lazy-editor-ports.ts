/**
 * Thin wrappers for the two checks only an OPEN editor asks (step 6.5a, entry size): each loads its module on the first ask, so
 * `draft-checks` and `duplicate-check` live in the editor's lazy chunk and not in the entry. The ports are already asynchronous, so
 * the contract (`DraftChecksPort`, `DuplicateCheckPort`) is unchanged; a load that fails rejects like any failed ask.
 */
import type { DraftChecksPort, DuplicateCheckPort } from '@/features/workbench';
import type { DraftChecksOptions } from './draft-checks';
import type { DuplicateCheckOptions } from './duplicate-check';

export function lazyDraftChecks(options: DraftChecksOptions): DraftChecksPort {
  let loaded: Promise<DraftChecksPort> | undefined;
  const port = (): Promise<DraftChecksPort> => (loaded ??= import('./draft-checks').then((m) => m.createDraftChecks(options)));
  return {
    dryRun: async (kind, draft, version) => (await port()).dryRun(kind, draft, version),
    structure: async (kind, draft, version) => (await port()).structure(kind, draft, version),
  };
}

export function lazyDuplicateCheck(options: DuplicateCheckOptions): DuplicateCheckPort {
  let loaded: Promise<DuplicateCheckPort> | undefined;
  return {
    check: async (kind, draft) => ((loaded ??= import('./duplicate-check').then((m) => m.createDuplicateCheck(options))), (await loaded).check(kind, draft)),
  };
}
