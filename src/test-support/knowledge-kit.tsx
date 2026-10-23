/**
 * Test kit for the knowledge editors (step 6.6b): the real editor host over the real store, session manager and picker port, with the
 * search worker replaced by a name scan (names, titles or `names.canonical`), quiet live checks, and the open-record call recorded.
 * Test-only.
 */
import { screen } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import { createRecordPicker } from '@/app/window/record-picker-port';
import { indexEngine } from '@/core/indexes';
import type { RecordKind, RecordRef } from '@/core/schema';
import { EditorHost } from '@/features/workbench/editor-host';
import type { DraftChecksPort } from '@/features/workbench';
import { dryRun } from '@/workers/compute/dry-run';
import { utcTime } from './editing-kit';
import { editorRig, renderWithToasts, type EditorRig } from './editor-kit';

const quiet: DraftChecksPort = {
  dryRun: async (_k, _d, version) => ({ version, state: 'checked', findings: [] }),
  structure: async (_k, _d, version) => ({ version, state: 'none' }),
};

type Named = { id: string; names?: { canonical: string }; name?: string; title?: string };
const nameOf = (r: Named): string => r.names?.canonical ?? r.name ?? r.title ?? '';

/** The real picker port over the rig's state; the search is a scan of the names. */
export function knowledgePicker(rig: EditorRig) {
  const state = () => rig.store.getState();
  return createRecordPicker({
    search: (async (_channel: string, request: { text: string; kinds: readonly string[] }) => ({
      ok: true,
      value: request.kinds.flatMap((kind) =>
        Object.values((state().records as unknown as Record<string, Record<string, Named>>)[kind] ?? {})
          .filter((r) => nameOf(r).toLowerCase().includes(request.text.toLowerCase()))
          .map((r) => ({ ref: { kind, id: r.id } })),
      ),
    })) as never,
    state,
    indexes: () => indexEngine.build(state()),
    activeExam: () => null,
  });
}

export interface ShownKnowledge {
  readonly rig: EditorRig;
  readonly id: string;
  readonly dialog: HTMLElement;
  readonly openRecord: Mock;
  /** `chain.start(kind, seed)` and `chain.edit(ref)`: the editor closed and another one was asked for. */
  readonly start: Mock;
  readonly editRecord: Mock;
  /** `chain.remove(ref)`: the Delete dialog was asked for this record (step 6.8a). */
  readonly remove: Mock;
  readonly draft: () => Record<string, unknown>;
}

/** The REAL L1-L3 dry run (the one the checking worker runs) over the rig's store: live findings such as CAV-001 and CAV-002 come from the real rules. */
const realChecks = (rig: EditorRig): DraftChecksPort => ({
  dryRun: async (kind, draft, version) => {
    const state = rig.store.getState();
    const answer = dryRun(state, indexEngine.build(state), kind, draft);
    return answer.ok ? { version, state: 'checked', findings: answer.findings } : { version, state: 'unavailable', message: answer.message };
  },
  structure: quiet.structure,
});

export function showKnowledge(kind: RecordKind, options: { target?: string; blank?: boolean; seed?: Record<string, unknown>; rig?: EditorRig; real?: boolean } = {}): ShownKnowledge {
  const rig = options.rig ?? editorRig();
  const opened = rig.drafts.open(options.blank === true ? { kind, blank: true, ...(options.seed === undefined ? {} : { seed: options.seed }) } : { kind, id: options.target as string });
  if (!opened.ok) throw new Error(opened.message);
  const openRecord = vi.fn((_ref: RecordRef) => undefined);
  const start = vi.fn((_kind: RecordKind, _seed: Record<string, unknown>) => undefined);
  const editRecord = vi.fn((_ref: RecordRef) => undefined);
  const remove = vi.fn((_ref: RecordRef) => undefined);
  const duplicates = { check: async () => ({ matches: [], more: 0, structureChecked: true }), openRecord };
  renderWithToasts(<EditorHost port={{ ...rig.port, checks: options.real === true ? realChecks(rig) : quiet, records: knowledgePicker(rig), duplicates: duplicates as never, chain: { start, edit: editRecord, remove } }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
  return { rig, id: opened.id, dialog: screen.getByRole('dialog'), openRecord, start, editRecord, remove, draft: () => rig.drafts.entry(opened.id)?.session.draft as Record<string, unknown> };
}
