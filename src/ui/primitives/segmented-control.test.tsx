// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './segmented-control';

afterEach(cleanup);

const OPTIONS = [
  { value: 'skeletal', label: 'Skeletal' },
  { value: 'condensed', label: 'Condensed' },
  { value: 'full', label: 'Full' },
] as const;

function show(value: string, onChange = vi.fn()) {
  render(<SegmentedControl label="Structures" options={OPTIONS} value={value} onChange={onChange} />);
  return onChange;
}

describe('SegmentedControl', () => {
  it('is a radio group with the label, one radio per option, the chosen one checked', () => {
    show('condensed');
    const group = screen.getByRole('radiogroup', { name: 'Structures' });
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.closest('label')?.textContent)).toEqual(['Skeletal', 'Condensed', 'Full']);
    expect(radios.map((r) => r.checked)).toEqual([false, true, false]);
    expect(radios.every((r) => group.contains(r))).toBe(true);
    expect(screen.getByRole('radio', { name: 'Full' })).toBe(radios[2]);
  });

  it('a click chooses; choosing the chosen one says nothing', () => {
    const onChange = show('skeletal');
    fireEvent.click(screen.getByRole('radio', { name: 'Full' }));
    expect(onChange).toHaveBeenCalledWith('full');
    fireEvent.click(screen.getByRole('radio', { name: 'Skeletal' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('is ONE tab stop and the arrow keys work because the radios are native: one shared name, no tabindex set by hand', () => {
    show('skeletal');
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
    expect(radios[0]?.name).not.toBe('');
    expect(radios.every((r) => !r.hasAttribute('tabindex'))).toBe(true);
  });

  it('announces a change in words (a status region), and nothing before the first change', () => {
    const view = render(<SegmentedControl label="Structures" options={OPTIONS} value="skeletal" onChange={() => undefined} />);
    expect(screen.getByRole('status').textContent).toBe('');
    view.rerender(<SegmentedControl label="Structures" options={OPTIONS} value="condensed" onChange={() => undefined} />);
    expect(screen.getByRole('status').textContent).toBe('Structures: Condensed');
  });

  it('two groups on one page do not share their radios', () => {
    render(
      <>
        <SegmentedControl label="First" options={OPTIONS} value="skeletal" onChange={() => undefined} />
        <SegmentedControl label="Second" options={OPTIONS} value="full" onChange={() => undefined} />
      </>,
    );
    const names = (screen.getAllByRole('radio') as HTMLInputElement[]).map((r) => r.name);
    expect(new Set(names).size).toBe(2);
  });
});
