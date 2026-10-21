// @vitest-environment jsdom
/**
 * A demo reagent profile's temperature edited through the real window (step 6.6a part 4): Saved, shown by the inspector's reagent view
 * (which words the profile's conditions), Undo restores. NOTE (stated in PROGRESS): a reaction card's arrow text is built from the STAGES'
 * parameters only; no code derives anything from a reagent profile's parameters, so the card does not change.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Reagent } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog } from '@/test-support/window-kit';
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

const KMNO4 = 'rgt_potassium-permanganate';

describe('editing a reagent profile', () => {
  it('the temperature is changed, Saved, shown by the inspector; Undo restores it', async () => {
    const app = fakeApp({ state: demoState() });
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    act(() => app.inspectorStore.getState().open({ kind: 'reagent', id: KMNO4 }));
    const inspector = await screen.findByRole('complementary', { name: 'Inspector' });
    fireEvent.click(await within(inspector).findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: /^Edit / });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit conditions of profile 2' }));
    fireEvent.change(within(dialog).getByLabelText('Temperature value of profile 2'), { target: { value: '95' } });
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Edit / })).toBeNull());
    const saved = app.store.getState().records.reagent[KMNO4 as never] as Reagent;
    expect(saved.profiles[1]?.parameters.temperature).toEqual({ kind: 'value', value: 95, unit: 'C' });
    fireEvent.click(await within(screen.getByRole('complementary', { name: 'Inspector' })).findByRole('button', { name: /Level 3/ }));
    await waitFor(() => expect(screen.getByRole('complementary', { name: 'Inspector' }).textContent).toContain('95'));
    act(() => void app.store.undo());
    expect((app.store.getState().records.reagent[KMNO4 as never] as Reagent).profiles[1]?.parameters.temperature).toEqual({ kind: 'value', value: 80, unit: 'C' });
  });
});
