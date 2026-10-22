/**
 * The quick-entry dialog where it opens (step 6.7b, Q1): builds the dialog's port (names through search, structures through the chem worker
 * and the duplicate check, the live preview, the nested "Create new" editor, the reaction editor) and renders the dialog. Loaded with
 * `React.lazy` by `editors.tsx`, so none of it - the grammar, the resolver, the screen - is in the entry chunk.
 */
import { useMemo } from 'react';
import type { RecordRef } from '@/core/schema';
import { previewOfDraft } from '@/core/graph';
import { QuickEntryDialog } from '@/features/workbench/layer';
import type { PreviewPort } from '@/features/workbench';
import { EQUATION_AREA } from '@/render/equation/contracts';
import { createDepictionBinding } from '@/render/svg';
import { useApp } from './context';
import { createQuickEntryPort } from './quick-entry-port';

export function QuickEntryHost(props: {
  readonly initialLine: string;
  readonly onLine: (line: string) => void;
  readonly onClose: () => void;
  /** Opens the nested editor of "Create new" over this dialog; `done` gets the saved record. */
  readonly onCreate: (kind: 'species' | 'reagent', seed: Readonly<Record<string, unknown>>, done: (ref: RecordRef) => void) => void;
  /** Opens a NEW reaction draft with this seed (nothing is saved). */
  readonly onOpen: (seed: Readonly<Record<string, unknown>>) => void;
}) {
  const { services, inspector } = useApp();
  const { onCreate, onOpen } = props;
  const port = useMemo(() => {
    const panels = inspector.ui.panels;
    const preview: PreviewPort = {
      build: (draft) => previewOfDraft(services.store.getState(), inspector.indexes.current(), draft),
      binding: inspector.depictions === undefined ? undefined : createDepictionBinding(inspector.depictions, inspector.timers, EQUATION_AREA),
      facts: inspector.facts,
      timers: inspector.timers,
      names: { get: () => panels.getState().equationNames, set: (names) => panels.getState().setEquationNames(names), subscribe: (listener) => panels.subscribe(() => listener()) },
    };
    return createQuickEntryPort({
      search: services.search.search,
      state: services.store.getState,
      indexes: inspector.indexes.current,
      activeExam: () => inspector.ui.exam?.getState().active ?? null,
      chem: services.chem,
      duplicateCheck: services.duplicateCheck,
      preview,
      createNew: onCreate,
      openRecord: (ref) => {
        inspector.ui.inspector.getState().open(ref);
        inspector.ui.panels.getState().setInspectorOpen(true);
      },
      open: onOpen,
      newId: (prefix) => services.drafts.newId(prefix),
    });
  }, [services, inspector, onCreate, onOpen]);
  return <QuickEntryDialog port={port} initialLine={props.initialLine} onLine={props.onLine} onClose={props.onClose} />;
}
