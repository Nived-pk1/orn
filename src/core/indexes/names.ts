/**
 * Names of a record for folded-name lookup. Structural, not per kind: a record contributes its
 * `name`, every `names.*` entry and its `aliases`, whatever its kind (docs/SEARCH.md §2).
 */
import { fold } from '../text';

function collect(value: unknown, into: string[]): void {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) for (const item of value) collect(item, into);
}

/** Distinct, non-empty folded names in first-seen order. */
export function foldedNamesOf(record: unknown): readonly string[] {
  if (typeof record !== 'object' || record === null) return [];
  const fields = record as Record<string, unknown>;
  const raw: string[] = [];
  collect(fields['name'], raw);
  collect(fields['aliases'], raw);
  const names = fields['names'];
  if (typeof names === 'object' && names !== null) {
    // `qualifier` disambiguates a name ("(generic)"); it is not a name itself.
    for (const [key, value] of Object.entries(names)) if (key !== 'qualifier') collect(value, raw);
  }
  const folded = new Set<string>();
  for (const text of raw) {
    const key = fold(text);
    if (key !== '') folded.add(key);
  }
  return [...folded];
}
