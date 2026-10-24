// @vitest-environment jsdom
/**
 * Duplicate a reaction and start a specific reaction from a generic one, through the real window (step 6.7a, decisions C2 and C3): the
 * inspector's buttons ask once with a one-line notice, open a NEW reaction draft (nothing is saved yet); Save adds the record and the
 * original stays.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { produce } from 'immer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Reaction, Species } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';

const E2 = 'rxn_r-2-bromobutane-alc-koh';
const GENERIC = 'rxn_alcohol1-to-aldehyde-pcc';

beforeAll(async () => {
  await import('@/features/workbench/layer');
  await import('./editor-session');
  stubDialog();
  fakeLayout();
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  const proto = Element.prototype as unknown as { scrollIntoView?: () => void; hasPointerCapture?: () => boolean; releasePointerCapture?: () => void };
  proto.scrollIntoView ??= () => undefined;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const reactions = (app: FakeApp): Reaction[] => Object.values(app.store.getState().records.reaction) as Reaction[];
/** The fake window's search is not ready; the pickers need names found, so it looks them up in the store. */
function searchByName(app: FakeApp): void {
  const services = app.value.services as unknown as { search: { search: unknown } };
  services.search.search = async (_channel: string, request: { text: string; kinds: readonly string[] }) => ({
    ok: true,
    value: request.kinds.flatMap((kind) =>
      Object.values((app.store.getState().records as unknown as Record<string, Record<string, { id: string; names?: { canonical: string }; name?: string }>>)[kind] ?? {})
        .filter((r) => (r.names?.canonical ?? r.name ?? '').toLowerCase().includes(request.text.toLowerCase()))
        .map((r) => ({ ref: { kind, id: r.id } })),
    ),
  });
}
async function inspect(app: FakeApp, id: string): Promise<HTMLElement> {
  searchByName(app);
  app.panels.getState().setInspectorOpen(true);
  renderWithApp(app);
  act(() => app.inspectorStore.getState().open({ kind: 'reaction', id }));
  return screen.findByRole('complementary', { name: 'Inspector' });
}

describe('Duplicate (C2)', () => {
  it('asks once with a one-line notice, opens a NEW draft named "<name> (copy)", and Save adds the copy next to the original', async () => {
    const app = fakeApp({ state: demoState() });
    const source = app.store.getState().records.reaction[E2 as never] as Reaction;
    const before = reactions(app).length;
    const inspector = await inspect(app, E2);
    fireEvent.click(await within(inspector).findByRole('button', { name: 'Duplicate' }));
    const ask = await screen.findByRole('dialog', { name: 'Duplicate reaction' });
    expect(within(ask).getByText(/Relationships, topic mappings, exam relevance and caveats that point at the original are not copied/)).toBeTruthy();
    expect(reactions(app)).toHaveLength(before); // nothing is saved by asking
    fireEvent.click(within(ask).getByRole('button', { name: 'Start the copy' }));
    const dialog = await screen.findByRole('dialog', { name: 'New reaction' });
    expect((within(dialog).getByLabelText('Name (required)') as HTMLInputElement).value).toBe(`${source.name} (copy)`);
    expect(reactions(app)).toHaveLength(before); // a draft, not a record
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New reaction' })).toBeNull());
    expect(reactions(app)).toHaveLength(before + 1);
    const copy = reactions(app).find((r) => r.name === `${source.name} (copy)`) as Reaction;
    expect(copy.id).not.toBe(source.id);
    expect(copy.provenance.origin).toBe('user');
    expect(copy.review).toMatchObject({ lifecycle: 'draft', status: 'unreviewed' });
    const old = new Set([...source.participants.map((p) => p.id), ...source.outcomes.map((o) => o.id)]);
    for (const id of [...copy.participants.map((p) => p.id), ...copy.outcomes.map((o) => o.id)]) expect(old.has(id)).toBe(false);
    expect(copy.participants.map((p) => p.ref)).toEqual(source.participants.map((p) => p.ref));
    expect((app.store.getState().records.reaction[E2 as never] as Reaction).name).toBe(source.name);
  });
});

