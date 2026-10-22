/**
 * Resolving one quick-entry term (step 6.7b, Q3), through the port and never guessed: an exact name or alias match is resolved, several are
 * "Which one?", none are suggestions plus Create new. A term with no spaces is also asked of the chem worker (through the port): a structure
 * it can read is matched against the species by structure, else offered as a new species with that structure. The chem worker not answering
 * is said in words, never read as "not a structure". Pure over the port; no chemistry here.
 */
import type { TermRef } from '@/core/quick-entry/seed';
import type { QuickEntryPort } from './quick-entry-contracts';
import type { RecordChoice } from './record-picker-contracts';

export type TermState =
  | { readonly state: 'loading' }
  | { readonly state: 'resolved'; readonly ref: TermRef; readonly name: string; readonly kindWords: string; readonly how: 'name' | 'structure' | 'chosen' }
  | { readonly state: 'which'; readonly candidates: readonly RecordChoice[]; readonly how: 'name' | 'structure' }
  | { readonly state: 'missing'; readonly suggestions: readonly RecordChoice[]; readonly structure: 'none' | 'new' | 'unanswered'; readonly message?: string };

const MAX_SUGGESTIONS = 5;

/** A choice as a term reference; a kind a term cannot be is refused (`undefined`). */
export function termRefOf(choice: RecordChoice): TermRef | undefined {
  return choice.kind === 'species' || choice.kind === 'class' || choice.kind === 'reagent' ? { kind: choice.kind, id: choice.id } : undefined;
}

export function resolvedFrom(choice: RecordChoice, how: 'name' | 'structure' | 'chosen'): TermState {
  const ref = termRefOf(choice);
  return ref === undefined ? { state: 'missing', suggestions: [], structure: 'none' } : { state: 'resolved', ref, name: choice.name, kindWords: choice.kindWords, how };
}

export async function resolveTerm(text: string, port: Pick<QuickEntryPort, 'find' | 'structure'>): Promise<TermState> {
  try {
    const found = await port.find(text);
    if (found.exact.length === 1) return resolvedFrom(found.exact[0] as RecordChoice, 'name');
    if (found.exact.length > 1) return { state: 'which', candidates: found.exact, how: 'name' };
    const suggestions = found.suggestions.slice(0, MAX_SUGGESTIONS);
    if (/\s/.test(text)) return { state: 'missing', suggestions, structure: 'none' };
    const answer = await port.structure(text);
    if (answer.state === 'matched') return answer.matches.length === 1 ? resolvedFrom(answer.matches[0] as RecordChoice, 'structure') : { state: 'which', candidates: answer.matches, how: 'structure' };
    if (answer.state === 'new') return { state: 'missing', suggestions, structure: 'new' };
    if (answer.state === 'unanswered') return { state: 'missing', suggestions, structure: 'unanswered', message: answer.message };
    return { state: 'missing', suggestions, structure: 'none' };
  } catch (error) {
    return { state: 'missing', suggestions: [], structure: 'unanswered', message: `The search did not answer${error instanceof Error ? ` (${error.message})` : ''}` };
  }
}
