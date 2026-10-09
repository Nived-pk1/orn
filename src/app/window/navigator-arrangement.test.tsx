// @vitest-environment jsdom
/**
 * The arranged overview at component level (step 5.5c; ADR-037): the legend lists each family group once with its swatch and name, from
 * the data; a hub's accessible name carries its group (colour is never the only carrier); a file with no arrangement has no legend and
 * the names are as before. The grid itself and the pixels are proved by the unit tests of `src/layout/grid` and the e2e.
 */
import { cleanup, screen, within } from '@testing-library/react';
import { produce } from 'immer';
import { afterEach, describe, expect, it } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeApp, renderWithApp } from '@/test-support/window-kit';

afterEach(cleanup);

const drawing = (): Promise<HTMLElement> => screen.findByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ });

describe('the legend', () => {
  it('lists each family group of the demo once, in the order the grid reads, with a swatch that carries the tone and no meaning of its own', async () => {
    renderWithApp(fakeApp({ state: demoState() }));
    await drawing();
    const legend = screen.getByRole('list', { name: 'Family groups' });
    const items = within(legend).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['Hydrocarbons', 'Halogen compounds', 'Oxygen compounds', 'Nitrogen compounds']);
    expect(items.map((li) => li.querySelector('[data-tone]')?.getAttribute('data-tone'))).toEqual(['blue', 'amber', 'green', 'violet']);
    for (const li of items) expect(li.querySelector('[data-tone]')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('is made from the data: a renamed group, or a tone changed, shows in the legend (nothing is hard-coded)', async () => {
    const state = produce(demoState(), (draft) => {
      for (const anchor of Object.values(draft.records.navigator_anchor)) {
        if (anchor.group === 'Hydrocarbons') {
          anchor.group = 'Carbon and hydrogen only';
          anchor.tone = 'rose';
        }
      }
    });
    renderWithApp(fakeApp({ state }));
    await drawing();
    const items = within(screen.getByRole('list', { name: 'Family groups' })).getAllByRole('listitem');
    expect(items[0]?.textContent).toBe('Carbon and hydrogen only');
    expect(items[0]?.querySelector('[data-tone]')?.getAttribute('data-tone')).toBe('rose');
    expect(items.map((li) => li.textContent)).not.toContain('Hydrocarbons');
  });

  it('a dataset whose anchors have no group has no legend at all', async () => {
    const state = produce(demoState(), (draft) => {
      for (const anchor of Object.values(draft.records.navigator_anchor)) {
        delete anchor.group;
        delete anchor.tone;
      }
    });
    renderWithApp(fakeApp({ state }));
    await drawing();
    expect(screen.queryByRole('list', { name: 'Family groups' })).toBeNull();
  });
});

describe('hubs on the arranged overview', () => {
  it('a hub\'s accessible name includes its group, and a hub without one keeps its old name', async () => {
    renderWithApp(fakeApp({ state: demoState() }));
    await drawing();
    expect(screen.getByRole('graphics-symbol', { name: /^Alcohols, class hub, Oxygen compounds, / })).toBeTruthy();
    expect(screen.getByRole('graphics-symbol', { name: /^Amines, class hub, Nitrogen compounds, / })).toBeTruthy();
    const unclassified = screen.getAllByRole('graphics-symbol').find((el) => el.getAttribute('data-box') === 'unclassified');
    expect(unclassified?.getAttribute('aria-label')).not.toContain('compounds');
  });

  it('every hub is drawn once on the arranged overview, 15 hubs and the Unclassified hub', async () => {
    renderWithApp(fakeApp({ state: demoState() }));
    const svg = await drawing();
    expect(svg.querySelectorAll('[data-box="hub"]')).toHaveLength(15);
    expect(svg.querySelectorAll('[data-box="unclassified"]')).toHaveLength(1);
    expect(svg.querySelectorAll('[data-box="hub"][data-glyph="class_hub"]')).toHaveLength(15);
  });
});
