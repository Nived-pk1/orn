/**
 * Star for revision (step 8.4g Part B, G2): the key S on the selected record. What a star did is said by `useToggleStar`. Same guards as the
 * history keys: not inside a text field, not with a modifier, not while a dialog is open.
 */
import { useEffect } from 'react';
import type { RecordRef } from '@/core/schema';
import { isEditable } from './history-keys';
import { lateBindingFor } from './key-map-late';
import type { MyRecords } from './my-records';
import { useToggleStar } from './use-toggle-star';

export function StarKey(props: { readonly mine: MyRecords; readonly selected: () => RecordRef | null }) {
  const toggle = useToggleStar(props.mine);
  const { selected } = props;
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || !lateBindingFor('star').match(event)) return;
      if (isEditable(event.target) || document.querySelector('dialog[open]') !== null) return;
      // a menu's type-ahead or a dialog's own keys
      if (event.target instanceof Element && event.target.closest('[role="menu"], [role="listbox"], [role="dialog"]') !== null) return;
      const ref = selected();
      if (ref === null) return;
      event.preventDefault();
      toggle(ref);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  return null;
}
