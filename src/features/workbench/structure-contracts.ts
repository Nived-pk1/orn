/**
 * What the structure panel needs of the app (step 6.2a part 3): the chem worker's `parse` and, optionally, the depiction port the
 * inspector and the navigator already use. The app fills it from the chem service; the panel decides nothing about chemistry.
 */
import type { ParseOutcome } from '@/chem/contracts';
import type { StructureRep } from '@/core/schema';
import type { DepictionPort } from '@/render/svg';

/** Whether the chem worker can read a SMARTS pattern (step 6.2b): `invalid` carries the engine's words; `unanswered` is NOT "invalid". */
export type SmartsCheck =
  | { readonly state: 'ok' }
  | { readonly state: 'invalid'; readonly message: string }
  | { readonly state: 'unanswered'; readonly message: string };

export interface StructurePort {
  parse(structure: StructureRep): Promise<ParseOutcome>;
  /** Absent: a SMARTS is not checked (the text is still kept). */
  checkSmarts?(smarts: string): Promise<SmartsCheck>;
  /** Absent: no drawing is shown (the derived values still are). */
  readonly depictions?: DepictionPort;
}
