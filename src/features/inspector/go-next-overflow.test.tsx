// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RecordMenu } from './record-menu';
import { GoNext } from './study-parts';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  const proto = Element.prototype as unknown as { hasPointerCapture?: () => boolean; scrollIntoView?: () => void; releasePointerCapture?: () => void };
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});
afterEach(cleanup);

const actions = ['One', 'Two', 'Three', 'Four'].map((label) => ({ label, run: vi.fn() }));

describe('one record menu (step 8.4g Part B, P1)', () => {
  it('the go-next row has no menu of its own: the actions that do not fit are handed to the record menu', () => {
    const seen: string[][] = [];
    render(<GoNext actions={actions} onOverflow={(rest) => seen.push(rest.map((a) => a.label))} />);
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['One', 'Two', 'Three']);
    expect(seen.at(-1)).toEqual(['Four']);
  });

  it('the record menu lists the handed actions first, then Copy link', async () => {
    render(<RecordMenu refOf={{ kind: 'reaction', id: 'rxn_1' }} name="Aldol" kindWord="Reaction" extra={[(actions[3] as (typeof actions)[number])]} />);
    const trigger = screen.getByRole('button', { name: 'Record menu' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Four', 'Copy link']);
    fireEvent.click((items[0] as HTMLElement));
    expect((actions[3] as (typeof actions)[number]).run).toHaveBeenCalled();
  });
});
