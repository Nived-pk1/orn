/** The small chip words of a reaction's exam scope (step 8.3b, B2; ADR-046; shared by every list in step 8.4d): enrichment is "Extra", prerequisite "Background". Pure. */
export type ScopeChip = 'Extra' | 'Background';

export function scopeChipOf(scope: string | undefined): ScopeChip | undefined {
  return scope === 'enrichment' ? 'Extra' : scope === 'prerequisite' ? 'Background' : undefined;
}
