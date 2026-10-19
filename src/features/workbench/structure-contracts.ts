/**
 * What the structure panel needs of the app (step 6.2a part 3): the chem worker's `parse` and, optionally, the depiction port the
 * inspector and the navigator already use. The app fills it from the chem service; the panel decides nothing about chemistry.
 */
import type { ParseOutcome } from '@/chem/contracts';
import type { StructureRep } from '@/core/schema';
import type { DepictionPort } from '@/render/svg';

export interface StructurePort {
  parse(structure: StructureRep): Promise<ParseOutcome>;
  /** Absent: no drawing is shown (the derived values still are). */
  readonly depictions?: DepictionPort;
}