describe('New specific reaction from a generic one (C3)', () => {
  it('is offered only for a generic reaction', async () => {
    const app = fakeApp({ state: demoState() });
    const inspector = await inspect(app, E2);
    await within(inspector).findByRole('button', { name: 'Duplicate' });
    expect(within(inspector).queryByRole('button', { name: 'New specific reaction from this one' })).toBeNull();
  });

  it('opens a draft with a slot for each class; L1 refuses Save while one is empty; with a member species in each and a name it saves as an instance', async () => {
    const app = fakeApp({ state: demoState() });
    const generic = app.store.getState().records.reaction[GENERIC as never] as Reaction;
    const species = Object.values(app.store.getState().records.species) as Species[];
    const inspector = await inspect(app, GENERIC);
    fireEvent.click(await within(inspector).findByRole('button', { name: 'New specific reaction from this one' }));
    const ask = await screen.findByRole('dialog', { name: 'New specific reaction' });
    fireEvent.click(within(ask).getByRole('button', { name: 'Start the specific reaction' }));
    const dialog = await screen.findByRole('dialog', { name: 'New reaction' });
    expect((within(dialog).getByLabelText('Name (required)') as HTMLInputElement).value).toBe('');
    expect(dialog.textContent).toContain('Choose a species of');
    const before = reactions(app).length;
    fireEvent.change(within(dialog).getByLabelText('Name (required)'), { target: { value: 'Propan-1-ol + PCC (specific)' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await within(dialog).findByRole('heading', { name: 'Save was refused' });
    expect(reactions(app)).toHaveLength(before);
    // fill every slot with a member of its class (the product slot is inside the outcome, which opens with Edit)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit outcome 1' }));
    for (let guard = 0; guard < 6; guard += 1) {
      const slot = dialog.querySelector('[data-slot]') as HTMLElement | null;
      if (slot === null) break;
      const input = slot.querySelector('input[type="search"]') as HTMLInputElement;
      const className = (input.labels?.[0]?.textContent ?? '').replace('Find a species of ', '');
      const classId = [...generic.participants.map((p) => p.ref), ...generic.outcomes.flatMap((o) => o.products.map((p) => p.ref))].find((r) => r.kind === 'class' && (app.store.getState().records.class[r.id as never] as { names: { canonical: string } }).names.canonical === className)?.id as string;
      const member = species.find((s) => s.classIds.includes(classId as never)) as Species;
      fireEvent.change(input, { target: { value: member.names.canonical } });
      fireEvent.click(await within(slot).findByRole('button', { name: `Add ${member.names.canonical}` }));
    }
    expect(dialog.querySelector('[data-slot]')).toBeNull();
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New reaction' })).toBeNull());
    expect(reactions(app)).toHaveLength(before + 1);
    const made = reactions(app).find((r) => r.name === 'Propan-1-ol + PCC (specific)') as Reaction;
    expect(made).toMatchObject({ scope: 'specific', instanceOfId: GENERIC });
    expect(made.participants.every((p) => p.ref.kind !== 'class')).toBe(true);
    expect(JSON.stringify(made)).not.toContain('slotOfClassId');
  });
});

describe('from the reaction editor toolbar', () => {
  it('a saved reaction editor offers Duplicate (and, if generic, the specific one); a NEW reaction editor offers neither', async () => {
    const app = fakeApp({ state: demoState() });
    const inspector = await inspect(app, GENERIC);
    fireEvent.click(await within(inspector).findByRole('button', { name: 'Edit' }));
    const editor = await screen.findByRole('dialog', { name: /^Edit / });
    const toolbar = within(editor).getByRole('toolbar', { name: 'Draft history' });
    expect(within(toolbar).getByRole('button', { name: 'New specific reaction from this one' })).toBeTruthy();
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Duplicate' }));
    const ask = await screen.findByRole('dialog', { name: 'Duplicate reaction' });
    fireEvent.click(within(ask).getByRole('button', { name: 'Start the copy' }));
    const copy = await screen.findByRole('dialog', { name: 'New reaction' });
    expect((within(copy).getByLabelText('Name (required)') as HTMLInputElement).value).toContain('(copy)');
    expect(within(within(copy).getByRole('toolbar', { name: 'Draft history' })).queryByRole('button', { name: 'Duplicate' })).toBeNull();
  });
});

describe('step 6.7b part A (T1, T2, T3)', () => {
  it('T1: an empty slot shows "Choose a species of <class> (participant n)" in the findings, never the schema text; the participant line reads "n. Choose a species of <class> · <role>"', async () => {
    const app = fakeApp({ state: demoState() });
    const inspector = await inspect(app, GENERIC);
    fireEvent.click(await within(inspector).findByRole('button', { name: 'New specific reaction from this one' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'New specific reaction' })).getByRole('button', { name: 'Start the specific reaction' }));
    const dialog = await screen.findByRole('dialog', { name: 'New reaction' });
    const panel = await within(dialog).findByRole('region', { name: 'Findings' });
    await waitFor(() => expect(panel.textContent).toMatch(/Choose a species of .+ \(participant \d+\)/));
    expect(panel.textContent).not.toContain('Unknown field');
    expect(panel.textContent).not.toContain('slotOfClassId');
    expect(within(panel).getAllByText(/Choose a species of/).length).toBeGreaterThan(0);
    const line = within(dialog).getAllByTestId('participant-row').find((row) => /^\d+\. Choose a species of /.test(row.querySelector('[data-summary-text]')?.textContent ?? ''));
    expect(line).toBeTruthy();
    expect(line?.querySelector('[data-summary-text]')?.textContent).toMatch(/^\d+\. Choose a species of .+ · /);
  });

  it('T2: the specific notice names what is not copied', async () => {
    const app = fakeApp({ state: demoState() });
    const inspector = await inspect(app, GENERIC);
    fireEvent.click(await within(inspector).findByRole('button', { name: 'New specific reaction from this one' }));
    const ask = await screen.findByRole('dialog', { name: 'New specific reaction' });
    expect(within(ask).getByText(/Notes, study notes, tags, citations and intermediates are not copied/)).toBeTruthy();
  });

  it('T3: Duplicate from an editor with unsaved changes says it duplicates the saved version', async () => {
    const app = fakeApp({ state: demoState() });
    const inspector = await inspect(app, E2);
    fireEvent.click(await within(inspector).findByRole('button', { name: 'Edit' }));
    const editor = await screen.findByRole('dialog', { name: /^Edit / });
    const toolbar = within(editor).getByRole('toolbar', { name: 'Draft history' });
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Duplicate' }));
    let ask = await screen.findByRole('dialog', { name: 'Duplicate reaction' });
    expect(within(ask).queryByText(/Duplicates the saved version/)).toBeNull();
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    fireEvent.change(within(editor).getByLabelText('Name (required)'), { target: { value: 'Changed name' } });
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Duplicate' }));
    ask = await screen.findByRole('dialog', { name: 'Duplicate reaction' });
    expect(within(ask).getByText('Duplicates the saved version; your unsaved changes stay in this draft.')).toBeTruthy();
  });
});

describe('Duplicate and pictures (step 7.1a, ADR-038 addendum Q6)', () => {
  const withPicture = () =>
    produce(demoState(), (draft) => {
      const record = {
        id: 'ast_dup1',
        kind: 'asset',
        mediaType: 'image/png',
        byteSize: 12,
        sha256: 'a'.repeat(64),
        altText: 'A picture',
        assetRole: 'reaction_image',
        attachedTo: [{ ref: { kind: 'reaction', id: E2 } }],
        tags: [],
        citations: [],
        provenance: { origin: 'user', createdAt: '2026-10-24T10:00:00.000Z', updatedAt: '2026-10-24T10:00:00.000Z' },
        review: { lifecycle: 'draft', status: 'unreviewed', reasons: [] },
      };
      (draft.records.asset as Record<string, unknown>)[record.id] = record;
    });
  const PICTURES_NOT_COPIED = 'Pictures are not copied: add them to the new record after saving.';

  it('says pictures are not copied when the reaction has some, and the copy has none', async () => {
    const app = fakeApp({ state: withPicture() });
    const inspector = await inspect(app, E2);
    fireEvent.click(await within(inspector).findByRole('button', { name: 'Duplicate' }));
    const ask = await screen.findByRole('dialog', { name: 'Duplicate reaction' });
    expect(within(ask).getByText(PICTURES_NOT_COPIED)).toBeTruthy();
    fireEvent.click(within(ask).getByRole('button', { name: 'Start the copy' }));
    const dialog = await screen.findByRole('dialog', { name: 'New reaction' });
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New reaction' })).toBeNull());
    const copy = reactions(app).find((r) => r.name.endsWith('(copy)')) as Reaction;
    const attached = (Object.values(app.store.getState().records.asset) as { attachedTo: { ref: { id: string } }[] }[]).filter((a) => a.attachedTo.some((one) => one.ref.id === copy.id));
    expect(attached).toEqual([]);
  });

  it('says nothing about pictures when the reaction has none', async () => {
    const app = fakeApp({ state: demoState() });
    const inspector = await inspect(app, E2);
    fireEvent.click(await within(inspector).findByRole('button', { name: 'Duplicate' }));
    const ask = await screen.findByRole('dialog', { name: 'Duplicate reaction' });
    expect(within(ask).queryByText(PICTURES_NOT_COPIED)).toBeNull();
  });
});
