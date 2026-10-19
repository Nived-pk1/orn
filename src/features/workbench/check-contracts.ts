/**
 * What the live panel needs of the checking workers (step 6.2a, part 2), as plain types: the app fills the port from the compute and
 * chem workers. Every answer names the draft VERSION it is for, so the panel can drop an answer for an older draft. Nothing here is
 * chemistry or validation: the workers decide, the panel shows.
 */
import type { RecordKind } from '@/core/schema';
import type { Finding } from '@/core/validation';

/** L2-L3 of the draft as if committed, from the compute worker; `unavailable` says why in words (Save still runs the store's gate). */
export type DryRunAnswer =
  | { readonly version: number; readonly state: 'checked'; readonly findings: readonly Finding[] }
  | { readonly version: number; readonly state: 'unavailable'; readonly message: string };

/** A class the draft's structure matches and the draft does not list (CHEM-007): offered as a chip, never added by itself. */
export interface ClassSuggestion {
  readonly classId: string;
}

/** L4 for the draft's structure, from the chem worker. `none`: the draft has no structure to check. */
export type StructureChecksAnswer =
  | { readonly version: number; readonly state: 'checked'; readonly findings: readonly Finding[]; readonly suggestions: readonly ClassSuggestion[]; readonly notCompared: readonly string[] }
  | { readonly version: number; readonly state: 'none' }
  | { readonly version: number; readonly state: 'unavailable'; readonly message: string };

export interface DraftChecksPort {
  dryRun(kind: RecordKind, draft: unknown, version: number): Promise<DryRunAnswer>;
  structure(kind: RecordKind, draft: unknown, version: number): Promise<StructureChecksAnswer>;
}
