/**
 * "Create new" in the record pickers (step 6.7a decision C1). The editor host provides `CreateNewApi` through this context, so the 22
 * pickers need no new prop: a picker with text typed shows one "Create new <kind> "<text>"" row per kind it allows (a kind with no editor
 * has none). The row opens a NESTED editor (a second dialog over the first, its own draft, its own undo) whose name is the typed text; the
 * record it saves is handed to `done` and the picker picks it into the parent draft. Inside a nested editor there is no row, only the
 * sentence: one new record at a time. No chemistry here.
 */
import { createContext, useContext } from 'react';
import type { RecordKind, RecordRef } from '@/core/schema';
import type { PickKind } from './record-picker-contracts';

export interface CreateNewApi {
  /** True inside a nested editor: one level only. */
  readonly nested: boolean;
  /** Opens the nested editor for a new `kind` named `name`; `done` gets the saved record (never called when the editor is closed or discarded). */
  start(kind: RecordKind, name: string, done: (ref: RecordRef) => void): void;
}

export const CreateNewContext = createContext<CreateNewApi | undefined>(undefined);
export const useCreateNew = (): CreateNewApi | undefined => useContext(CreateNewContext);

export const NESTED_SENTENCE = 'Finish this one first: one new record at a time';

/** The kinds a picker can create: every `PickKind` that has an editor (a route has none yet). */
export const canCreate = (kind: PickKind): boolean => kind !== 'route';

/** The seed that makes the typed text a new record's name: where the kind keeps it (`names.canonical`, `name` or `title`). */
export function nameSeed(kind: RecordKind, text: string): Readonly<Record<string, unknown>> {
  if (kind === 'species' || kind === 'class' || kind === 'reagent') return { names: { canonical: text, common: [], aliases: [] } };
  if (kind === 'reference' || kind === 'caveat') return { title: text };
  return { name: text };
}
