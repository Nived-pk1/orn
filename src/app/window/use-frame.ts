/**
 * What the window tells its frame about where the reader is (step 8.4d, Part C): the breadcrumb (the view, then the record the page is about)
 * and the tab title. The record is the open family page's family, else the record the inspector shows. Names come from the canonical records
 * through `nameOfRecord`; nothing is looked up by name.
 */
import { useEffect } from 'react';
import { useStore } from 'zustand';
import { nameOfRecord } from '@/features/inspector';
import { useStoreSelector } from '@/ui/hooks';
import { currentOf } from '@/ui/state';
import type { AnyRecord, RecordRef } from '@/core/schema';
import { useApp } from './context';
import { crumbOf, documentTitleOf, type Crumb } from './frame-title';

export function useFrame(mode: string, modes: readonly { readonly id: string; readonly label: string }[]): Crumb {
  const { services, navigator, inspector } = useApp();
  const familyHub = useStore(navigator.ui.family, (s) => s.open);
  const shown = useStore(inspector.ui.inspector, (s) => currentOf(s));
  const ref: RecordRef | null = familyHub !== null ? { kind: 'class', id: familyHub } : shown === null ? null : { kind: shown.kind, id: shown.id };
  const name = useStoreSelector(services.store, (state) => {
    if (ref === null) return undefined;
    const record = (state.records[ref.kind] as Readonly<Record<string, AnyRecord>> | undefined)?.[ref.id];
    return record === undefined ? undefined : nameOfRecord(record);
  });
  const crumb = crumbOf(modes, mode, name);
  const title = documentTitleOf(crumb);
  useEffect(() => {
    document.title = title;
  }, [title]);
  return crumb;
}
