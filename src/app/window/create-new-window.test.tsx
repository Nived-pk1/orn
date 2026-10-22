// @vitest-environment jsdom
/**
 * Create new through the real window (step 6.7a, decision C1): in a new reaction draft, "Create new species" in the participants picker
 * opens a SECOND editor over the first with the typed text as its name; Save puts the species in the store and picks it into the parent
 * (one parent edit, one undo step); Close picks nothing and keeps both drafts, the parent listed first.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Reaction, Species } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';

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

const NAME = 'Zz propanal test';
const species = (app: FakeApp): Species[] => Object.values(app.store.getState().records.species) as Species[];
const reactionDraftId = (app: FakeApp): string => {
  const item = app.drafts.view().items.find((i) => !i.unreadable && i.kind === 'reaction');
  return item?.id as string;
};

async function openNewReaction(app: FakeApp): Promise<HTMLElement> {
  renderWithApp(app);
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Modes' })).getByRole('button', { name: /Workbench/ }));
  fireEvent.click(screen.getByRole('button', { name: 'New reaction' }));
  const dialog = await screen.findByRole('dialog', { name: 'New reaction' });
  fireEvent.change(within(dialog).getByLabelText('Name (required)'), { target: { value: 'Parent reaction' } });
  fireEvent.change(within(dialog).getByLabelText('Scope (required)'), { target: { value: 'specific' } });
  return dialog;
}
async function startCreating(dialog: HTMLElement): Promise<HTMLElement> {
  fireEvent.change(within(dialog).getByLabelText('Find a substance by name'), { target: { value: NAME } });
  fireEvent.click(await within(dialog).findByRole('button', { name: `Create new species "${NAME}"` }));
  const dialogs = await screen.findAllByRole('dialog', { name: 'New species' });
  return dialogs[dialogs.length - 1] as HTMLElement;
}

describe('Create new from a picker', () => {
  it('opens a nested editor named with the typed text; Save picks the new species into the parent as ONE edit', async () => {
    const app = fakeApp({ state: demoState() });
    const dialog = await openNewReaction(app);
    const before = species(app).length;
    const nested = await startCreating(dialog);
    expect((within(nested).getByLabelText('Canonical name (required)') as HTMLInputElement).value).toBe(NAME);
    const parentDialog = screen.getByRole('dialog', { name: 'New reaction', hidden: true });
    expect(parentDialog.hasAttribute('inert')).toBe(true); // the parent stays under it and cannot be reached
    const parentId = reactionDraftId(app);
    const stepsBefore = app.drafts.entry(parentId)?.session.past.length ?? 0;
    await act(async () => void fireEvent.click(within(nested).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(screen.queryAllByRole('dialog', { name: 'New species' })).toHaveLength(0));
    expect(species(app)).toHaveLength(before + 1);
    const made = species(app).find((s) => s.names.canonical === NAME) as Species;
    const parent = app.drafts.entry(parentId);
    const participants = (parent?.session.draft as Reaction).participants;
    expect(participants.map((p) => p.ref)).toEqual([{ kind: 'species', id: made.id }]);
    expect(parent?.session.past.length).toBe(stepsBefore + 1); // one parent edit, one undo step
  });

  it('Close picks nothing, leaves the parent draft as it was and keeps the nested draft once it was edited', async () => {
    const app = fakeApp({ state: demoState() });
    const dialog = await openNewReaction(app);
    const nested = await startCreating(dialog);
    fireEvent.change(within(nested).getByLabelText('Canonical name (required)'), { target: { value: `${NAME} edited` } });
    const parentId = reactionDraftId(app);
    const parentBefore = app.drafts.entry(parentId)?.session.draft;
    fireEvent.click(within(nested).getByRole('button', { name: 'Close (keeps the draft)' }));
    await waitFor(() => expect(screen.queryAllByRole('dialog', { name: 'New species' })).toHaveLength(0));
    expect(app.drafts.entry(parentId)?.session.draft).toBe(parentBefore);
    const kinds = app.drafts.view().items.map((i) => (i.unreadable ? 'unreadable' : i.kind));
    expect(kinds).toEqual(['reaction', 'species']); // both drafts are offered, the parent first
  });

  it('inside the nested editor a picker offers no Create new, only "Finish this one first"', async () => {
    const app = fakeApp({ state: demoState() });
    const dialog = await openNewReaction(app);
    const nested = await startCreating(dialog);
    fireEvent.change(within(nested).getByLabelText(/^Find a class by name/), { target: { value: 'zzz' } });
    expect(await within(nested).findByText('Finish this one first: one new record at a time')).toBeTruthy();
    expect(within(nested).queryByRole('button', { name: /^Create new/ })).toBeNull();
  });
});
