/**
 * The topic placements as palette commands (step 8.4g, G9): "<record name> in <topic name>", each opening the placement record in the
 * inspector. Derived from the canonical records (never stored), made once for one state. Search documents never carry another record's text
 * (SEARCH §1), so placements are found in the command list ("> ..."), not in the search results.
 */
import { nameOfRef } from '@/core/editing';
import type { CanonicalState } from '@/core/schema';

export interface Placement {
  readonly id: string;
  readonly title: string;
}

const MAX_PLACEMENTS = 20_000;
const made = new WeakMap<CanonicalState, readonly Placement[]>();

export function placementsOf(state: CanonicalState): readonly Placement[] {
  const known = made.get(state);
  if (known !== undefined) return known;
  const list = Object.values(state.records.topic_mapping)
    .slice(0, MAX_PLACEMENTS)
    .map((mapping) => ({ id: mapping.id, title: `${nameOfRef(state, mapping.target)} in ${nameOfRef(state, { kind: 'topic', id: mapping.topicId })}` }));
  made.set(state, list);
  return list;
}
