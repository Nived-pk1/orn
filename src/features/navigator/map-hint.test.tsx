// @vitest-environment jsdom
/** The top-left corner inside the map (step 8.3b, A4, B2.2): the hint when nothing is selected; "Selected: A → B" with a ✕ that clears it. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapHint } from './map-hint';

afterEach(cleanup);

describe('MapHint', () => {
  it('nothing selected: the quiet hint, marked for tests, with no button', () => {
    const { container } = render(<MapHint selected={undefined} onClear={() => undefined} hint="Tap or click a family" hintKind="quiet" />);
    expect(container.querySelector('[data-map-quiet]')?.textContent).toBe('Tap or click a family');
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('the busy-chapter text is marked as busy', () => {
    const { container } = render(<MapHint selected={undefined} onClear={() => undefined} hint="This chapter has 30 arrows." hintKind="busy" />);
    expect(container.querySelector('[data-map-busy]')).not.toBeNull();
  });
  it('a selection replaces the hint: "Selected: Alcohols → Haloalkanes" and a ✕ that clears it (click and Esc)', () => {
    const onClear = vi.fn();
    const { container } = render(<MapHint selected="Selected: Alcohols → Haloalkanes" onClear={onClear} hint="Tap or click a family" hintKind="quiet" />);
    expect(container.querySelector('[data-map-selected]')?.textContent).toBe('Selected: Alcohols → Haloalkanes');
    expect(container.querySelector('[data-map-quiet]')).toBeNull();
    const clear = screen.getByRole('button', { name: 'Clear the selection' });
    fireEvent.click(clear);
    fireEvent.keyDown(clear, { key: 'Escape' });
    expect(onClear).toHaveBeenCalledTimes(2);
  });
  it('"Zoom to selection" is a magnifier with a plus (inline SVG, 16 px), not a text glyph', () => {
    const onZoom = vi.fn();
    render(<MapHint selected="Selected: Alcohols" onClear={() => undefined} onZoom={onZoom} zoomName="Alcohols" hint={undefined} hintKind={undefined} />);
    const zoom = screen.getByRole('button', { name: 'Zoom to Alcohols' });
    const svg = zoom.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('16');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(zoom.textContent).toBe('');
    fireEvent.click(zoom);
    expect(onZoom).toHaveBeenCalledTimes(1);
  });
  it('nothing to say: nothing is drawn', () => {
    const { container } = render(<MapHint selected={undefined} onClear={() => undefined} hint={undefined} hintKind={undefined} />);
    expect(container.textContent).toBe('');
  });
});
