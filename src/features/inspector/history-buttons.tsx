/** Back and Forward through the map selections the inspector has shown (a record, an arrow, the bucket, nothing); step 5.6a, widened in 8.2b-fix. */
import { useStore } from 'zustand';
import { canBack, canForward, type InspectorStore } from '@/ui/state';
import study from './study-inspector.module.css';

export function HistoryButtons(props: { readonly inspector: InspectorStore }) {
  const { inspector } = props;
  const history = useStore(inspector, (s) => s.history);
  const index = useStore(inspector, (s) => s.index);
  return (
    <div className={study.history} role="group" aria-label="History">
      <button type="button" className={study.iconButton} aria-label="Back" disabled={!canBack({ index })} onClick={() => inspector.getState().back()} aria-keyshortcuts="Alt+ArrowLeft">
        <span aria-hidden="true">‹</span>
      </button>
      <button type="button" className={study.iconButton} aria-label="Forward" disabled={!canForward({ history, index })} onClick={() => inspector.getState().forward()} aria-keyshortcuts="Alt+ArrowRight">
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
