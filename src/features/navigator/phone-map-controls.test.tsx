// @vitest-environment jsdom
/** The phone map's floating buttons (step 6.9, Z2): while the Select bar is shown they move out of its way (to the top), never half covered. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PhoneMapControls } from './phone-map-controls';

afterEach(cleanup);

const show = (barShown?: boolean) => render(<PhoneMapControls controller={null} items={[]} keys={{} as never} {...(barShown === undefined ? {} : { barShown })} />);

describe('PhoneMapControls', () => {
  it('Z2: the floating buttons move to the top while the Select bar is shown', () => {
    show(true);
    expect(screen.getByRole('button', { name: 'Fit' }).parentElement?.getAttribute('data-bar')).toBe('shown');
  });
  it('they stay at the bottom without the bar', () => {
    show();
    expect(screen.getByRole('button', { name: 'Fit' }).parentElement?.getAttribute('data-bar')).toBeNull();
  });
});
