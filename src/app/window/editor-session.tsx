/**
 * One open editor (step 6.5a, entry size): builds the editor port (record pickers, the live preview, depictions) where the editor
 * opens and renders the editor host. It is loaded with `React.lazy` by `editors.tsx`, so the code only an OPEN editor needs
 * (`record-picker-port`, `editor-port`, the preview builder) is in the editor's chunk and not in the entry.
 */
import { useMemo } from 'react';
import type { RecordKind, RecordRef } from '@/core/schema';
import { previewOfDraft } from '@/core/graph';
import { EditorHost, nameSeed } from '@/features/workbench/layer';
import type { EditorPort, PreviewPort } from '@/features/workbench';
import { EQUATION_AREA } from '@/render/equation/contracts';
import { createDepictionBinding } from '@/render/svg';
import { useApp } from './context';
import { makeEditorPort } from './editor-port';
import { createMechanismLinks } from './mechanism-links-port';
import { createPicturesPort } from './pictures-port';
import { createRecordPicker } from './record-picker-port';

export function EditorSession(props: {
  readonly sessionId: string;
  readonly formatTime: (iso: string) => string;
  readonly onClose: () => void;
  /** Another editor in place of this one: a NEW record with fields filled in, or an existing record's editor (step 6.6c). */
  readonly onStart?: (kind: RecordKind, seed: Readonly<Record<string, unknown>>) => void;
  readonly onEdit?: (ref: RecordRef) => void;
  /** Create new (step 6.7a): opens a nested editor over this one. Absent in a nested editor (one level only). */
  readonly onCreate?: (kind: RecordKind, seed: Readonly<Record<string, unknown>>, done: (ref: RecordRef) => void) => void;
  /** Duplicate / specific from the editor toolbar (step 6.7a). */
  readonly onFrom?: (mode: 'duplicate' | 'specific', ref: RecordRef, unsaved?: boolean) => void;
  /** This is the nested editor: no chain, and its pickers say "Finish this one first". */
  readonly nested?: boolean;
  /** A nested editor saved its record. */
  readonly onSaved?: (ref: RecordRef) => void;
  /** A nested editor is open over this one. */
  readonly covered?: boolean;
}) {
  const { services, inspector } = useApp();
  const { onStart, onEdit, onCreate, onFrom, nested = false } = props;
  const port = useMemo<EditorPort>(() => {
    const records = createRecordPicker({
      search: services.search.search,
      state: services.store.getState,
      indexes: inspector.indexes.current,
      activeExam: () => inspector.ui.exam?.getState().active ?? null,
    });
    const openRecord = (ref: RecordRef): void => {
      inspector.ui.inspector.getState().open(ref);
      inspector.ui.panels.getState().setInspectorOpen(true);
    };
    // the live preview of a reaction draft: the core builds it from the current state and indexes (nothing is stored); it follows the Structures setting through the depiction port
    const panels = inspector.ui.panels;
    const preview: PreviewPort = {
      build: (draft) => previewOfDraft(services.store.getState(), inspector.indexes.current(), draft),
      binding: inspector.depictions === undefined ? undefined : createDepictionBinding(inspector.depictions, inspector.timers, EQUATION_AREA),
      facts: inspector.facts,
      timers: inspector.timers,
      names: { get: () => panels.getState().equationNames, set: (names) => panels.getState().setEquationNames(names), subscribe: (listener) => panels.subscribe(() => listener()) },
    };
    const { assets, persistence } = services;
    // pictures are saved at once outside the draft: they need the asset host (a window without one has no Pictures section)
    const pictures = assets === undefined ? undefined : createPicturesPort({ store: services.store, assets, getBlob: persistence === undefined ? undefined : (id) => persistence.getAssetBlob(id) });
    return makeEditorPort(services, inspector.timers, { ...(inspector.depictions === undefined ? {} : { depictions: inspector.depictions }), records, openRecord, preview, links: createMechanismLinks(services.store.getState), ...(pictures === undefined ? {} : { pictures }), ...(nested || onStart === undefined || onEdit === undefined ? {} : { chain: { start: onStart, edit: onEdit, ...(onFrom === undefined ? {} : { from: onFrom }) } }), ...(nested ? { createNew: { nested: true, start: () => undefined } } : onCreate === undefined ? {} : { createNew: { nested: false, start: (kind: RecordKind, name: string, done: (ref: RecordRef) => void) => onCreate(kind, nameSeed(kind, name), done) } }) });
  }, [services, inspector, onStart, onEdit, onCreate, onFrom, nested]);
  return <EditorHost port={port} sessionId={props.sessionId} open formatTime={props.formatTime} onClose={props.onClose} {...(props.onSaved === undefined ? {} : { onSaved: props.onSaved })} covered={props.covered === true} />;
}
