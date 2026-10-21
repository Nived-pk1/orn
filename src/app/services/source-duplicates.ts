/**
 * The duplicate check of a SOURCE (step 6.6a, decision C2): another source with the same title (folded: case and spacing) and the same year
 * (both absent counts as the same), or the same identifier (folded). Advice only, like the other duplicate checks: nothing here changes data
 * and the store gate still runs. The record itself is never a match. No chemistry; Merge is unavailable until step 6.8.
 */
import type { CanonicalState, Reference } from '@/core/schema';
import type { DuplicateMatch, DuplicateOutcome } from '@/features/workbench';

export const MAX_SOURCE_MATCHES = 10;

const fold = (text: string | undefined): string => (text ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

export function sourceDuplicates(state: CanonicalState, source: Reference): DuplicateOutcome {
  const title = fold(source.title);
  const identifier = fold(source.identifier);
  const found: { readonly record: Reference; readonly reasons: ('identifier' | 'title')[] }[] = [];
  for (const record of Object.values(state.records.reference)) {
    if (record.id === source.id) continue;
    const reasons: ('identifier' | 'title')[] = [];
    if (identifier !== '' && fold(record.identifier) === identifier) reasons.push('identifier');
    if (title !== '' && fold(record.title) === title && record.year === source.year) reasons.push('title');
    if (reasons.length > 0) found.push({ record, reasons });
  }
  found.sort((a, b) => (a.record.id < b.record.id ? -1 : 1));
  const matches: DuplicateMatch[] = found.slice(0, MAX_SOURCE_MATCHES).map(({ record, reasons }) => ({
    ref: { kind: 'reference', id: record.id },
    name: record.title,
    ...(record.year === undefined ? {} : { qualifier: String(record.year) }),
    reasons,
  }));
  return { matches, more: Math.max(0, found.length - matches.length), structureChecked: true };
}
