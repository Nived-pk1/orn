// @vitest-environment jsdom
/**
 * Outcome groups on the family card (outcome groups step, part 2), desktop and phone: the E2 reaction is ONE scheme (the reactant and the
 * arrow once, two product tiles with their words), a card with several groups has a bordered block per group headed by its conditions in
 * words, a one-outcome card is as before, and the open full equation is a panel with the group's sentence.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { familyStudy, type FamilyCard, type FamilyStudy } from '@/core/graph';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { LayoutMode } from '@/ui/hooks';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';
import { withRecords } from '@/test-support/search-state';
import type { AnyRecord } from '@/core/schema';
import { manualTimers } from '@/test-support/navigator-kit';
import { FamilyEnvContext, type FamilyEnv } from './family-env';
import { FamilyCardView } from './family-card';

afterEach(cleanup);

function envOf(state: CanonicalState, layout: LayoutMode): FamilyEnv {
  const timers = manualTimers();
  return {
    describe: (ref: RecordRef) => {
      const record = (state.records as unknown as Record<string, Record<string, { name?: string; names?: { canonical: string } } | undefined>>)[ref.kind]?.[ref.id];
      const name = record?.names?.canonical ?? record?.name;
      return name === undefined ? undefined : { name };
    },
    keyOf: () => undefined,
    manager: undefined,
    timers,
    layout,
  };
}

function renderCard(card: FamilyCard, state: CanonicalState, layout: LayoutMode = 'desktop'): HTMLElement {
  render(
    <FamilyEnvContext.Provider value={envOf(state, layout)}>
      <FamilyCardView card={card} selected={false} onSelect={() => undefined} onGoToGroup={() => undefined} />
    </FamilyEnvContext.Provider>,
  );
  return screen.getByRole('article');
}

const demo = demoState();
const demoCard = (hub: string, name: string): FamilyCard => {
  const study = familyStudy(contextOf(demo), hub) as FamilyStudy;
  const found = [...study.reactionsOf.groups, ...study.preparationOf.groups].flatMap((g) => g.cards).find((c) => c.name.includes(name));
  if (found === undefined) throw new Error(`no card ${name}`);
  return found;
};
const demoCard2 = (state: CanonicalState): FamilyCard => {
  const study = familyStudy(contextOf(state), 'cls_alcohols') as FamilyStudy;
  const found = study.reactionsOf.groups.flatMap((g) => g.cards).find((c) => c.name.includes('conc. H'));
  if (found === undefined) throw new Error('no ethanol card');
  return found;
};
const captionsOf = (root: HTMLElement): string[] => [...root.querySelectorAll('figure figcaption')].map((el) => el.textContent ?? '');
const open = (root: HTMLElement): void => {
  const details = within(root).getByText('Show full equation').closest('details') as HTMLDetailsElement;
  act(() => {
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
  });
};

describe.each<LayoutMode>(['desktop', 'phone'])('the E2 reaction (two outcomes, one group) on the %s card', (layout) => {
  const card = demoCard('cls_haloalkanes', 'alc. KOH');

  it('draws the reactant ONCE, one arrow, and one tile for each product with its word under it', () => {
    const article = renderCard(card, demo, layout);
    expect(article.querySelectorAll('[data-substance-id="spc_r-2-bromobutane"]')).toHaveLength(1);
    expect(article.querySelectorAll('[data-arrow]')).toHaveLength(1);
    expect(article.querySelectorAll('[data-arrow][data-direction="down"]')).toHaveLength(layout === 'phone' ? 1 : 0);
    expect([...article.querySelectorAll('[data-outcome-id]')].map((el) => el.getAttribute('data-substance-id') ?? el.querySelector('figure')?.getAttribute('data-substance-id'))).toEqual(['spc_but-2-ene', 'spc_but-1-ene']);
    expect(captionsOf(article)).toEqual(['(R)-2-Bromobutane', 'But-2-enemajor · Saytzeff', 'But-1-eneminor · Hofmann']);
    expect(article.querySelectorAll('section[aria-label]')).toHaveLength(0);
  });

  it('has ONE "Show full equation", and opening it gives a panel with both products, their words and the group\'s sentence', () => {
    const article = renderCard(card, demo, layout);
    expect(within(article).getAllByText('Show full equation')).toHaveLength(1);
    open(article);
    const panel = article.querySelector('details[data-equation-panel]') as HTMLElement;
    expect(panel.hasAttribute('open')).toBe(true);
    const scheme = within(panel).getByRole('group', { name: 'Full equation' });
    expect(within(scheme).getAllByRole('group').map((el) => el.getAttribute('aria-label'))).toEqual(expect.arrayContaining(['But-2-ene', 'But-1-ene']));
    expect([...panel.querySelectorAll('[data-equation-word]')].map((el) => el.textContent)).toEqual(['(major · Saytzeff)', '(minor · Hofmann)']);
    expect(document.getElementById(scheme.getAttribute('aria-describedby') as string)?.textContent).toBe(
      '(R)-2-bromobutane with alc. KOH, heat, basic medium gives But-2-ene (major) and But-1-ene (minor)',
    );
  });
});

describe('a card with two groups of outcomes', () => {
  // EtOH + conc. H2SO4 with BOTH outcomes giving a product of one family (the demo's second gives ethene, an alkene): two temperatures, one card
  const sameFamily = (() => {
    const original = demo.records.reaction['rxn_ethanol-conc-h2so4' as keyof typeof demo.records.reaction] as unknown as { outcomes: { id: string; products: { role: string; ref: RecordRef }[] }[] };
    const ether = original.outcomes[0]?.products[0]?.ref as RecordRef;
    const next = { ...original, outcomes: original.outcomes.map((o, i) => (i === 0 ? o : { ...o, products: o.products.map((p) => (p.role === 'main' ? { ...p, ref: ether } : p)) })) };
    return withRecords(demo, [next as unknown as AnyRecord]);
  })();
  const temperatures = demoCard2(sameFamily);

  it.each<LayoutMode>(['desktop', 'phone'])('shows each group in its own bordered block headed by its conditions, with its own scheme and equation (%s)', (layout) => {
    const article = renderCard(temperatures, sameFamily, layout);
    const blocks = [...article.querySelectorAll('section[data-outcome-group]')] as HTMLElement[];
    expect(blocks.map((b) => b.getAttribute('aria-label'))).toEqual(['At 413 K', 'At 443 K']);
    expect(blocks.map((b) => b.querySelector('h5')?.textContent)).toEqual(['At 413 K', 'At 443 K']);
    for (const block of blocks) {
      expect(block.querySelectorAll('[data-substance-id="spc_ethanol"]')).toHaveLength(1);
      expect(within(block).getAllByText('Show full equation')).toHaveLength(1);
      expect(block.querySelectorAll('[data-outcome-id]')).toHaveLength(1);
    }
    expect(blocks.map((b) => b.querySelector('[data-arrow]')?.textContent)).toEqual([expect.stringContaining('413 K'), expect.stringContaining('443 K')]);
    // the water both outcomes make is written once in each equation of its own group (they do not share a group)
    expect(article.querySelectorAll('details[data-equation-panel]')).toHaveLength(2);
  });

  it('the real aldol card: two blocks headed by the variant labels (its reaction has no stage, so its arrow states no condition)', () => {
    const aldol = demoCard('cls_aldehydes', 'Aldol');
    const article = renderCard(aldol, demo);
    expect([...article.querySelectorAll('section[data-outcome-group] h5')].map((h) => h.textContent)).toEqual(['Base-catalysed (dilute NaOH, cold)', 'Acid-catalysed']);
  });
});

describe('a card with one outcome', () => {
  const card = demoCard('cls_alcohols', 'Ethanol → ethanal (PCC)');

  it.each<LayoutMode>(['desktop', 'phone'])('is as before: no block, no heading, one scheme, one tile, one equation (%s)', (layout) => {
    const article = renderCard(card, demo, layout);
    expect(article.querySelectorAll('section[data-outcome-group], h5')).toHaveLength(0);
    expect(article.querySelectorAll('[data-outcome-id]')).toHaveLength(1);
    expect(article.querySelectorAll('[data-arrow]')).toHaveLength(1);
    expect(within(article).getAllByText('Show full equation')).toHaveLength(1);
    // the word is the selectivity word alone
    expect(captionsOf(article).slice(1)).toEqual([expect.stringMatching(/^Ethanal(exclusive|major)?$/)]);
  });

  it('an open equation is a panel; the one-outcome equation keeps its one-line description', () => {
    const article = renderCard(card, demo);
    open(article);
    const scheme = within(article).getByRole('group', { name: 'Full equation' });
    expect(article.querySelector('details[data-equation-panel]')).not.toBeNull();
    expect(document.getElementById(scheme.getAttribute('aria-describedby') as string)?.textContent).toContain(' → ');
  });
});
