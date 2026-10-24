/**
 * The Reactions view's words and bookkeeping (step 7.1b D1, D2, D5): the count line, the labels of ids, the removable chips, and dropping a
 * saved filter's ids that name nothing any more. Pure; the chemistry is the core filter's. Nothing here is stored.
 */
import { STATUS_WORDS } from '@/core/editing';
import { UNCLASSIFIED_HUB_ID, UNCLASSIFIED_NAME, type ReactionFilter } from '@/core/graph';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState } from '@/core/schema';
import type { ExplorerFilter, ExplorerUse } from '@/ui/state';

export const USE_WORDS: Readonly<Record<ExplorerUse, string>> = { any: 'Any', reactant: 'Starting material', arrow: 'On the arrow', product: 'Product' };

export interface CountFacts {
  readonly shown: number;
  readonly total: number;
  readonly filtered: boolean;
  /** Reactions "Only <exam version>" hides. */
  readonly hidden: number;
  /** The exam's name for the hidden words; absent: no exam scope. */
  readonly hiddenBy: string | undefined;
}

const reactions = (n: number): string => (n === 1 ? '1 reaction' : `${n} reactions`);

/** "24 reactions", "24 of 212 reactions", and " (5 outside JEE Main hidden)" while Only hides some. */
export function countLine(facts: CountFacts): string {
  const base = facts.filtered ? `${facts.shown} of ${facts.total} reactions` : reactions(facts.shown);
  return facts.hidden > 0 && facts.hiddenBy !== undefined ? `${base} (${facts.hidden} outside ${facts.hiddenBy} hidden)` : base;
}

export interface Labels {
  family(id: string): string;
  type(id: string): string;
  named(id: string): string;
  substance(id: string): string;
  status(id: string): string;
}

type Named = { readonly name?: string; readonly names?: { readonly canonical: string } };
const nameOfRecord = (record: Named | undefined, fallback: string): string => record?.names?.canonical ?? record?.name ?? fallback;

export function labelsOf(state: CanonicalState, indexes: ReadonlyIndexes): Labels {
  const byId = (id: string): string => nameOfRecord(indexes.get(id) as Named | undefined, id);
  return {
    family: (id) => (id === UNCLASSIFIED_HUB_ID ? UNCLASSIFIED_NAME : byId(id)),
    type: (id) => nameOfRecord(state.records.concept[id as never] as Named | undefined, id),
    named: (id) => nameOfRecord(state.records.named_reaction[id as never] as Named | undefined, id),
    substance: byId,
    status: (id) => STATUS_WORDS[id as keyof typeof STATUS_WORDS] ?? id,
  };
}

export interface Chip {
  readonly key: string;
  readonly label: string;
  /** The name of its button: "Remove Type: Oxidation". */
  readonly removeName: string;
  /** The filter without this chip. */
  without(filter: ExplorerFilter): ExplorerFilter;
}

type ListKey = 'substanceIds' | 'fromFamilyIds' | 'toFamilyIds' | 'typeIds' | 'namedReactionIds' | 'reviewStatuses';

export function chipsOf(filter: ExplorerFilter, labels: Labels): readonly Chip[] {
  const out: Chip[] = [];
  const list = (key: ListKey, dimension: string, label: (id: string) => string): void => {
    for (const id of filter[key]) {
      const text = `${dimension}: ${label(id)}`;
      out.push({ key: `${key}:${id}`, label: text, removeName: `Remove ${text}`, without: (f) => ({ ...f, [key]: f[key].filter((one) => one !== id) }) });
    }
  };
  list('substanceIds', 'Substance', labels.substance);
  if (filter.substanceIds.length > 0 && filter.usedAs !== 'any') {
    const text = `Used as: ${USE_WORDS[filter.usedAs]}`;
    out.push({ key: 'usedAs', label: text, removeName: `Remove ${text}`, without: (f) => ({ ...f, usedAs: 'any' }) });
  }
  list('fromFamilyIds', 'From family', labels.family);
  list('toFamilyIds', 'To family', labels.family);
  list('typeIds', 'Type', labels.type);
  list('namedReactionIds', 'Named reaction', labels.named);
  list('reviewStatuses', 'Review status', labels.status);
  if (filter.text !== '') {
    const text = `Name: ${filter.text}`;
    out.push({ key: 'text', label: text, removeName: `Remove ${text}`, without: (f) => ({ ...f, text: '' }) });
  }
  return out;
}

/** The saved filter without the ids that name nothing in this dataset; `dropped` says whether it removed any (the view tells the user once). */
export function pruneFilter(filter: ExplorerFilter, state: CanonicalState, indexes: ReadonlyIndexes): { readonly filter: ExplorerFilter; readonly dropped: boolean } {
  const families = new Set<string>([UNCLASSIFIED_HUB_ID, ...indexes.navigatorRollup().hubs.map((hub) => hub.id)]);
  const keep: Record<ListKey, (id: string) => boolean> = {
    substanceIds: (id) => indexes.get(id) !== undefined,
    fromFamilyIds: (id) => families.has(id),
    toFamilyIds: (id) => families.has(id),
    typeIds: (id) => state.records.concept[id as never] !== undefined,
    namedReactionIds: (id) => state.records.named_reaction[id as never] !== undefined,
    reviewStatuses: () => true,
  };
  let dropped = false;
  const next = { ...filter } as { -readonly [K in keyof ExplorerFilter]: ExplorerFilter[K] };
  for (const key of Object.keys(keep) as ListKey[]) {
    const kept = filter[key].filter(keep[key]);
    if (kept.length !== filter[key].length) {
      dropped = true;
      next[key] = kept;
    }
  }
  return { filter: dropped ? next : filter, dropped };
}

export const toReactionFilter = (filter: ExplorerFilter): ReactionFilter => ({
  substanceIds: filter.substanceIds,
  usedAs: filter.usedAs,
  fromFamilyIds: filter.fromFamilyIds,
  toFamilyIds: filter.toFamilyIds,
  typeIds: filter.typeIds,
  namedReactionIds: filter.namedReactionIds,
  reviewStatuses: filter.reviewStatuses as ReactionFilter['reviewStatuses'],
  text: filter.text,
  onlyInScope: filter.onlyInScope,
});
