// @vitest-environment jsdom
/**
 * The family page (step 5.5b; ADR-037) at component level, with roles and names (note E13): it opens from the overview, shows both
 * sections with headings, the partner strip, one card per reaction and group with its structures and arrow text, says in words when a
 * section is empty, links the cards of one reaction, selects a reaction on a click, and goes back to the overview as it was. jsdom has
 * no layout, so every virtual item measures 0 px and is rendered; the windowing itself is proved by the VirtualList tests and the e2e.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { tap } from '@/test-support/pointer-kit';
import { fakeApp, renderWithApp, type FakeApp } from '@/test-support/window-kit';

afterEach(cleanup);

// jsdom does no layout. The list's scroll area is made tall and every other element short, so the list renders every item of a page.
const isScroller = (el: Element): boolean => el.hasAttribute('data-virtual-list');
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return isScroller(this) ? 20_000 : 40; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 900 });
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const height = isScroller(this) ? 20_000 : 40;
    return { x: 0, y: 0, top: 0, left: 0, right: 900, bottom: height, width: 900, height, toJSON: () => ({}) };
  };
});

async function openFamily(hubId: string, app: FakeApp = fakeApp({ state: demoState(), navigator: { depictions: true } }), heading = true): Promise<FakeApp> {
  app.navigator.ui.family.getState().openFamily(hubId);
  renderWithApp(app);
  await screen.findByRole('region', { name: /^Family page/ });
  act(() => app.navigator.timers.advance(0));
  if (heading) await screen.findByRole('heading', { level: 2, name: /^Reactions of / });
  return app;
}

const card = (name: string, within_?: HTMLElement): HTMLElement =>
  (within_ === undefined ? screen : within(within_)).getAllByRole('article').find((el) => el.querySelector('h4')?.textContent === name) as HTMLElement;
const cardsNamed = (name: string): HTMLElement[] => screen.getAllByRole('article').filter((el) => el.querySelector('h4')?.textContent === name);

describe('the family page', () => {
  it('shows the header, the strip and both sections with their groups', async () => {
    await openFamily('cls_alcohols');
    expect(screen.getByRole('heading', { level: 1, name: /Alcohols/ }).textContent).toContain('R–OH');
    // one h1 per screen: the family name; the shell's title is a plain line here
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText(/13 reactions in all: 6 reactions of Alcohols and 7 reactions that make it/)).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Reaction types in this family' })).getByText(/Oxidation/)).toBeTruthy();
    expect(screen.getByText('Made from')).toBeTruthy();
    expect(screen.getByText('Turns into')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Aldehydes\s*3\s*reactions$/ })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Reactions of Alcohols' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Preparation of Alcohols' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'To Aldehydes' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'From Alkenes' })).toBeTruthy();
    // a list of listitems that say where they are
    expect(screen.getByRole('list', { name: 'Reactions of and preparation of Alcohols' })).toBeTruthy();
  });

  it('the header takes the tone of the family and writes its group; each partner button carries the tone of the PARTNER (step 5.5d, item e)', async () => {
    await openFamily('cls_alcohols');
    const header = screen.getByRole('heading', { level: 1 }).closest('[data-tone]') as HTMLElement;
    expect(header.getAttribute('data-tone')).toBe('green');
    expect(within(header).getByText('Oxygen compounds')).toBeTruthy();
    // Aldehydes and Ethers are Oxygen compounds too (green); Made-from Alkenes is a Hydrocarbon (blue): the button wears Alkenes' tone, not Alcohols'
    expect(within(header).getByRole('button', { name: /^Aldehydes\s*3\s*reactions$/ }).getAttribute('data-tone')).toBe('green');
    expect(within(header).getByRole('button', { name: /^Ethers/ }).getAttribute('data-tone')).toBe('green');
    for (const button of within(header).getAllByRole('button', { name: /^Alkenes/ })) expect(button.getAttribute('data-tone')).toBe('blue');
    for (const button of within(header).getAllByRole('button', { name: /^Haloalkanes/ })) expect(button.getAttribute('data-tone')).toBe('amber');
  });

  it('a family without an arrangement (Unclassified) has a plain header: no tone and no group line', async () => {
    await openFamily('virtual:unclassified:hub', undefined, false);
    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1.closest('[data-tone]')).toBeNull();
    expect(document.querySelector('div[data-tone]')).toBeNull(); // no tinted header; its partner buttons still wear their own families' tones
    expect(document.querySelector('button[data-tone]')).not.toBeNull();
  });

  it('says in words that a section is empty', async () => {
    await openFamily('cls_alkanes');
    expect(screen.getByText('No reactions start from Alkanes in this dataset.')).toBeTruthy();
    expect(screen.getByText('No reactions make Alkanes in this dataset.')).toBeTruthy();
    expect(screen.getByText('Nothing in this dataset makes it')).toBeTruthy();
  });

  it('a card is a textbook scheme: substrate, arrow text, products and the selectivity word', async () => {
    await openFamily('cls_alcohols');
    const pcc = card('Ethanol → ethanal (PCC)');
    expect(within(pcc).getByRole('group', { name: 'Ethanol to Ethanal, PCC; Dichloromethane, anhydrous' })).toBeTruthy();
    expect(within(pcc).getByText('PCC')).toBeTruthy();
    expect(within(pcc).getByText('Dichloromethane, anhydrous')).toBeTruthy();
    expect(pcc.querySelector('[data-arrow]')).not.toBeNull();
  });

  it('draws structures as images from blob URLs, two for the PCC card, and asks only for mounted cards', async () => {
    const app = await openFamily('cls_alcohols');
    const pcc = card('Ethanol → ethanal (PCC)');
    await waitFor(() => expect(within(pcc).getAllByRole('img')).toHaveLength(2));
    for (const image of within(pcc).getAllByRole('img')) expect(image.getAttribute('src')).toMatch(/^blob:/);
    expect(app.navigator.depictions?.asked.length).toBeGreaterThan(0);
  });

  it('a species without a drawable structure shows its name and formula, in the same box', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    app.navigator.depictions?.failing.add('never');
    await openFamily('cls_alcohols', app);
    const first = screen.getAllByRole('article')[0] as HTMLElement;
    expect(first.querySelector('figure')).not.toBeNull();
    for (const figure of first.querySelectorAll('figure')) {
      expect(figure.querySelector('figcaption')?.textContent).not.toBe('');
      expect(figure.querySelector('img, [title], span')).not.toBeNull();
    }
  });

  it('the 413 K and 443 K cards are on separate groups, each linking the other', async () => {
    await openFamily('cls_alcohols');
    const both = cardsNamed('Ethanol + conc. H₂SO₄');
    expect(both).toHaveLength(2);
    const ethers = both.find((el) => within(el).queryByText('413 K') !== null) as HTMLElement;
    const alkenes = both.find((el) => within(el).queryByText('443 K') !== null) as HTMLElement;
    expect(ethers).toBeDefined();
    expect(alkenes).toBeDefined();
    expect(within(ethers).queryByText('443 K')).toBeNull();
    expect(within(ethers).getByRole('button', { name: 'Also gives → Alkenes (443 K)' })).toBeTruthy();
    expect(within(alkenes).getByRole('button', { name: 'Also gives → Ethers (413 K)' })).toBeTruthy();
    expect(() => fireEvent.click(within(ethers).getByRole('button', { name: 'Also gives → Alkenes (443 K)' }))).not.toThrow();
  });

  it('the strip buttons and the links bring the reader to a group without leaving the page', async () => {
    const app = await openFamily('cls_alcohols');
    expect(() => fireEvent.click(screen.getByRole('button', { name: /^Aldehydes\s*3\s*reactions$/ }))).not.toThrow();
    expect(app.navigator.ui.family.getState().open).toBe('cls_alcohols');
  });

  it('a click on a card selects the reaction; the selection line names it', async () => {
    const app = await openFamily('cls_alcohols');
    expect(screen.getByText('Nothing is selected.')).toBeTruthy();
    const pcc = card('Ethanol → ethanal (PCC)');
    fireEvent.click(within(pcc).getByRole('button', { name: 'Ethanol → ethanal (PCC)' }));
    expect(screen.getByText('Selected: reaction Ethanol → ethanal (PCC).')).toBeTruthy();
    expect(within(card('Ethanol → ethanal (PCC)')).getByRole('button', { name: 'Ethanol → ethanal (PCC)' }).getAttribute('aria-pressed')).toBe('true');
    expect(app.navigator.ui.family.getState().reaction).not.toBeNull();
  });

  it('every card and button is reachable by Tab: cards hold only buttons, no tabindex tricks', async () => {
    await openFamily('cls_alcohols');
    const page = screen.getByRole('region', { name: /^Family page/ });
    expect(page.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])')).toHaveLength(0);
    expect(page.querySelectorAll('[tabindex="-1"]')).toHaveLength(0);
    for (const article of screen.getAllByRole('article')) expect(within(article).getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('Overview goes back to the map with its selection, and cancels what the cards asked for', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    renderWithApp(app);
    const aldehydes = await screen.findByRole('graphics-symbol', { name: /^Aldehydes, class hub/ });
    tap(aldehydes);
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Canvas tools' })).getByRole('button', { name: 'Open family' }));
    await screen.findByRole('region', { name: /^Family page/ });
    act(() => app.navigator.timers.advance(0));
    await screen.findByRole('heading', { level: 2, name: /^Reactions of / });
    await waitFor(() => expect(app.navigator.depictions?.asked.length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    expect(await screen.findByRole('group', { name: /^Navigator: \d+ hubs?/ })).toBeTruthy();
    expect(app.navigator.ui.family.getState().open).toBeNull();
    expect(app.navigator.ui.selection.getState().selected).toEqual({ kind: 'node', id: 'cls_aldehydes' });
    expect(app.navigator.depictions?.cancelled.length).toBeGreaterThan(0);
  });

  it('the family that is no longer in the dataset says so and goes back', async () => {
    const app = await openFamily('cls_nowhere', fakeApp({ state: demoState() }), false);
    expect(screen.getByRole('alert').textContent).toContain('not in the dataset any more');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the overview' }));
    expect(app.navigator.ui.family.getState().open).toBeNull();
  });
});

describe('the Structures control (equation step, part 4)', () => {
  it('is in the header, follows the saved setting, and choosing Condensed asks for every drawing again in that mode', async () => {
    const app = await openFamily('cls_alcohols');
    const group = screen.getByRole('radiogroup', { name: 'Structures' });
    expect(within(group).getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual(['Skeletal', 'Condensed', 'Full']);
    expect((within(group).getByRole('radio', { name: 'Skeletal' }) as HTMLInputElement).checked).toBe(true);
    const asked = app.navigator.depictions?.asked ?? [];
    await waitFor(() => expect(asked.length).toBeGreaterThan(0));
    expect(asked.every((key) => !key.includes('#'))).toBe(true); // skeletal keys carry no mode
    fireEvent.click(within(group).getByRole('radio', { name: 'Condensed' }));
    expect(app.panels.getState().structureMode).toBe('condensed');
    expect((within(group).getByRole('radio', { name: 'Condensed' }) as HTMLInputElement).checked).toBe(true);
    await waitFor(() => expect(asked.some((key) => key.endsWith('#condensed'))).toBe(true));
    fireEvent.click(within(group).getByRole('radio', { name: 'Full' }));
    await waitFor(() => expect(asked.some((key) => key.endsWith('#full'))).toBe(true));
    // the cards are still there and still drawn
    expect(screen.getAllByRole('img', { name: /^Structure of / }).length).toBeGreaterThan(0);
  });

  it('a setting saved as Full opens the family page in Full, and no skeletal drawing is asked for', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true }, panels: { stored: { structureMode: 'full' } } });
    await openFamily('cls_alcohols', app);
    const group = screen.getByRole('radiogroup', { name: 'Structures' });
    expect((within(group).getByRole('radio', { name: 'Full' }) as HTMLInputElement).checked).toBe(true);
    await waitFor(() => expect((app.navigator.depictions?.asked ?? []).length).toBeGreaterThan(0));
    expect((app.navigator.depictions?.asked ?? []).every((key) => key.endsWith('#full'))).toBe(true);
  });
});
