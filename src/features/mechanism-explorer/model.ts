/**
 * What the Mechanisms list and steps say in words without drawing (step 7.4 E). Pure; the records, their counts and the filters are the
 * core's (`@/core/mechanisms`). No chemistry here: only plurals and the lines of a row or a step.
 */
import type { MechanismRow, StepView } from '@/core/mechanisms';
import { plural } from '@/core/text';

/** "also called A, B" with at most the first two aliases; nothing when there are none. */
export function alsoCalledWords(aliases: readonly string[]): string | undefined {
  return aliases.length === 0 ? undefined : `also called ${aliases.slice(0, 2).join(', ')}`;
}

/** "3 reactions · 7 steps". */
export function usedWords(row: Pick<MechanismRow, 'reactions' | 'steps'>): string {
  return [plural(row.reactions, 'reaction', 'reactions'), plural(row.steps, 'step', 'steps')].join(' · ');
}

/** "Step 2 · Enolate forms", or "Step 2 · proton transfer" when the step has no title, or just "Step 2". */
export function stepHeading(step: Pick<StepView, 'number' | 'title' | 'kinds'>): string {
  const what = step.title !== undefined && step.title !== '' ? step.title : step.kinds.join(', ');
  return what === '' ? `Step ${step.number}` : `Step ${step.number} · ${what}`;
}
