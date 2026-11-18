/**
 * The shortcuts sheet's way in (step 8.4g Part B, G5): the key "?" (not in a text field, not in a dialog or menu), and the sheet itself, a lazy
 * chunk fetched only when it is first asked for. The palette command and the Settings link call `openShortcuts`.
 */
import { lazy, Suspense, useEffect } from 'react';
import { useStore } from 'zustand';
import { isEditable } from './history-keys';
import { lateBindingFor } from './key-map-late';
import { openShortcuts, shortcutsStore } from './shortcuts-state';

const Sheet = lazy(() => import('./shortcuts-sheet').then((m) => ({ default: m.ShortcutsSheet })));

export function ShortcutsHost(props: { readonly studio: boolean }) {
  const open = useStore(shortcutsStore, (s) => s.open);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || !lateBindingFor('shortcuts').match(event) || isEditable(event.target)) return;
      if (document.querySelector('dialog[open]') !== null) return;
      if (event.target instanceof Element && event.target.closest('[role="menu"], [role="listbox"], [role="dialog"]') !== null) return;
      event.preventDefault();
      openShortcuts();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return open ? (
    <Suspense fallback={null}>
      <Sheet studio={props.studio} onClose={() => shortcutsStore.setState({ open: false })} />
    </Suspense>
  ) : null;
}
