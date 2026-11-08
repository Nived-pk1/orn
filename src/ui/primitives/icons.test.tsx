// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Icon } from './icons';

afterEach(cleanup);

describe('Icon (step 8.4d, Part B): a vendored SVG file drawn through a CSS mask', () => {
  it('is a hidden span, not markup: the mask URL points at /icons/<name>.svg and the colour is currentColor', () => {
    const { container } = render(<Icon name="search" />);
    const icon = container.firstElementChild as HTMLElement;
    expect(icon.tagName).toBe('SPAN');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.children).toHaveLength(0);
    expect(icon.textContent).toBe('');
    expect(icon.style.getPropertyValue('mask-image') || icon.style.getPropertyValue('-webkit-mask-image')).toContain('/icons/search.svg');
    expect(icon.style.backgroundColor).toBe('currentcolor');
  });

  it('is 16 px by default and 20 px when asked; no other size', () => {
    const { container, rerender } = render(<Icon name="map" />);
    const icon = (): HTMLElement => container.firstElementChild as HTMLElement;
    expect([icon().style.width, icon().style.height]).toEqual(['16px', '16px']);
    rerender(<Icon name="map" size={20} />);
    expect([icon().style.width, icon().style.height]).toEqual(['20px', '20px']);
  });
});
