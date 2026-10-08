/** What the drawing cut, in one plain line for the status bar (step 5.5a, item l; the full notice is step 5.5b). Nothing is silent. */
import type { Truncation } from '@/core/graph';
import { useNavigatorState } from './navigator-context';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function truncationLineOf(truncation: Truncation | null): string | null {
  if (truncation === null) return null;
  const parts: string[] = [];
  if (truncation.hiddenPairs !== undefined) parts.push(plural(truncation.hiddenPairs, 'pair of hubs', 'pairs of hubs'));
  if (truncation.hiddenEdges !== undefined) parts.push(plural(truncation.hiddenEdges, 'arrow', 'arrows'));
  if (truncation.hiddenNodeEstimate > 0) parts.push(`about ${plural(truncation.hiddenNodeEstimate, 'hub or member', 'hubs or members')}`);
  const what = parts.length === 0 ? 'some of the graph' : parts.join(' and ');
  return `Not drawn: ${what} (the drawing is limited; reason: ${truncation.reason.replaceAll('_', ' ')}).`;
}

export function NavigatorStatus() {
  const { scene } = useNavigatorState();
  const line = truncationLineOf(scene?.truncation ?? null);
  if (line === null) return null;
  return (
    <section aria-label="Drawing limits" aria-live="polite">
      {line}
    </section>
  );
}
