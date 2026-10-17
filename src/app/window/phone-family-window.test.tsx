// @vitest-environment jsdom
/**
 * The family page on a phone (ADR-039, phone mode B part 2) through the real window: a back button that says where the visitor came from
 * and no "Selected:" line, a reaction drawn top to bottom (reactants, a downward arrow, products), the "Also gives →" button, the groups'
 * coloured bar; and the toasts of an action in the folded notices line, never floating.
 * The desktop family page is covered by navigator-family.test.tsx, unchanged except the arrow character.
 */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PHONE_QUERIES } from '@/ui/hooks';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';

const isScroller = (el: Element): boolean => el.hasAttribute('data-virtual-list');
beforeAll(() => {
  stubDialog();
  fakeLayout();
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => undefined;
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return isScroller(this) ? 20_000 : 40; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 390 });
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const height = isScroller(this) ? 20_000 : 40;
    return { x: 0, y: 0, top: 0, left: 0, right: 390, bottom: height, width: 390, height, toJSON: () => ({}) };
  };
});
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openFamily(hubId: string, tab: 'families' | 'map' = 'families'): Promise<FakeApp> {
  const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
  app.navigator.ui.overview.getState().setPhoneTab(tab);
  app.navigator.ui.family.getState().openFamily(hubId);
  renderWithApp(app);
  await screen.findByRole('region', { name: /^Family page/ });
  act(() => app.navigator.timers.advance(0));
  await screen.findByRole('heading', { level: 2, name: /^Reactions of / });
  return app;
}
const toolbar = (): HTMLElement => screen.getByRole('toolbar', { name: 'Family page tools' });
const cardNamed = (name: string): HTMLElement => screen.getAllByRole('article').find((el) => el.querySelector('h4')?.textContent === name) as HTMLElement;

describe('the family page on a phone', () => {
  it('has a back button "< Families" when the visitor came from Families, "< Map" from the Map; no "Overview" and no "Selected:" line', async () => {
    await openFamily('cls_alcohols');
    expect(within(toolbar()).getByRole('button', { name: '< Families' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Overview' })).toBeNull();
    expect(screen.queryByText(/^Selected: reaction /)).toBeNull();
    expect(screen.queryByText('Nothing is selected.')).toBeNull();
    cleanup();
    await openFamily('cls_alcohols', 'map');
    expect(within(toolbar()).getByRole('button', { name: '< Map' })).toBeTruthy();
  });

  it('the back button closes the page', async () => {
    const app = await openFamily('cls_alcohols');
    fireEvent.click(within(toolbar()).getByRole('button', { name: '< Families' }));
    expect(app.navigator.ui.family.getState().open).toBeNull();
  });

  it('draws a reaction top to bottom: reactants, then a downward arrow of about 48 px with the reagents and conditions, then the products', async () => {
    await openFamily('cls_alcohols');
    const pcc = cardNamed('Ethanol → ethanal (PCC)');
    const scheme = within(pcc).getAllByRole('group')[0] as HTMLElement;
    const [reactants, arrow, products] = [...scheme.children] as HTMLElement[];
    expect(reactants?.querySelector('figure')).not.toBeNull();
    expect(arrow?.matches('[data-arrow][data-direction="down"]')).toBe(true);
    // centred: a spacer, then the arrow, then the text to its right (the middle one of three columns); the text is not inside the arrow
    const [spacer, shaft, text] = [...(arrow?.children ?? [])] as HTMLElement[];
    expect(spacer?.textContent).toBe('');
    expect(shaft?.matches('[data-arrow-line]')).toBe(true);
    expect(shaft?.textContent).toBe('');
    expect(text?.matches('[data-arrow-text]')).toBe(true);
    expect(text?.textContent).toContain('PCC');
    expect(arrow?.children.length).toBe(3);
    expect(products?.querySelector('figure')).not.toBeNull();
    // the structure boxes are sized by the CSS on a phone, not by fixed pixels
    expect(reactants?.querySelector<HTMLElement>('figure > div')?.getAttribute('style')).toBeNull();
  });

  it('the phone card writes the outcome selectivity once: "(both exclusive)" after the last of two main products', async () => {
    await openFamily('cls_aldehydes');
    const card = screen.getAllByRole('article').find((el) => el.querySelector('h4')?.textContent?.includes('Cannizzaro')) as HTMLElement;
    const details = within(card).getByText('Show full equation').closest('details') as HTMLDetailsElement;
    act(() => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    const scheme = within(card).getByRole('group', { name: 'Full equation' });
    const line = document.getElementById(scheme.getAttribute('aria-describedby') as string)?.textContent ?? '';
    expect(line).toContain('Benzyl alcohol + Sodium benzoate (both exclusive)');
    expect(line).not.toContain('Benzyl alcohol (exclusive)');
    expect([...card.querySelectorAll('[data-equation-word]')].map((el) => el.textContent)).toEqual(['(both exclusive)']); // once
  });

  it('"Also gives →" is a button with the arrow character, never "->"', async () => {
    await openFamily('cls_alcohols');
    const both = screen.getAllByRole('article').filter((el) => el.querySelector('h4')?.textContent === 'Ethanol + conc. H₂SO₄');
    expect(within(both[0] as HTMLElement).getByRole('button', { name: /^Also gives → / })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /->/ })).toBeNull();
  });

  it("a group and its cards carry the bar (data-bar), with the partner family's tone", async () => {
    await openFamily('cls_alcohols');
    const bars = [...document.querySelectorAll('[data-bar]')];
    expect(bars.length).toBeGreaterThan(2);
    expect(bars.some((el) => el.hasAttribute('data-tone'))).toBe(true);
    expect(within(bars[0] as HTMLElement).getByRole('heading', { level: 3 })).toBeTruthy();
  });

  it('the page says data-layout phone', async () => {
    await openFamily('cls_alcohols');
    expect(screen.getByRole('region', { name: /^Family page/ }).getAttribute('data-layout')).toBe('phone');
    // it asks the shell to let its scroll area run behind the sheet (the CSS needs this mark)
    expect(screen.getByRole('region', { name: /^Family page/ }).hasAttribute('data-sheet-room')).toBe(true);
  });
});

describe('toasts on a phone', () => {
  it('the result of an action joins the folded notices line and is announced; nothing floats over the cards', async () => {
    const app = fakeApp({ state: demoState(), status: { mode: 'read_only', reason: 'another version is open' } });
    renderWithApp(app);
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer?: unknown };
    drop.dataTransfer = { types: ['Files'], files: [new File(['{}'], 'dropped.orn.json')] };
    act(() => void document.dispatchEvent(drop));
    const live = await screen.findByRole('status', { name: 'Notifications' });
    expect(live.textContent).toContain('The dropped file dropped.orn.json was not opened');
    expect(within(live).queryByRole('button')).toBeNull();
    const fold = screen.getByRole('button', { name: /notices?$/ });
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(fold);
    expect(screen.getAllByText(/The dropped file dropped\.orn\.json was not opened/).length).toBeGreaterThan(1);
    expect(screen.getAllByRole('button', { name: 'Dismiss' }).length).toBeGreaterThan(0);
  });
});
