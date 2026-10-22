// @vitest-environment jsdom
/**
 * A specific reaction started from a generic one (step 6.7a decision C3): every class participant and class product is an empty SLOT
 * "Choose a species of <class>" (members of that class first, the others under "Other species"); L1 refuses Save while a slot is empty;
 * choosing a species fills the slot and clears the marker. Over the real store, session manager and record picker, on the demo's generic
 * "1° alcohol → aldehyde (PCC)".
 */
import { utcTime } from '@/test-support/editing-kit';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRecordPicker } from '@/app/window/record-picker-port';
import { indexEngine } from '@/core/indexes';
import { specificSeed, SLOT_KEY } from '@/core/editing';
import type { Reaction, Species } from '@/core/schema';
import { parseRecord } from '@/core/validation';
import { editorRig, renderWithToasts, type EditorRig } from '@/test-support/editor-kit';
import { stubDialog } from '@/test-support/window-kit';
import { EditorHost } from './editor-host';

beforeAll(stubDialog);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const GENERIC = 'rxn_alcohol1-to-aldehyde-pcc';

function pickerFor(rig: EditorRig) {
  const state = () => rig.store.getState();
  return createRecordPicker({
    search: (async (_channel: string, request: { text: string; kinds: readonly string[] }) => ({
      ok: true,
      value: request.kinds.flatMap((kind) =>
        Object.values((state().records as unknown as Record<string, Record<string, { id: string; names?: { canonical: string }; name?: string }>>)[kind] ?? {})
          .filter((r) => (r.names?.canonical ?? r.name ?? '').toLowerCase().includes(request.text.toLowerCase()))
          .map((r) => ({ ref: { kind, id: r.id } })),
      ),
    })) as never,
    state,
    indexes: () => indexEngine.build(state()),
    activeExam: () => null,
  });
}
function show() {
  const rig = editorRig();
  const seed = specificSeed(rig.store.getState(), { kind: 'reaction', id: GENERIC }, { newId: (prefix: string) => rig.drafts.newId(prefix), now: () => '' } as never);
  const opened = rig.drafts.open({ kind: 'reaction', blank: true, seed });
  if (!opened.ok) throw new Error(opened.message);
  const records = pickerFor(rig);
  renderWithToasts(<EditorHost port={{ ...rig.port, records }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
  return { rig, id: opened.id, records };
}
const draftOf = (rig: EditorRig, id: string): Reaction & Record<string, unknown> => rig.drafts.entry(id)?.session.draft as never;
const generic = (rig: EditorRig): Reaction => rig.store.getState().records.reaction[GENERIC as never] as Reaction;

describe('slots in a specific reaction started from a generic one', () => {
  it('the class participant is a slot "Choose a species of <class>"; species and reagent participants are not', () => {
    const { rig, id, records } = show();
    const g = generic(rig);
    const classParticipant = g.participants.findIndex((p) => p.ref.kind === 'class');
    const className = records.describe('class', g.participants[classParticipant]?.ref.id as string)?.name as string;
    const rows = screen.getAllByTestId('participant-row');
    expect(rows).toHaveLength(g.participants.length);
    const slots = rows.filter((row) => within(row).queryByText(`Choose a species of ${className}`) !== null);
    expect(slots).toHaveLength(g.participants.filter((p) => p.ref.kind === 'class').length);
    expect(rows[classParticipant]?.textContent).toContain(`Choose a species of ${className}`);
    expect(draftOf(rig, id).participants[classParticipant]).toHaveProperty(SLOT_KEY);
  });

  it('L1 refuses the draft while a slot is empty, with the schema\'s own words about the marker', () => {
    const { rig, id } = show();
    const draft = draftOf(rig, id);
    const parsed = parseRecord('reaction', { ...draft, name: 'Propan-1-ol + PCC' });
    expect(parsed.ok).toBe(false);
    expect(JSON.stringify(parsed)).toContain(SLOT_KEY);
  });

  it('members of the class come first, the others stay choosable under "Other species"; choosing fills the slot and removes the marker', async () => {
    const { rig, id, records } = show();
    const g = generic(rig);
    const at = g.participants.findIndex((p) => p.ref.kind === 'class');
    const classId = g.participants[at]?.ref.id as string;
    const className = records.describe('class', classId)?.name as string;
    const species = Object.values(rig.store.getState().records.species) as Species[];
    const member = species.find((s) => s.classIds.includes(classId as never)) as Species;
    const other = species.find((s) => !s.classIds.includes(classId as never)) as Species;
    const row = screen.getAllByTestId('participant-row')[at] as HTMLElement;
    const search = within(row).getByLabelText(`Find a species of ${className}`);
    fireEvent.change(search, { target: { value: ' ' } });
    fireEvent.change(search, { target: { value: member.names.canonical.slice(0, 3) } });
    const first = await within(row).findByRole('list', { name: `Species of ${className}` });
    expect(within(first).getByText(new RegExp(member.names.canonical))).toBeTruthy();
    fireEvent.change(search, { target: { value: other.names.canonical.slice(0, 3) } });
    await waitFor(() => expect(within(row).getByRole('list', { name: 'Other species' }).textContent).toContain(other.names.canonical));
    fireEvent.change(search, { target: { value: member.names.canonical } });
    const list = await within(row).findByRole('list', { name: `Species of ${className}` });
    fireEvent.click(await waitFor(() => within(list).getByRole('button', { name: `Add ${member.names.canonical}` })));
    const filled = draftOf(rig, id).participants[at] as unknown as Record<string, unknown>;
    expect(filled.ref).toEqual({ kind: 'species', id: member.id });
    expect(filled).not.toHaveProperty(SLOT_KEY);
    expect(screen.queryByText(`Choose a species of ${className}`)).toBeNull();
  });

  it('a class product is a slot too, and an outcome\'s selectivity and the product roles are copied as they are', () => {
    const { rig, id, records } = show();
    const g = generic(rig);
    const product = g.outcomes[0]?.products.find((p) => p.ref.kind === 'class') as Reaction['outcomes'][number]['products'][number];
    const className = records.describe('class', product.ref.id)?.name as string;
    const copy = draftOf(rig, id).outcomes[0] as unknown as { selectivity: string; products: Record<string, unknown>[] };
    expect(copy.selectivity).toBe(g.outcomes[0]?.selectivity);
    expect(copy.products.map((p) => p.role)).toEqual(g.outcomes[0]?.products.map((p) => p.role));
    expect(copy.products.some((p) => p[SLOT_KEY] === product.ref.id)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Edit outcome 1' }));
    expect(screen.getAllByText(`Choose a species of ${className}`).length).toBeGreaterThan(0);
  });
});
