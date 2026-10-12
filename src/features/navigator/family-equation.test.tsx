// @vitest-environment jsdom
/** "Show full equation" on a family card (step 5.9a review, follow-up b): a disclosure with every reactant and every product's role. */
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
  it('is closed by default and says what it opens; Cannizzaro shows 2 Benzaldehyde and both products as main', () => {
    const equation = cardNamed('cls_aldehydes', 'Cannizzaro').outcomes[0]?.equation;
    if (equation === undefined) throw new Error('the card carries no equation');
    render(<FullEquationView equation={equation} />);
    const disclosure = screen.getByText('Show full equation').closest('details');
    expect(disclosure?.open).toBe(false);
    expect(screen.queryByLabelText(/^Full equation:/)).toBeNull();
    openDisclosure();
    expect(screen.getByLabelText(/^Full equation:/).textContent).toContain('2 Benzaldehyde');
    expect(screen.getByLabelText(/^Full equation:/).textContent).toContain('Sodium benzoate (main)');
  });

  it('the 413 K reaction names water as a byproduct and keeps its temperature over the arrow', () => {
    const study = familyStudy(demo, 'cls_alcohols') as FamilyStudy;
    const cards = study.reactionsOf.groups.flatMap((g) => g.cards).filter((c) => c.name.includes('Ethanol + conc.'));
    const equation = cards.flatMap((c) => c.outcomes.map((o) => o.equation)).find((e) => e?.products.some((t) => t.name === 'Diethyl ether'));
    if (equation === undefined) throw new Error('no ether outcome');
    render(<FullEquationView equation={equation} />);
    openDisclosure();
    const line = screen.getByLabelText(/^Full equation:/).textContent ?? '';
    expect(line).toContain('Water (byproduct)');
    expect(line).toContain('413 K');
  });
});
