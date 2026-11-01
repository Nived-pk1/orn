/**
 * The reagent list (7.3c C1): every reagent with its backing species or its components, its families, the number of reactions that use it and
 * its profiles. Filters: the name box (names, aliases and the profiles' labels and aliases, folded), reagent families (several = any of) and an
 * exam scope (a reagent with at least one reaction that is not outside it). Facet counts per family follow the name box and the scope, not the
 * family choice itself. Order: folded name, then id. Pure and derived; reactions come from the `byReagent` index (direct references only).
 */
import type { ReadonlyIndexes } from '../indexes/contracts';
import type { CanonicalState, Reagent, ReagentFamily } from '../schema';
import { REAGENT_FAMILIES } from '../schema';
import { fold } from '../text/normalizer';
import { findableNames, shownName } from './names';

export interface ReagentFilter {
  readonly text: string;
  readonly families: readonly ReagentFamily[];
  /** With an exam scope: true when the reaction is outside it. */
  readonly outside?: (reactionId: string) => boolean;
}

export type Backing =
  | { readonly kind: 'species'; readonly id: string; readonly name: string }
  | { readonly kind: 'mixture'; readonly parts: readonly { readonly kind: string; readonly id: string; readonly name: string; readonly role: string }[] };

export interface ReagentRow {
  readonly id: string;
  readonly name: string;
  readonly formula: string | undefined;
  readonly backing: Backing | undefined;
  readonly families: readonly ReagentFamily[];
  /** DISTINCT reactions that name this reagent directly. */
  readonly reactions: number;
  readonly profiles: number;
}

export interface ReagentList {
  readonly rows: readonly ReagentRow[];
  /** All reagents in the dataset. */
  readonly total: number;
  readonly familyCounts: Readonly<Record<ReagentFamily, number>>;
}

export type ReagentIndexes = Pick<ReadonlyIndexes, 'reactionsByReagent'>;

function backingOf(state: CanonicalState, reagent: Reagent): Backing | undefined {
  if (reagent.speciesId !== undefined) return { kind: 'species', id: reagent.speciesId, name: shownName(state.records.species[reagent.speciesId], reagent.speciesId) };
  if (reagent.components.length === 0) return undefined;
  return {
    kind: 'mixture',
    parts: reagent.components.map((part) => ({
      kind: part.ref.kind,
      id: part.ref.id,
      name: shownName((state.records[part.ref.kind] as Readonly<Record<string, never>>)[part.ref.id], part.ref.id),
      role: part.role,
    })),
  };
}

export function filterReagents(state: CanonicalState, indexes: ReagentIndexes, filter: ReagentFilter): ReagentList {
  const needle = fold(filter.text.trim());
  const all = Object.values(state.records.reagent);
  const named = new Map(all.map((reagent) => [reagent.id, shownName(reagent, reagent.id)] as const));
  const sorted = [...all].sort((a, b) => {
    const x = fold(named.get(a.id) ?? '');
    const y = fold(named.get(b.id) ?? '');
    return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const familyCounts = Object.fromEntries(REAGENT_FAMILIES.map((family) => [family, 0])) as Record<ReagentFamily, number>;
  const rows: ReagentRow[] = [];
  for (const reagent of sorted) {
    if (needle !== '' && !findableNames(reagent).some((name) => fold(name).includes(needle))) continue;
    const reactions = indexes.reactionsByReagent(reagent.id);
    if (filter.outside !== undefined && !reactions.some((id) => filter.outside?.(id) !== true)) continue;
    for (const family of new Set(reagent.families)) familyCounts[family] += 1;
    if (filter.families.length > 0 && !reagent.families.some((family) => filter.families.includes(family))) continue;
    rows.push({
      id: reagent.id,
      name: named.get(reagent.id) ?? reagent.id,
      formula: reagent.formulaText,
      backing: backingOf(state, reagent),
      families: reagent.families,
      reactions: new Set(reactions).size,
      profiles: reagent.profiles.length,
    });
  }
  return { rows, total: all.length, familyCounts };
}
