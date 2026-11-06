/** The small chip words of a reaction's exam scope (step 8.3b, B2; ADR-046): an enrichment reaction is "Extra", a prerequisite one "Background". Pure. */
export type ScopeChip = 'Extra' | 'Background';

export function scopeChipOf(scope: string): ScopeChip | undefined {
  return scope === 'enrichment' ? 'Extra' : scope === 'prerequisite' ? 'Background' : undefined;
}
