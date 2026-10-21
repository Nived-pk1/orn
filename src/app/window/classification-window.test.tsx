// @vitest-environment jsdom
/**
 * Classification through the real window (step 6.6a part 3): a demo reaction is classified with a reaction type and a certainty (no default;
 * Save is refused until it is chosen), Saved, and the family page's reaction-type chips (core `familyStudy`) count it; Undo takes it away.
 * A species property is added with its source, Saved and shown by the inspector.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, type Mock } from 'vitest';
import type { CanonicalState, Concept, Reaction, Species } from '@/core/schema';
import { familyStudy } from '@/core/graph/family';
import { demoState } from '@/test-support/app-boot-kit';
import { concept } from '@/test-support/demo/kit';
import { contextOf } from '@/test-support/graph-state';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';
import { prefetchPalette } from './lazy-palette';

beforeAll(async () => {
  await prefetchPalette();
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
afterEach(cleanup);

const TYPE: Concept = concept('zz-new-type', 'Zz new type', 'reaction_type');
const stateWithType = (): CanonicalState => {
  const state = demoState();
  return { ...state, records: { ...state.records, concept: { ...state.records.concept, [TYPE.id]: TYPE } } } as CanonicalState;
};
function answerSearch(app: FakeApp): void {
  (app.value.services.search.search as unknown as Mock).mockImplementation(async (_channel: string, request: { text: string; kinds: readonly string[] }) => ({
    ok: true,
    value: request.kinds.flatMap((kind) =>
      Object.values((app.store.getState().records as unknown as Record<string, Record<string, { id: string; title?: string; name?: string; names?: { canonical: string } }>>)[kind] ?? {})
        .filter((r) => (r.title ?? r.name ?? r.names?.canonical ?? '').toLowerCase().includes(request.text.toLowerCase()))
        .map((r) => ({ ref: { kind, id: r.id } })),
    ),
  }));
}
const typeCount = (app: FakeApp): number => familyStudy(contextOf(app.store.getState()), 'cls_alcohols')?.reactionTypes.find((t) => t.conceptId === TYPE.id)?.count ?? 0;

describe('classifying a demo reaction', () => {
  it('certainty has no default and Save is refused until chosen; then the family page counts the type; Undo removes it', async () => {
    const app = fakeApp({ state: stateWithType() });
    answerSearch(app);
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    const study = familyStudy(contextOf(app.store.getState()), 'cls_alcohols');
    const reactionId = study?.reactionsOf.groups[0]?.cards[0]?.reactionId as string;
    const reaction = app.store.getState().records.reaction[reactionId as never] as Reaction;
    expect(typeCount(app)).toBe(0);
    act(() => app.inspectorStore.getState().open({ kind: 'reaction', id: reactionId }));
    const inspector = await screen.findByRole('complementary', { name: 'Inspector' });
    fireEvent.click(await within(inspector).findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: `Edit ${reaction.name}` });
    const toggle = within(dialog).getByRole('button', { name: /Classification/ });
    if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
    fireEvent.change(within(dialog).getByLabelText('Find a reaction type by name'), { target: { value: 'zz new' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Add Zz new type' }));
    expect((within(dialog).getByLabelText('Certainty of Zz new type') as HTMLSelectElement).value).toBe('');
    expect(within(dialog).getByText('Zz new type (certainty not chosen)')).toBeTruthy();
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    expect(await within(dialog).findByRole('heading', { name: 'Save was refused' })).toBeTruthy();
    expect(typeCount(app)).toBe(0);
    fireEvent.change(within(dialog).getByLabelText('Certainty of Zz new type'), { target: { value: 'probable' } });
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: /^Save/ })));
    await waitFor(() => expect(typeCount(app)).toBe(1));
    expect((app.store.getState().records.reaction[reactionId as never] as Reaction).reactionTypes.at(-1)).toEqual({ conceptId: TYPE.id, certainty: 'probable' });
    act(() => void app.store.undo());
    expect(typeCount(app)).toBe(0);
  });
});

describe('a species property', () => {
  it('added with a key, a value and a hint, Saved, shown by the inspector; Undo restores', async () => {
    const app = fakeApp({ state: demoState() });
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    const species = Object.values(app.store.getState().records.species).find((s) => (s as Species).properties.length === 0) as Species;
    act(() => app.inspectorStore.getState().open({ kind: 'species', id: species.id }));
    const inspector = await screen.findByRole('complementary', { name: 'Inspector' });
    fireEvent.click(await within(inspector).findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: `Edit ${species.names.canonical}` });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add property' }));
    expect((within(dialog).getByLabelText('Property') as HTMLSelectElement).value).toBe('');
    fireEvent.change(within(dialog).getByLabelText('Property'), { target: { value: 'boiling_point' } });
    expect(within(dialog).getByText('e.g. 78 °C (at 1 atm)')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Value'), { target: { value: '78.4 °C (at 1 atm)' } });
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Edit / })).toBeNull());
    expect((app.store.getState().records.species[species.id] as Species).properties).toEqual([{ key: 'boiling_point', value: '78.4 °C (at 1 atm)', citations: [] }]);
    act(() => void app.store.undo());
    expect((app.store.getState().records.species[species.id] as Species).properties).toEqual([]);
  });
});
