// @vitest-environment jsdom
/** The peek's one-line fallback (step 8.2a A2): it wears the hero card's look, not an input's. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HeroTextCard } from './hero-text-card';

afterEach(cleanup);

describe('HeroTextCard', () => {
  it('shows the words padded and centred, with no frame of its own (the hero wrapper gives border and radius)', () => {
    render(<HeroTextCard text="Ethanol → Ethanal (exclusive)" />);
    const card = screen.getByText('Ethanol → Ethanal (exclusive)');
    expect(card.getAttribute('data-hero-text')).toBe('');
    expect(card.style.border).toBe('');
    expect(card.style.borderRadius).toBe('');
    expect(card.style.textAlign).toBe('center');
    expect(card.style.padding).toContain('--space-2');
    expect(card.tagName).toBe('P');
  });
});
