/**
 * Which reactions fold under which general reaction in ONE list (7.3a C1, C2, C5). A reaction E whose `instanceOfId` names a GENERIC
 * reaction G is an example of G. In a list that shows G's card, E is not a card of its own: it is folded under G ("Examples (n)").
 * Where G's card is not in the list, E stays a card and carries "Example of G". Pure and derived; nothing is stored. Chains are not
 * allowed by RXN-013, so folding is one level.
 */
import { fold } from '../../text/normalizer';

export interface ExampleLookup {
  /** The general reaction a reaction says it is an example of; undefined when none. */
  readonly instanceOf: (reactionId: string) => string | undefined;
  /** True when the record exists and its scope is generic. */
  readonly isGeneric: (reactionId: string) => boolean;
  /** Folded name for ordering; ties are broken by id. */
  readonly sortKey: (reactionId: string) => string;
}

export interface ExampleFold {
  /** The ids that are cards in this list, in the order given. */
  readonly shown: readonly string[];
  /** General reaction id -> its folded examples (folded name, then id). Present only when it has at least one. */
  readonly examplesOf: ReadonlyMap<string, readonly string[]>;
  /** A reaction shown as its own card -> the general reaction it is an example of (that card is not in this list). */
  readonly exampleOf: ReadonlyMap<string, string>;
  /** How many reactions were folded away. */
  readonly folded: number;
}

export function foldExamples(listed: readonly string[], lookup: ExampleLookup): ExampleFold {
  const ids = [...new Set(listed)];
  const inList = new Set(ids);
  const shown: string[] = [];
  const folding = new Map<string, string[]>();
  const exampleOf = new Map<string, string>();
  let folded = 0;
  for (const id of ids) {
    const general = lookup.instanceOf(id);
    const valid = general !== undefined && general !== id && lookup.isGeneric(general) && lookup.instanceOf(general) === undefined;
    if (valid && inList.has(general)) {
      const list = folding.get(general) ?? [];
      list.push(id);
      folding.set(general, list);
      folded += 1;
      continue;
    }
    if (valid) exampleOf.set(id, general);
    shown.push(id);
  }
  const examplesOf = new Map<string, readonly string[]>();
  for (const [general, list] of folding) {
    examplesOf.set(
      general,
      [...list].sort((a, b) => {
        const ka = lookup.sortKey(a);
        const kb = lookup.sortKey(b);
        return ka < kb ? -1 : ka > kb ? 1 : a < b ? -1 : a > b ? 1 : 0;
      }),
    );
  }
  return { shown, examplesOf, exampleOf, folded };
}

/** The lookup over a canonical state: the reaction records' `instanceOfId`, `scope` and folded name. */
export function exampleLookupOf(state: { readonly records: { readonly reaction: Readonly<Record<string, { readonly scope: string; readonly name: string; readonly instanceOfId?: string }>> } }): ExampleLookup {
  const reactions = state.records.reaction;
  return {
    instanceOf: (id) => reactions[id]?.instanceOfId,
    isGeneric: (id) => reactions[id]?.scope === 'generic',
    sortKey: (id) => fold(reactions[id]?.name ?? id),
  };
}
