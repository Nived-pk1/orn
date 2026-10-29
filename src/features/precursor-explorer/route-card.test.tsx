// @vitest-environment jsdom
/**
 * 7.2b A4: a route's step is ONE block with the same three lines in a found and a saved route: line 1 "1. A → B" (bold), line 2 the
 * reaction link and, at the end, "Show the reaction", line 3 the conditions in the card's formula typography (H₃O⁺, never raw text).
 * A found route's heading has the weight and size of a saved route's name.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrecursorPorts } from './contracts';
import type { RouteView } from './model';
import { RouteCard } from './route-card';

afterEach(cleanup);

const ports: Pick<PrecursorPorts, 'select' | 'renderCard'> = { select: vi.fn(), renderCard: () => null };
const step = { n: 1, reactionId: 'rxn_x', reactionName: 'Hydration', from: 'Ethene', to: 'Ethanol', arrow: 'H3O+; 298 K', arrowAbove: [{ text: 'H3O+', kind: 'formula' as const }], arrowBelow: [{ text: '298 K', kind: 'condition' as const }], warnings: [] };
const found: RouteView = { key: 'k1', heading: '1 step from Ethene', steps: [step] };
const saved: RouteView = { key: 'rte_a', name: 'Ethene to ethanol', heading: '1 step', steps: [step] };

describe('a route step', () => {
  it('is one block: the title line, then the reaction link with "Show the reaction" last, then the conditions', () => {
    render(<RouteCard route={found} ports={ports} selected={null} />);
    const block = document.querySelector('li[data-step="1"]') as HTMLElement;
    const lines = [...block.children];
    expect(lines.map((line) => line.getAttribute('data-line'))).toEqual(['title', 'reaction', 'conditions']);
    expect(lines[0]?.textContent).toBe('1. Ethene → Ethanol');
    const reaction = within(lines[1] as HTMLElement);
    expect(reaction.getByRole('button', { name: 'Hydration' })).toBeTruthy();
    expect([...(lines[1] as HTMLElement).querySelectorAll('button')].pop()?.textContent).toBe('Show the reaction');
  });

  it('draws the conditions with formula typography, not raw text', () => {
    render(<RouteCard route={found} ports={ports} selected={null} />);
    const conditions = document.querySelector('[data-line="conditions"]') as HTMLElement;
    expect(conditions.querySelector('sub')?.textContent).toBe('3');
    expect(conditions.querySelector('sup')?.textContent).toBe('+');
    expect(conditions.textContent).toContain('298 K');
  });

  it('a step with no conditions has no conditions line', () => {
    render(<RouteCard route={{ ...found, steps: [{ ...step, arrow: '', arrowAbove: [], arrowBelow: [] }] }} ports={ports} selected={null} />);
    expect(document.querySelector('[data-line="conditions"]')).toBeNull();
  });
});

describe('a route heading', () => {
  it('a found route\'s heading is the same element, class and level as a saved route\'s name', () => {
    render(<RouteCard route={found} ports={ports} selected={null} />);
    render(<RouteCard route={saved} ports={ports} selected={null} />);
    const first = screen.getByRole('heading', { name: '1 step from Ethene' });
    const second = screen.getByRole('heading', { name: 'Ethene to ethanol' });
    expect(first.tagName).toBe(second.tagName);
    expect(first.className).toBe(second.className);
  });
});
