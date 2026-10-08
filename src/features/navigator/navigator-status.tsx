/** What the drawing cut, in one plain line for the status bar (step 5.5a, item l; the full notice is step 5.5b). Nothing is silent. */
import { useStore } from 'zustand';
import type { Truncation } from '@/core/graph';
import type { NavigatorUiStatus } from '@/ui/state';
import { useNavigator, useNavigatorState } from './navigator-context';

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

/** What keeping the selection, the expansion and the zoom is doing, in plain words (nothing silent: a reset, a read-only tab, a failed save). */
export function navigatorNoticesOf(status: NavigatorUiStatus): readonly string[] {
  const notices: string[] = [];
  if (status.resetFields.length > 0) notices.push(`The saved selection, expansion or zoom was damaged and was reset (${status.resetFields.join(', ')}).`);
  const p = status.persistence;
  if (p.kind === 'read_only') notices.push('Selection, expansion and zoom are not saved: this tab is read-only.');
  else if (p.kind === 'session_only') notices.push('Selection, expansion and zoom are not saved: nothing is saved in this session.');
  else if (p.kind === 'save_failed') notices.push(`Selection, expansion and zoom could not be saved (${p.message}).`);
  return notices;
}

export function NavigatorStatus() {
  const { ports } = useNavigator();
  const { scene } = useNavigatorState();
  const ui = useStore(ports.uiStatus);
  const line = truncationLineOf(scene?.truncation ?? null);
  const notices = navigatorNoticesOf(ui);
  return (
    <>
      {line === null ? null : (
        <section aria-label="Drawing limits" aria-live="polite">
          {line}
        </section>
      )}
      {notices.length === 0 ? null : (
        <section aria-label="Saved view" aria-live="polite">
          {notices.join(' ')}
        </section>
      )}
    </>
  );
}
