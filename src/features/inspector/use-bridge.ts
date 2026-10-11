/**
 * The inspector's inputs from the canvas and the keyboard (step 5.6a): a click on a card, a family, an arrow or a Unanchored row focuses
 * its record and OPENS the pane when it is closed (closing stays the user's choice and is saved by the shell); Alt+Left and Alt+Right
 * move through the history. Each pick is one event of its store (`picks`), also a repeat of what was already selected.
 * Step 5.7: a pick on the MAP focuses the record at once but opens the pane only on `reveal()` of the selection store, which the
 * pointer state machine calls when the click's 300 ms double-click window has passed with no second click (Enter and the context menu
 * call it at once). The bridge keeps no timer of its own.
 */
import { useEffect, useRef, useState } from 'react';
import { currentOf, type Selected } from '@/ui/state';
import type { InspectorHost, InspectorPorts } from './contracts';
import { focusOfSelection } from './model/focus';

const typing = (target: EventTarget | null): boolean => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

export function useBridge(ports: InspectorPorts, host: InspectorHost): string | undefined {
  const [note, setNote] = useState<string | undefined>(undefined);
  const hostRef = useRef(host);
  hostRef.current = host;
  useEffect(() => {
    const { inspector, selection, family } = ports.ui;
    let selectionPicks = selection.getState().picks;
    let familyPicks = family.getState().picks;
    let selectionReveals = selection.getState().reveals;
    const offSelection = selection.subscribe((state) => {
      if (state.reveals !== selectionReveals) {
        selectionReveals = state.reveals;
        if (family.getState().open === null) hostRef.current.openPane();
      }
      if (state.picks === selectionPicks) return;
      selectionPicks = state.picks;
      const selected: Selected | null = state.selected;
      if (selected === null) return;
      const focus = focusOfSelection(selected, (id) => hostRef.current.edgeEnds(id), ports.store.getState(), ports.indexes.current());
      if (focus === undefined) return;
      // open first: moving the focus clears an old note, then this pick's own note is set (the last call wins)
      inspector.getState().open(focus.ref);
      setNote(focus.note);
    });
    const offFamily = family.subscribe((state) => {
      if (state.picks === familyPicks) return;
      familyPicks = state.picks;
      if (state.reaction === null) return;
      inspector.getState().open({ kind: 'reaction', id: state.reaction });
      setNote(undefined);
      hostRef.current.openPane();
    });
    return () => {
      offSelection();
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
      if (moved) setNote(undefined);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ports]);
  // a note belongs to the record it was made for: it goes when the focus moves elsewhere
  useEffect(
    () => ports.ui.inspector.subscribe((state, before) => {
      const now = currentOf(state);
      const was = currentOf(before);
      if (now !== was && (now?.id !== was?.id || now?.kind !== was?.kind)) setNote((value) => (value === undefined ? value : undefined));
    }),
    [ports],
  );
  return note;
}
