// @vitest-environment jsdom
/** "Show full equation" on a family card (step 5.9a review, follow-up b; phone mode B part 3): every reactant, a drawn arrow, every product with the card's word. */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { familyStudy, type FamilyCard, type FamilyStudy } from '@/core/graph';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';
import { FullEquationView } from './family-equation';

afterEach(cleanup);
const demo = contextOf(demoState());
const openDisclosure = (): void => {
  const details = screen.getByText('Show full equation').closest('details') as HTMLDetailsElement;
  act(() => {
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
  });
};
const cardNamed = (hub: string, name: string): FamilyCard => {
  const study = familyStudy(demo, hub) as FamilyStudy;
  const card = [...study.reactionsOf.groups, ...study.preparationOf.groups].flatMap((g) => g.cards).find((c) => c.name.includes(name));
  if (card === undefined) throw new Error(`no card ${name}`);
  return card;
};

describe('FullEquationView', () => {
  it('is closed by default and says what it opens; Cannizzaro shows 2 Benzaldehyde and both products with the word of the card', () => {
    const equation = cardNamed('cls_aldehydes', 'Cannizzaro').outcomes[0]?.equation;
    if (equation === undefined) throw new Error('the card carries no equation');
    render(<FullEquationView equation={equation} />);
    const disclosure = screen.getByText('Show full equation').closest('details');
    expect(disclosure?.open).toBe(false);
    expect(screen.queryByLabelText(/^Full equation:/)).toBeNull();
    openDisclosure();
    expect(screen.getByLabelText(/^Full equation:/).textContent).toContain('2 Benzaldehyde');
    expect(screen.getByLabelText(/^Full equation:/).textContent).toContain('Benzyl alcohol + Sodium benzoate (both exclusive)');
  });

  it('the 413 K reaction lists water without a word and keeps its temperature under the drawn arrow', () => {
    const study = familyStudy(demo, 'cls_alcohols') as FamilyStudy;
    const cards = study.reactionsOf.groups.flatMap((g) => g.cards).filter((c) => c.name.includes('Ethanol + conc.'));
    const equation = cards.flatMap((c) => c.outcomes.map((o) => o.equation)).find((e) => e?.products.some((t) => t.name === 'Diethyl ether'));
    if (equation === undefined) throw new Error('no ether outcome');
    render(<FullEquationView equation={equation} />);
    openDisclosure();
    const line = screen.getByLabelText(/^Full equation:/).textContent ?? '';
    expect(line).toContain('Diethyl ether (major)');
    expect(line).toMatch(/Water \(byproduct\)$/);
    expect(line).not.toMatch(/\(main\)/);
    expect(line).toContain('413 K');
  });
});

describe('FullEquationView: the drawn arrow and the species written once (phone mode B, part 3)', () => {
  it('the arrow is drawn (a line and a head, no "→" character), with the reagents over and the conditions under it', () => {
    const study = familyStudy(demo, 'cls_alcohols') as FamilyStudy;
    const equation = study.reactionsOf.groups
      .flatMap((g) => g.cards)
      .flatMap((c) => c.outcomes.map((o) => o.equation))
      .find((e) => e?.products.some((t) => t.name === 'Diethyl ether'));
    if (equation === undefined) throw new Error('no ether outcome');
    render(<FullEquationView equation={equation} />);
    openDisclosure();
    const arrow = document.querySelector('[data-equation-arrow]') as HTMLElement;
    expect(arrow).not.toBeNull();
    expect(arrow.querySelector('svg path')).not.toBeNull();
    expect(arrow.textContent).not.toContain('→');
    expect(arrow.querySelector('[data-equation-below]')?.textContent).toContain('413 K');
    expect(screen.getByLabelText(/^Full equation:/).textContent).not.toContain('→');
    // the accessible name still reads as an equation
    expect(screen.getByLabelText(/^Full equation: .* → /)).toBeTruthy();
  });

  it('Lindlar: hydrogen is written on the left only; the H2 atmosphere is not repeated under the arrow, the catalyst is over it', () => {
    const study = familyStudy(demo, 'cls_alkenes') as FamilyStudy;
    const card = [...study.reactionsOf.groups, ...study.preparationOf.groups].flatMap((g) => g.cards).find((c) => c.name.toLowerCase().includes('lindlar'));
    const equation = card?.outcomes[0]?.equation;
    if (equation === undefined) throw new Error('no Lindlar card with an equation');
    render(<FullEquationView equation={equation} />);
    openDisclosure();
    expect(screen.getByLabelText(/^Full equation:/).textContent).toContain('Hydrogen');
    expect(document.querySelector('[data-equation-below]')?.textContent ?? '').not.toMatch(/H2|H₂/);
    expect(document.querySelector('[data-equation-above]')?.textContent).toContain('Lindlar');
    // the card's OWN arrow is unchanged: it still carries the atmosphere
    expect(JSON.stringify(card?.outcomes[0]?.arrowText.below)).toMatch(/H2/);
  });

  it('shows the same selectivity word as the card under the product', () => {
    const card = cardNamed('cls_aldehydes', 'Cannizzaro');
    const word = card.outcomes[0]?.products[0]?.selectivity;
    const equation = card.outcomes[0]?.equation;
    if (equation === undefined || word === null || word === undefined) throw new Error('no word');
    render(<FullEquationView equation={equation} />);
    openDisclosure();
    expect(screen.getByLabelText(/^Full equation:/).textContent).toContain(`(both ${word})`);
  });
});
