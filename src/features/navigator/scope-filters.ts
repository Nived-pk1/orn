/**
 * "Only <exam>" on the map (step 8.3b, B2; ADR-046). With an exam chosen and the switch on Only, the request asks for every scope but `outside`
 * (`ViewFilters.scopes`, an existing field), so the arrows and counts of reactions outside the exam are left out. A family whose reactions are all
 * outside is not removed: the family's flag is read from its whole roll-up, so it fades. A record with no mapping at all is `unmapped`, not proven
 * outside: for the filter only, the lens answers `official` for it, so it stays shown.
 */
import type { ScopeOf } from '@/core/graph';
import type { ViewFilters } from '@/core/schema';

export const SCOPES_KEPT: ViewFilters['scopes'] = ['official', 'prerequisite', 'enrichment'];

export function onlyFilters(filters: ViewFilters, only: boolean): ViewFilters {
  return only ? { ...filters, scopes: [...SCOPES_KEPT] } : filters;
}

export function keepUnmapped(scopeOf: ScopeOf, only: boolean): ScopeOf {
  if (!only) return scopeOf;
  return (ref) => {
    const scope = scopeOf(ref);
    return scope === 'unmapped' ? 'official' : scope;
  };
}
