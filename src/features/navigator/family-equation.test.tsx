// @vitest-environment jsdom
/**
 * "Show full equation" on a card (equation step, part 5; before: step 5.9a review, follow-up b, phone mode B part 3): the textbook scheme.
 * Every reactant a column with its coefficient, the arrow (reagents over, conditions under), every product with the card's word. The
 * accessible DESCRIPTION of the scheme is the one-line sentence the equation used to be, so a screen reader reads the same words.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { familyStudy, type FamilyCard, type FamilyStudy } from '@/core/graph';
import { createDepictionBinding, type DepictionPort } from '@/render/svg';
import { EQUATION_AREA, type StructureFactsPort } from '@/render/equation';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';
import { manualTimers } from '@/test-support/navigator-kit';
import type { NavigatorStructures } from './contracts';
import { FamilyEnvContext, type FamilyEnv } from './family-env';
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
const scheme = (): HTMLElement => screen.getByRole('group', { name: 'Full equation' });
const describedAs = (): string => document.getElementById(scheme().getAttribute('aria-describedby') as string)?.textContent ?? '';

describe('FullEquationView', () => {
  it('is closed by default and says what it opens; Cannizzaro: 2 Benzaldehyde, both products, the card\'s word once', () => {
    const equation = cardNamed('cls_aldehydes', 'Cannizzaro').outcomes[0]?.equation;
    if (equation === undefined) throw new Error('the card carries no equation');
    render(<FullEquationView equation={equation} />);
    const disclosure = screen.getByText('Show full equation').closest('details');
    expect(disclosure?.open).toBe(false);
    expect(screen.queryByRole('group', { name: 'Full equation' })).toBeNull();
    openDisclosure();
    // the old sentence is the accessible description
    expect(describedAs()).toBe('2 Benzaldehyde → Benzyl alcohol + Sodium benzoate (both exclusive)');
    expect(screen.getByRole('group', { name: 'Full equation', description: /^2 Benzaldehyde → / })).toBeTruthy();
    expect(document.querySelector('[data-equation-coefficient]')?.textContent).toBe('2');
    expect(within(scheme()).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['2 Benzaldehyde', 'Benzyl alcohol', 'Sodium benzoate']);
    expect([...document.querySelectorAll('[data-equation-word]')].map((el) => el.textContent)).toEqual(['(both exclusive)']); // once
  });

  it('the 413 K reaction lists water with its role word and keeps its temperature under the drawn arrow', () => {
    const study = familyStudy(demo, 'cls_alcohols') as FamilyStudy;
    const cards = study.reactionsOf.groups.flatMap((g) => g.cards).filter((c) => c.name.includes('Ethanol + conc.'));
    const equation = cards.flatMap((c) => c.outcomes.map((o) => o.equation)).find((e) => e?.products.some((t) => t.name === 'Diethyl ether'));
    if (equation === undefined) throw new Error('no ether outcome');
    render(<FullEquationView equation={equation} />);
    openDisclosure();
    expect(describedAs()).toContain('Diethyl ether (major)');
    expect(describedAs()).toMatch(/Water \(byproduct\)$/);
    expect(describedAs()).not.toMatch(/\(main\)/);
    expect([...document.querySelectorAll('[data-equation-word]')].map((el) => el.textContent)).toEqual(['(major)', '(byproduct)']);
    expect(document.querySelector('[data-equation-below]')?.textContent).toContain('413 K');
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
    expect(describedAs()).toMatch(/ → /); // the sentence still reads as an equation
  });

  it('Lindlar: hydrogen is written on the left only (as the formula H2); the H2 atmosphere is not repeated under the arrow, the catalyst is over it', () => {
    const study = familyStudy(demo, 'cls_alkenes') as FamilyStudy;
    const card = [...study.reactionsOf.groups, ...study.preparationOf.groups].flatMap((g) => g.cards).find((c) => c.name.toLowerCase().includes('lindlar'));
    const equation = card?.outcomes[0]?.equation;
    if (equation === undefined) throw new Error('no Lindlar card with an equation');
    render(<FullEquationView equation={equation} />);
    openDisclosure();
    const hydrogen = screen.getByRole('group', { name: 'Hydrogen' });
    expect(hydrogen.textContent).toContain('H');
    expect(hydrogen.querySelector('sub')?.textContent).toBe('2');
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
    expect(describedAs()).toContain(`(both ${word})`);
  });

  it('a reaction stored as an equilibrium has the equilibrium arrow, the others one arrow', () => {
    const study = familyStudy(demo, 'cls_alcohols') as FamilyStudy;
    const equations = [...study.reactionsOf.groups, ...study.preparationOf.groups].flatMap((g) => g.cards).flatMap((c) => c.outcomes.map((o) => o.equation));
    const equilibrium = equations.find((e) => e?.equilibrium === true);
    const plain = equations.find((e) => e?.equilibrium === false);
    if (equilibrium === undefined || plain === undefined) throw new Error('the demo has both kinds');
    render(<FullEquationView equation={equilibrium} />);
    openDisclosure();
    expect(document.querySelector('[data-equation-arrow]')?.hasAttribute('data-equilibrium')).toBe(true);
    cleanup();
    render(<FullEquationView equation={plain} />);
    openDisclosure();
    expect(document.querySelector('[data-equation-arrow]')?.hasAttribute('data-equilibrium')).toBe(false);
  });
});

describe('FullEquationView with the page\'s ports: the Names switch, the facts and the drawings', () => {
  function envWith(names: { value: boolean }) {
    const timers = manualTimers();
    const listeners = new Set<() => void>();
    const asked: string[] = [];
    const port: DepictionPort = {
      keyOf: (s, _z, mode) => `${s.value}#${mode ?? 'skeletal'}`,
      depict: (s) => (asked.push(s.value), Promise.resolve({ ok: true as const, svg: '<svg/>', width: 300, height: 120 })),
      cancel: () => undefined,
      createUrl: () => 'blob:drawn',
      revokeUrl: () => undefined,
    };
    const facts: StructureFactsPort = { factsOf: () => Promise.resolve({ ok: true as const, heavyAtomCount: 6, carbonCount: 6 }) };
    const structures: NavigatorStructures = {
      mode: () => 'skeletal',
      setMode: () => undefined,
      equationNames: () => names.value,
      setEquationNames: (value) => {
        names.value = value;
        listeners.forEach((l) => l());
      },
      subscribe: (l) => (listeners.add(l), () => void listeners.delete(l)),
    };
    const env: FamilyEnv = {
      describe: () => undefined,
      keyOf: () => undefined,
      manager: undefined,
      timers,
      equation: { binding: createDepictionBinding(port, timers, EQUATION_AREA), facts, structures },
    };
    return { env, asked };
  }

  it('the "Names" switch is in the equation\'s header, on by default; off hides the name lines only, and it follows the setting', async () => {
    const names = { value: true };
    const { env } = envWith(names);
    const equation = cardNamed('cls_aldehydes', 'Cannizzaro').outcomes[0]?.equation;
    if (equation === undefined) throw new Error('no equation');
    render(
      <FamilyEnvContext.Provider value={env}>
        <FullEquationView equation={equation} />
      </FamilyEnvContext.Provider>,
    );
    openDisclosure();
    await act(async () => void (await Promise.resolve()));
    expect(document.querySelectorAll('[data-equation-name]').length).toBeGreaterThan(0);
    const box = screen.getByRole('checkbox', { name: 'Names' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(names.value).toBe(false);
    expect(document.querySelectorAll('[data-equation-name]')).toHaveLength(0);
    expect(screen.getByRole('group', { name: '2 Benzaldehyde' })).toBeTruthy(); // the aria-label stays
    fireEvent.click(screen.getByRole('checkbox', { name: 'Names' }));
    expect(names.value).toBe(true);
    expect(document.querySelectorAll('[data-equation-name]').length).toBeGreaterThan(0);
  });

  it('a species with a structure is drawn at the fixed scale through the page\'s binding', async () => {
    const { env, asked } = envWith({ value: true });
    const equation = cardNamed('cls_aldehydes', 'Cannizzaro').outcomes[0]?.equation;
    if (equation === undefined) throw new Error('no equation');
    render(
      <FamilyEnvContext.Provider value={env}>
        <FullEquationView equation={equation} />
      </FamilyEnvContext.Provider>,
    );
    openDisclosure();
    for (let i = 0; i < 12; i += 1) await act(async () => void (await Promise.resolve()));
    expect(asked.length).toBeGreaterThan(0);
    const picture = within(screen.getByRole('group', { name: '2 Benzaldehyde' })).getByRole('img', { name: 'Structure of Benzaldehyde' });
    expect(Number(picture.getAttribute('data-bond-px'))).toBeGreaterThan(0);
  });
});
