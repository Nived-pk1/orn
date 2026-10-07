/** What the panels store says about keeping the layout, in plain words (nothing silent: a read-only tab, a session-only tab, a failed save, a reset). */
import { usePanels, type PanelsState, type PanelsStore } from '@/ui/state';
import { useApp } from './context';

export function panelNoticesOf(state: Pick<PanelsState, 'persistence' | 'resetFields'>): readonly string[] {
  const notices: string[] = [];
  if (state.resetFields.length > 0) notices.push(`The saved panel layout was damaged and was reset (${state.resetFields.join(', ')}).`);
  const p = state.persistence;
  if (p.kind === 'read_only') notices.push('Panel layout is not saved: this tab is read-only.');
  else if (p.kind === 'session_only') notices.push('Panel layout is not saved: nothing is saved in this session.');
  else if (p.kind === 'save_failed') notices.push(`Panel layout could not be saved (${p.message}).`);
  return notices;
}

function useNotices(panels: PanelsStore): readonly string[] {
  const persistence = usePanels(panels, (s) => s.persistence);
  const resetFields = usePanels(panels, (s) => s.resetFields);
  return panelNoticesOf({ persistence, resetFields });
}

export function PanelsStatus() {
  const { panels } = useApp();
  const notices = useNotices(panels);
  if (notices.length === 0) return null;
  return (
    <section aria-label="Panel layout" aria-live="polite">
      {notices.join(' ')}
    </section>
  );
}
