// @vitest-environment jsdom
/** The phone map's floating buttons (step 6.9, Z2): while the Select bar is shown they move out of its way (to the top), never half covered. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PhoneMapControls } from './phone-map-controls';

afterEach(cleanup);

const show = (barShown?: boolean) => render(<PhoneMapControls controller={null} items={[]} keys={{ lines: false, chip: false, pair: false, within: false, unclassified: undefined }} {...(barShown === undefined ? {} : { barShown })} />);

describe('PhoneMapControls', () => {
  it('Z2: the floating buttons move to the top while the Select bar is shown', () => {
    show(true);
    expect(screen.getByRole('button', { name: 'Fit' }).parentElement?.getAttribute('data-bar')).toBe('shown');
  });
  it('they stay at the bottom without the bar', () => {
    show();
    expect(screen.getByRole('button', { name: 'Fit' }).parentElement?.getAttribute('data-bar')).toBeNull();
  });
  it('8.4g G12: the round Fit button says whether the automatic fit is on (aria-pressed, pressed look, the same tooltip words)', () => {
    const { rerender } = render(<PhoneMapControls controller={null} items={[]} keys={{ lines: false, chip: false, pair: false, within: false, unclassified: undefined }} fitted />);
    const fit = screen.getByRole('button', { name: 'Fit' });
    expect(fit.getAttribute('aria-pressed')).toBe('true');
    expect(fit.getAttribute('title')).toBe('Fit is on: the map follows the window');
    rerender(<PhoneMapControls controller={null} items={[]} keys={{ lines: false, chip: false, pair: false, within: false, unclassified: undefined }} fitted={false} />);
    expect(screen.getByRole('button', { name: 'Fit' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Fit' }).getAttribute('title')).toBe('Fit: show the whole map');
  });
});
