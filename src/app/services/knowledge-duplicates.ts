/**
 * The duplicate check of a concept, a named reaction or a transformation (step 6.6b, decisions N1 to N3): another record of the SAME kind
 * whose name or alias is the same as the draft's name or any of its aliases (folded: case, spacing and compatibility forms). The record
 * itself is never a match. Advice only, like the other duplicate checks: nothing here changes data and the store gate still runs. No rule
 * covers these kinds, so this check is the editor's own. Merge is unavailable until step 6.8. No chemistry.
 */
import type { CoreIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, Concept, NamedReaction, Transformation } from '@/core/schema';
import { fold } from '@/core/text';
import type { DuplicateMatch, DuplicateOutcome } from '@/features/workbench';

export const MAX_KNOWLEDGE_MATCHES = 10;

export type KnowledgeKind = 'concept' | 'named_reaction' | 'transformation';
type Knowledge = Concept | NamedReaction | Transformation;

export function knowledgeDuplicates(state: CanonicalState, indexes: Pick<CoreIndexes, 'byFoldedName'>, kind: KnowledgeKind, draft: Knowledge): DuplicateOutcome {
  const table = state.records[kind] as Readonly<Record<string, Knowledge>>;
  const ids = new Set<string>();
  for (const name of [draft.name, ...draft.aliases]) {
    const folded = fold(name);
    if (folded === '') continue;
    for (const ref of indexes.byFoldedName(kind, folded)) if (ref.id !== draft.id) ids.add(ref.id);
  }
  const found = [...ids].filter((id) => Object.hasOwn(table, id)).sort();
  const matches: DuplicateMatch[] = found.slice(0, MAX_KNOWLEDGE_MATCHES).map((id) => {
    const record = table[id] as Knowledge;
    return {
      ref: { kind, id },
      name: record.name,
      ...(record.kind === 'concept' ? { qualifier: record.conceptKind.replace(/_/g, ' ') } : {}),
      reasons: ['name'],
    };
  });
  return { matches, more: Math.max(0, found.length - matches.length), structureChecked: true };
}
