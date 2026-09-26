/** Allowed target kinds shared by schema docs and the reference registry. */
import type { RecordKind } from './ids';

export const CAVEAT_TARGET_KINDS: readonly RecordKind[] = [
  'reaction',
  'species',
  'class',
  'reagent',
  'named_reaction',
  'mechanism',
  'transformation',
  'concept',
];
