// @vitest-environment jsdom
/**
 * The reaction editor through the real window (step 6.3a part 3): the inspector's "Edit" opens it for a reaction, the coefficient of a
 * reactant is changed and saved, the family card's equation shows it, and Undo restores it. The family page is the real one over the demo.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Reaction } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';
import { prefetchPalette } from './lazy-palette';

const PCC = 'rxn_ethanol-to-ethanal-pcc';
const isScroller = (el: Element): boolean => el.hasAttribute('data-virtual-list');

beforeAll(async () => {
  await prefetchPalette();
  await import('@/features/workbench/layer');
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
  // the family page's list renders every item when the scroller is tall (jsdom does no layout)
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return isScroller(this) ? 20_000 : 40; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 900 });
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const height = isScroller(this) ? 20_000 : 40;
    return { x: 0, y: 0, top: 0, left: 0, right: 900, bottom: height, width: 900, height, toJSON: () => ({}) };
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pccReaction = (app: FakeApp): Reaction => app.store.getState().records.reaction[PCC as never] as Reaction;
const pccCard = (): HTMLElement => screen.getAllByRole('article').find((el) => el.querySelector('h4')?.textContent === 'Ethanol → ethanal (PCC)') as HTMLElement;

describe('the reaction editor through the real window', () => {
  it('Edit in the inspector opens it; a coefficient is saved, the full equation shows it, and Undo restores it', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    app.navigator.ui.family.getState().openFamily('cls_alcohols');
    app.panels.getState().setInspectorOpen(true);
    renderWithApp(app);
    await screen.findByRole('region', { name: /^Family page/ });
    act(() => app.navigator.timers.advance(0));
    await screen.findByRole('heading', { level: 2, name: /^Reactions of / });
    act(() => app.inspectorStore.getState().open({ kind: 'reaction', id: PCC }));
    fireEvent.click(await within(await screen.findByRole('complementary', { name: 'Inspector' })).findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: /^Edit / });
    const reactant = pccReaction(app).participants.findIndex((p) => p.role === 'reactant') + 1;
    fireEvent.click(within(dialog).getByRole('button', { name: `Edit participant ${reactant}` }));
    fireEvent.change(within(dialog).getByLabelText(`Coefficient of participant ${reactant}`), { target: { value: '2' } });
    // the live preview (step 6.3b) is in the editor, drawn from the draft with the card's equation component; it takes the edit after 400 ms
    const preview = within(dialog).getByRole('region', { name: 'Preview' });
    expect(within(preview).getByRole('group', { name: 'Full equation' })).toBeTruthy();
    await waitFor(() => {
      act(() => app.navigator.timers.advance(400));
      expect(preview.querySelector('[data-equation-coefficient]')?.textContent).toBe('2');
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Edit / })).toBeNull());
    expect(pccReaction(app).participants[reactant - 1]?.coefficient).toBe(2);
    expect(app.store.historyLabels().undo.at(-1)).toMatch(/^Edit reaction of /);

    // the card's "Show full equation" is drawn from the saved reaction and prints the coefficient
    fireEvent.click(within(pccCard()).getByText('Show full equation'));
    await waitFor(() => {
      act(() => app.navigator.timers.advance(10));
      expect(within(pccCard()).getByText('2', { selector: '[data-equation-coefficient]' })).toBeTruthy();
    });

    act(() => void app.store.undo());
    expect(pccReaction(app).participants[reactant - 1]?.coefficient).toBeUndefined();
    await waitFor(() => {
      act(() => app.navigator.timers.advance(10));
      expect(pccCard().querySelector('[data-equation-coefficient]')).toBeNull();
    });
  });
});
