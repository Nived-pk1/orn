/**
 * The inspector's inputs from the canvas and the keyboard (step 5.6a, rebuilt in step 8.2b-fix, S1). The map has ONE selection and the
 * inspector's history holds it: a pick on the map selects a record (a family), the bucket (the derived "Not in a family yet" node) or an
 * arrow (from node, to node); an empty-map click or Esc selects nothing; a reaction picked in a list opens that record. Each pick is one
 * event of its store (`picks`, `clears`), also a repeat of what was already selected. The inspector SHOWS the current entry and nothing
 * else (`mapInspectorView`), so closing the pane never changes it and reopening it shows exactly it. Alt+Left and Alt+Right walk the
 * history. A pick on the MAP opens the pane only on `reveal()` of the selection store (step 5.7: the pointer state machine calls it when
 * the click's 300 ms double-click window has passed; Enter and the context menu call it at once). The bridge keeps no timer of its own.
 * Step 8.4d (E3): opening a family PAGE selects that family (it is a place the selection can be), and closing the page (Back) puts back the
 * selection that was there before, as long as the family is still the selection; a reaction opened on the page stays selected.
 */
import { useEffect, useRef } from 'react';
import { UNCLASSIFIED_HUB_ID } from '@/core/graph';
import { currentOf } from '@/ui/state';
import type { InspectorHost, InspectorPorts } from './contracts';
import { refOfId } from './model/describe';

const typing = (target: EventTarget | null): boolean => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

export function useBridge(ports: InspectorPorts, host: InspectorHost): void {
  const hostRef = useRef(host);
  hostRef.current = host;
  useEffect(() => {
    const { inspector, selection, family } = ports.ui;
    let selectionPicks = selection.getState().picks;
    let clears = selection.getState().clears;
    let familyPicks = family.getState().picks;
    let selectionReveals = selection.getState().reveals;
    const offSelection = selection.subscribe((state) => {
      if (state.reveals !== selectionReveals) {
        selectionReveals = state.reveals;
        if (family.getState().open === null) hostRef.current.openPane();
      }
      if (state.clears !== clears) {
        clears = state.clears;
        inspector.getState().select({ kind: 'none' });
      }
      if (state.picks === selectionPicks) return;
      selectionPicks = state.picks;
      const selected = state.selected;
      if (selected === null) return;
      if (selected.kind === 'edge') {
        const ends = hostRef.current.edgeEnds(selected.id);
        inspector.getState().select(ends === undefined ? { kind: 'none' } : { kind: 'arrow', from: ends.from, to: ends.to });
        return;
      }
      if (selected.id === UNCLASSIFIED_HUB_ID) {
        inspector.getState().select({ kind: 'bucket' });
        return;
      }
      const ref = refOfId(selected.id);
      if (ref === undefined) inspector.getState().select({ kind: 'none' });
      else inspector.getState().open(ref);
    });
    // the open family page: its family becomes the selection; closing the page takes that entry away again (Back)
    let opened = family.getState().open;
    let pushed = false;
    const offOpen = family.subscribe((state) => {
      if (state.open === opened) return;
      const was = opened;
      opened = state.open;
      if (state.open !== null) {
        const ref = refOfId(state.open);
        if (ref === undefined) return;
        const before = inspector.getState().index;
        inspector.getState().open(ref);
        pushed = pushed || inspector.getState().index !== before;
        return;
      }
      const wasRef = was === null ? undefined : refOfId(was);
      const current = currentOf(inspector.getState());
      if (pushed && wasRef !== undefined && current !== null && current.kind === wasRef.kind && current.id === wasRef.id) inspector.getState().back();
      pushed = false;
    });
    const offFamily = family.subscribe((state) => {
      if (state.picks === familyPicks) return;
      familyPicks = state.picks;
      if (state.reaction === null) return;
      inspector.getState().open({ kind: 'reaction', id: state.reaction });
      hostRef.current.openPane();
    });
    return () => {
      offSelection();
      offOpen();
      offFamily();
    };
  }, [ports]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented || typing(event.target)) return;
      const store = ports.ui.inspector.getState();
      const moved = event.key === 'ArrowLeft' ? store.back() : event.key === 'ArrowRight' ? store.forward() : undefined;
      if (moved === undefined) return;
      event.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ports]);
}
