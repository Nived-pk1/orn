// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListRow, ListRows } from './list-row';

afterEach(cleanup);

describe('ListRow (step 8.4d, Part D): dot or icon, label, sub-line, count, chevron', () => {
  it('a row with an action is one button named by its label; the sub-line and the count are in its description of the row', () => {
    const onOpen = vi.fn();
    render(
      <ListRows label="Go next">
        <ListRow label="Aldehydes" sub="3 reactions" count={3} onOpen={onOpen} dot="oxy" />
      </ListRows>,
    );
    const row = screen.getByRole('button', { name: /Aldehydes/ });
    expect(row.textContent).toContain('3 reactions');
    expect(row.textContent).toContain('3');
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('a row with no action is plain text in a list item (no button, no chevron)', () => {
    const { container } = render(
      <ListRows label="Facts">
        <ListRow label="Formula" sub="C2H6O" />
      </ListRows>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('listitem').textContent).toContain('Formula');
    expect(container.querySelector('[data-chevron]')).toBeNull();
  });

  it('a row with an action has a chevron, drawn from the icon files and hidden from assistive technology', () => {
    const { container } = render(
      <ListRows label="Go next">
        <ListRow label="Ethers" onOpen={() => undefined} />
      </ListRows>,
    );
    const chevron = container.querySelector('[data-chevron]');
    expect(chevron?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows a leading icon when given, and the family dot only when asked for (the word still carries the meaning)', () => {
    const { container } = render(
      <ListRows label="Views">
        <ListRow label="Map" icon="map" />
        <ListRow label="Oxygen" dot="oxy" />
      </ListRows>,
    );
    expect(container.querySelectorAll('span[aria-hidden="true"][style*="/icons/map.svg"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-dot="oxy"]')).toHaveLength(1);
  });

  it('an unavailable row stays focusable, does nothing and says why', () => {
    const onOpen = vi.fn();
    render(
      <ListRows label="Go next">
        <ListRow label="Ethers" onOpen={onOpen} unavailable="no data yet" />
      </ListRows>,
    );
    const row = screen.getByRole('button', { name: /Ethers/ });
    expect(row.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(row);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByText('no data yet')).not.toBeNull();
  });
});
